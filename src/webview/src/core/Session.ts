import { signal, computed, effect } from 'alien-signals';
import type { BaseTransport, WorkspaceInfo } from '../transport/BaseTransport';
import type { PermissionRequest } from './PermissionRequest';
import type { ModelOption } from '../../../shared/messages';
import type { SessionSummary } from './types';
import type { PermissionMode } from '../../../shared/permissions';
import { processAndAttachMessage, clearToolUseCache /*, mergeConsecutiveReadMessages */ } from '../utils/messageUtils';
import { Message as MessageModel } from '../models/Message';
import type { Message } from '../models/Message';
import { ContentBlockWrapper } from '../models/ContentBlockWrapper';
import type { WorkspaceChangedBlock } from '../models/ContentBlock';

export interface SelectionRange {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn?: number;
  endColumn?: number;
  selectedText?: string;
}

export interface UsageData {
  totalTokens: number;
  totalCost: number;
  contextWindow: number;
  // 本次会话累计
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionCacheReadTokens: number;
  sessionCacheCreationTokens: number;
  lastSyncTime: number;
}

export interface AttachmentPayload {
  fileName: string;
  mediaType: string;
  data: string;
  fileSize?: number;
}

/**
 * Todo 项目接口
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

const IMAGE_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

export interface SessionOptions {
  isExplicit?: boolean;
  existingWorktree?: { name: string; path: string };
  resumeId?: string;
}

export interface SessionContext {
  currentSelection: ReturnType<typeof signal<SelectionRange | undefined>>;
  commandRegistry: { registerAction: (...args: any[]) => void };
  fileOpener: {
    open: (filePath: string, location?: any) => Promise<void> | void;
    openContent: (
      content: string,
      fileName: string,
      editable: boolean
    ) => Promise<string | undefined>;
  };
  showNotification?: (
    message: string,
    severity: 'info' | 'warning' | 'error',
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ) => Promise<string | undefined>;
  startNewConversationTab?: (initialPrompt?: string) => boolean;
  renameTab?: (title: string) => boolean;
  openURL?: (url: string) => void;
}

export class Session {
  private readonly claudeChannelId = signal<string | undefined>(undefined);
  private currentConnectionPromise?: Promise<BaseTransport>;
  private lastSentSelection?: SelectionRange;
  private effectCleanup?: () => void;

  // 消息活动超时检测
  private lastMessageTime: number = 0;
  private activityCheckTimer?: ReturnType<typeof setInterval>;
  private readonly ACTIVITY_TIMEOUT_MS = 30000; // 30秒无消息则认为卡住
  private readonly ACTIVITY_CHECK_INTERVAL = 5000; // 每5秒检查一次

  readonly connection = signal<BaseTransport | undefined>(undefined);

  readonly busy = signal(false);
  readonly isLoading = signal(false);
  readonly taskJustCompleted = signal(false);  // 任务刚完成，用于显示完成提示（直到用户发新消息）
  readonly error = signal<string | undefined>(undefined);
  readonly sessionId = signal<string | undefined>(undefined);
  readonly isExplicit = signal(false);
  readonly lastModifiedTime = signal<number>(Date.now());
  readonly messages = signal<Message[]>([]);
  readonly messageCount = signal<number>(0);
  readonly cwd = signal<string | undefined>(undefined);
  readonly permissionMode = signal<PermissionMode>('acceptEdits');
  readonly summary = signal<string | undefined>(undefined);
  readonly modelSelection = signal<string | undefined>(undefined);
  readonly thinkingLevel = signal<string>('off');
  readonly todos = signal<any[]>([]);
  readonly worktree = signal<{ name: string; path: string } | undefined>(undefined);
  readonly selection = signal<SelectionRange | undefined>(undefined);
  readonly isCompacting = signal(false);  // 上下文压缩状态
  readonly isSummarizing = signal(false); // 摘要生成状态
  readonly isExporting = signal(false);   // 导出总结状态
  readonly disableResume = signal(true);  // 禁用 session resume（默认禁用，避免 InputValidationError）

  // 无尽模式状态
  readonly endlessMode = signal(false);   // 是否开启无尽模式
  readonly endlessMaxRounds = signal(10); // 最大执行次数（默认10，最大1000）
  readonly endlessCurrentRound = signal(0); // 当前执行次数
  readonly endlessPrompt = signal('检查前后端数据连接是否一致，前端是否有未完善的功能，检查美工是否精致好看'); // 无尽模式提示词

  readonly usageData = signal<UsageData>({
    totalTokens: 0,
    totalCost: 0,
    contextWindow: 200000,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadTokens: 0,
    sessionCacheCreationTokens: 0,
    lastSyncTime: Date.now()
  });

  // 已移除自动同步定时器，改为只在启动/结束会话时同步一次

  readonly claudeConfig = computed(() => {
    const conn = this.connection();
    return conn?.claudeConfig?.();
  });

  readonly config = computed(() => {
    const conn = this.connection();
    return conn?.config?.();
  });

  readonly permissionRequests = computed<PermissionRequest[]>(() => {
    const conn = this.connection();
    const channelId = this.claudeChannelId();
    const hasPromise = !!this.currentConnectionPromise;
    console.log('[Session] permissionRequests computed - conn:', !!conn, 'channelId:', channelId, 'hasPromise:', hasPromise);
    if (!conn || !channelId) {
      console.log('[Session] permissionRequests 返回空数组 - 缺少 conn 或 channelId');
      return [];
    }

    const allRequests = conn.permissionRequests();
    console.log('[Session] 所有 permissionRequests:', allRequests.length, allRequests.map(r => ({ channelId: r.channelId, toolName: r.toolName })));

    const filtered = allRequests.filter((request) => request.channelId === channelId);
    console.log('[Session] 过滤后 permissionRequests:', filtered.length);
    return filtered;
  });

  isOffline(): boolean {
    return (
      !this.connection() &&
      !!this.sessionId() &&
      this.messages().length === 0 &&
      !this.currentConnectionPromise
    );
  }

  constructor(
    private readonly connectionProvider: () => Promise<BaseTransport>,
    private readonly context: SessionContext,
    options: SessionOptions = {}
  ) {
    this.isExplicit(options.isExplicit ?? true);

    effect(() => {
      this.selection(this.context.currentSelection());
    });
  }

  static fromServer(
    summary: SessionSummary,
    connectionProvider: () => Promise<BaseTransport>,
    context: SessionContext
  ): Session {
    const session = new Session(connectionProvider, context, { isExplicit: true });
    session.sessionId(summary.id);
    session.lastModifiedTime(summary.lastModified);
    session.summary(summary.summary);
    session.worktree(summary.worktree);
    session.messageCount(summary.messageCount ?? 0);  // 保存服务器返回的消息数量
    return session;
  }

  async getConnection(): Promise<BaseTransport> {
    const current = this.connection();
    if (current) {
      return current;
    }
    if (this.currentConnectionPromise) {
      return this.currentConnectionPromise;
    }

    this.currentConnectionPromise = this.connectionProvider().then((conn) => {
      this.connection(conn);
      return conn;
    });

    return this.currentConnectionPromise;
  }

  async preloadConnection(): Promise<void> {
    await this.getConnection();
    await this.launchClaude();
  }

  async loadFromServer(): Promise<void> {
    const sessionId = this.sessionId();
    if (!sessionId) return;

    this.isLoading(true);
    try {
      // 🚀 性能优化：加载新会话前清除 toolUse 缓存
      clearToolUseCache();

      const connection = await this.getConnection();
      const response = await connection.getSession(sessionId);
      const accumulator: Message[] = [];
      for (const raw of response?.messages ?? []) {
        this.processMessage(raw);
        // 使用 processAndAttachMessage 来绑定 tool_result
        // 这样历史消息中的 tool_result 也会正确绑定到 tool_use
        processAndAttachMessage(accumulator, raw);
      }
      // 移除 ReadCoalesced 合并逻辑
      // this.messages(mergeConsecutiveReadMessages(accumulator));
      this.messages(accumulator);
      await this.launchClaude();
    } finally {
      this.isLoading(false);
    }
  }

  async send(
    input: string,
    attachments: AttachmentPayload[] = [],
    includeSelection = false
  ): Promise<void> {
    const connection = await this.getConnection();

    // 官方路线：不在 slash 命令时临时切换 thinkingLevel，保持会话一致性，
    // 由 SDK/服务端在 assistant 消息中提供 thinking/redacted_thinking 块以满足约束
    const isSlash = this.isSlashCommand(input);

    // 启动 channel（确保已带上当前 thinkingLevel）
    await this.launchClaude();

    const shouldIncludeSelection = includeSelection && !isSlash;
    let selectionPayload: SelectionRange | undefined;

    if (shouldIncludeSelection && !this.isSameSelection(this.lastSentSelection, this.selection())) {
      selectionPayload = this.selection();
      this.lastSentSelection = selectionPayload;
    }

    const userMessage = this.buildUserMessage(input, attachments, selectionPayload);
    const messageModel = MessageModel.fromRaw(userMessage);

    if (messageModel) {
      this.messages([...this.messages(), messageModel]);
    }

    if (!this.summary()) {
      this.summary(input);
    }
    this.isExplicit(false);
    this.lastModifiedTime(Date.now());
    this.busy(true);

    // 启动活动检测，防止工具调用后卡住
    this.startActivityCheck();

    try {
      const channelId = this.claudeChannelId();
      if (!channelId) throw new Error('No active channel');
      connection.sendInput(channelId, userMessage, false);
    } catch (error) {
      this.busy(false);
      throw error;
    }
  }

  async launchClaude(): Promise<string> {
    const existingChannel = this.claudeChannelId();
    if (existingChannel) {
      return existingChannel;
    }

    this.error(undefined);

    // 🔧 修复：先建立连接，再设置 channelId
    // 这样 permissionRequests computed 在访问时 connection 已经存在
    // 避免因 connection 为 undefined 导致权限弹窗不显示的问题
    const connection = await this.getConnection();

    const channelId = Math.random().toString(36).slice(2);
    this.claudeChannelId(channelId);

    if (!this.cwd()) {
      this.cwd(connection.config()?.defaultCwd);
    }

    if (!this.modelSelection()) {
      this.modelSelection(connection.config()?.modelSetting);
    }

    if (!this.thinkingLevel()) {
      this.thinkingLevel(connection.config()?.thinkingLevel || 'off');
    }

    // 根据 disableResume 选项决定是否传递 sessionId
    // 禁用 resume 可以避免重放旧的工具调用导致的 InputValidationError
    // 任务状态已持久化到 .tasks/current.md，不需要依赖 session resume
    const resumeId = this.disableResume() ? undefined : (this.sessionId() ?? undefined);

    if (this.disableResume() && this.sessionId()) {
      console.log('[Session] disableResume=true, 跳过 session resume，启动全新会话');
    }

    const stream = connection.launchClaude(
      channelId,
      resumeId,
      this.cwd() ?? undefined,
      this.modelSelection() ?? undefined,
      this.permissionMode(),
      this.thinkingLevel()
    );

    // 只在启动会话时同步一次 usage（不再使用定时器自动同步）
    this.syncUsageToBackend().catch(err => {
      console.warn('[Session] Failed to sync usage on launch:', err);
    });

    void this.readMessages(stream);
    return channelId;
  }

  async interrupt(): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }
    const connection = await this.getConnection();
    connection.interruptClaude(channelId);
    // 清除 channelId，这样下次发送消息时会创建新的 channel
    // 避免向已关闭的 channel 发送消息导致错误
    this.claudeChannelId(undefined);
    // 立即解除 busy 状态，确保 UI 响应
    // 不依赖后端发送的 result 消息，因为消息可能延迟或丢失
    this.busy(false);
  }

  async restartClaude(): Promise<void> {
    await this.interrupt();
    // interrupt() 已清除 claudeChannelId 和设置 busy(false)
    await this.launchClaude();
  }

  async listFiles(pattern?: string, signal?: AbortSignal): Promise<any> {
    const connection = await this.getConnection();
    return connection.listFiles(pattern, signal);
  }

  async setPermissionMode(mode: PermissionMode, applyToConnection = true): Promise<boolean> {
    const previous = this.permissionMode();
    this.permissionMode(mode);

    const channelId = this.claudeChannelId();
    if (!channelId || !applyToConnection) {
      return true;
    }
    const connection = await this.getConnection();
    const success = await connection.setPermissionMode(channelId, mode);
    if (!success) {
      this.permissionMode(previous);
    }
    return success;
  }

  async setModel(model: ModelOption): Promise<boolean> {
    const previous = this.modelSelection();
    const newModel = model.value;

    console.log(`[Session.setModel] 切换模型: ${previous} -> ${newModel}`);

    this.modelSelection(newModel);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      console.log(`[Session.setModel] 无活跃 channel，模型将在下次启动时生效`);
      return true;
    }

    console.log(`[Session.setModel] 发送 setModel 请求到 channel: ${channelId}`);

    const connection = await this.getConnection();
    const response = await connection.setModel(channelId, model);

    if (!response?.success) {
      console.error(`[Session.setModel] setModel 失败，回滚到: ${previous}`);
      this.modelSelection(previous);
      return false;
    }

    console.log(`[Session.setModel] 模型切换成功: ${newModel}`);
    return true;
  }

  async setThinkingLevel(level: string): Promise<void> {
    this.thinkingLevel(level);

    const channelId = this.claudeChannelId();
    if (!channelId) {
      return;
    }

    const connection = await this.getConnection();
    await connection.setThinkingLevel(channelId, level);
  }

  async getMcpServers(): Promise<any> {
    const connection = await this.getConnection();
    const channelId = await this.launchClaude();
    return connection.getMcpServers(channelId);
  }

  async openConfigFile(configType: string): Promise<void> {
    const connection = await this.getConnection();
    await connection.openConfigFile(configType);
  }

  /**
   * 更新工作目录
   * @param newCwd 新的工作目录
   * @param restartIfActive 如果有活跃的 Claude 会话，是否重启
   * @param workspaceFolders 工作区文件夹列表（可选）
   */
  async updateCwd(newCwd: string, restartIfActive = false, workspaceFolders?: Array<{ name: string; path: string }>): Promise<void> {
    const oldCwd = this.cwd();
    if (oldCwd === newCwd) {
      return;
    }

    this.cwd(newCwd);
    console.log(`[Session] 工作目录已更新: ${oldCwd} -> ${newCwd}`);

    // 添加工作区变化提示消息到对话中
    this.addWorkspaceChangedMessage(newCwd, workspaceFolders || []);

    // 如果有活跃的 Claude 会话且需要重启
    if (restartIfActive && this.claudeChannelId()) {
      console.log('[Session] 检测到活跃会话，正在重启 Claude...');
      await this.restartClaude();
    }
  }

  /**
   * 添加工作区变化提示消息
   */
  private addWorkspaceChangedMessage(newCwd: string, workspaceFolders: Array<{ name: string; path: string }>): void {
    const workspaceBlock: WorkspaceChangedBlock = {
      type: 'workspace_changed',
      newCwd,
      workspaceFolders
    };

    const wrappedContent = [new ContentBlockWrapper(workspaceBlock)];

    const message = new MessageModel(
      'tip',
      {
        role: 'system',
        content: wrappedContent
      },
      Date.now()
    );

    this.messages([...this.messages(), message]);
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): () => void {
    const connection = this.connection();
    if (!connection) {
      return () => { };
    }

    return connection.permissionRequested.add((request) => {
      // 动态获取当前 channelId，避免闭包捕获旧值
      if (request.channelId === this.claudeChannelId()) {
        callback(request);
      }
    });
  }

  dispose(): void {
    // 停止活动检测定时器
    this.stopActivityCheck();

    // 已移除自动同步定时器，无需停止
    // 同步最终 usage（异步，不阻塞）
    this.syncUsageToBackend().catch(err => {
      console.warn('[Session] Failed to sync final usage on dispose:', err);
    });

    if (this.effectCleanup) {
      this.effectCleanup();
    }
  }

  /**
   * 启动活动检测定时器
   * 当 busy 状态下长时间没有收到消息时，自动发送继续消息
   */
  private startActivityCheck(): void {
    // 如果已有定时器，不重复启动
    if (this.activityCheckTimer) {
      return;
    }

    this.lastMessageTime = Date.now();
    console.log('[Session] 启动活动检测定时器');

    this.activityCheckTimer = setInterval(() => {
      // 只在 busy 状态下检测
      if (!this.busy()) {
        return;
      }

      const elapsed = Date.now() - this.lastMessageTime;
      if (elapsed > this.ACTIVITY_TIMEOUT_MS) {
        console.log(`[Session] 检测到 ${elapsed / 1000}s 无消息，可能卡住，尝试自动继续...`);
        this.sendContinue();
        // 重置时间，避免连续发送
        this.lastMessageTime = Date.now();
      }
    }, this.ACTIVITY_CHECK_INTERVAL);
  }

  /**
   * 停止活动检测定时器
   */
  private stopActivityCheck(): void {
    if (this.activityCheckTimer) {
      console.log('[Session] 停止活动检测定时器');
      clearInterval(this.activityCheckTimer);
      this.activityCheckTimer = undefined;
    }
  }

  /**
   * 发送继续消息
   * 当检测到可能卡住时，自动发送一个继续消息触发 Claude 继续响应
   */
  private async sendContinue(): Promise<void> {
    const channelId = this.claudeChannelId();
    if (!channelId) {
      console.log('[Session] sendContinue: 无活跃 channel，跳过');
      return;
    }

    try {
      const connection = await this.getConnection();
      const continueMessage = {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [{ type: 'text', text: '继续' }]
        }
      };

      console.log('[Session] 发送自动继续消息');
      connection.sendInput(channelId, continueMessage, false);
    } catch (error) {
      console.error('[Session] sendContinue 失败:', error);
    }
  }

  private async readMessages(stream: AsyncIterable<any>): Promise<void> {
    try {
      for await (const event of stream) {
        this.processIncomingMessage(event);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 检查是否是 API Key 未配置的错误
      const isApiKeyError = errorMsg.toLowerCase().includes('api key') ||
        errorMsg.toLowerCase().includes('apikey') ||
        errorMsg.toLowerCase().includes('未配置');

      if (isApiKeyError) {
        const friendlyMsg = `⚠️ API Key 未配置

请先在设置中配置您的 API Key：

1. 点击左侧边栏的 ⚙️ 设置按钮
2. 在 "API Key" 输入框中填入您的 API Key
3. 点击保存后重新发送消息

如果您还没有 API Key，可以前往 http://ai.moono.vip 申请。`;

        this.error(friendlyMsg);
        this.busy(false);
        this.claudeChannelId(undefined);
        return;
      }

      // 检查是否是 InputValidationError（工具参数验证失败）
      const isValidationError = errorMsg.toLowerCase().includes('inputvalidationerror') ||
        errorMsg.toLowerCase().includes('required parameter');

      if (isValidationError) {
        // InputValidationError：显示友好的错误消息并提示用户重新开启会话
        const friendlyMsg = `⚠️ 工具调用参数错误

${errorMsg}

**会话已关闭**。这是因为 Claude 在调用工具时缺少必需的参数。

请点击"新建会话"按钮重新开始，或者继续当前对话（会自动创建新会话）。`;

        this.error(friendlyMsg);
        this.busy(false);
        this.claudeChannelId(undefined);
        return;
      }

      // 过滤掉其他无意义的错误消息
      const ignoredPatterns = [
        'no content',
        'no body',
        'no status code',
        'aborted',
        'cancelled',
        'canceled'
      ];
      const shouldIgnore = ignoredPatterns.some(p =>
        errorMsg.toLowerCase().includes(p)
      );

      if (!shouldIgnore) {
        this.error(errorMsg);
      } else {
        // 即使忽略错误，也要记录日志以便调试
        console.warn('[Session] 忽略的错误:', errorMsg);
      }
      this.busy(false);
    } finally {
      this.claudeChannelId(undefined);
    }
  }

  private processIncomingMessage(event: any): void {
    // 🔥 使用完整的消息处理流程
    console.log('[Session] processIncomingMessage 收到事件:', event?.type, event?.subtype, event);

    // 更新最后消息时间，用于活动检测
    this.lastMessageTime = Date.now();

    // 1. 获取当前消息数组（转为可变数组）
    const currentMessages = [...this.messages()] as Message[];

    // 2. 处理特殊消息（TodoWrite, usage 等）
    this.processMessage(event);

    // 3. 使用工具函数处理消息：
    //    - 关联 tool_result 到 tool_use（响应式更新）
    //    - 将原始事件转换为 Message 并添加到数组
    processAndAttachMessage(currentMessages, event);

    // 4. 合并连续 Read 消息为 ReadCoalesced（已禁用，保留作为参考）
    // const merged = mergeConsecutiveReadMessages(currentMessages);

    // 5. 更新 messages signal
    // this.messages(merged);
    this.messages(currentMessages);

    // 6. 更新其他状态
    if (event?.type === 'system') {
      this.sessionId(event.session_id);
      if (event.subtype === 'init') {
        // 🔧 修复：init 事件只是表示 channel 准备好了，不应该设置 busy=true
        // busy=true 应该在 send() 方法中设置，表示用户真正发送了消息
        // 移除: this.busy(true);
        // 开始新任务时，清除完成状态
        this.taskJustCompleted(false);
      } else if (event.subtype === 'status' && event.status === 'compacting') {
        // 上下文压缩中：显示提示并自动发送继续消息
        this.handleCompacting();
      }
    } else if (event?.type === 'result') {
      console.log('[Session] 收到 result 事件，触发 handleEndlessMode');
      this.busy(false);
      // 停止活动检测定时器
      this.stopActivityCheck();
      // 显示任务完成提示（保持显示直到用户发送新消息）
      this.taskJustCompleted(true);

      // 无尽模式：自动发送下一轮
      this.handleEndlessMode();
    }
  }

  /**
   * 处理无尽模式：任务完成后自动发送下一轮
   */
  private handleEndlessMode(): void {
    console.log('[Session] handleEndlessMode 被调用, endlessMode =', this.endlessMode());

    if (!this.endlessMode()) {
      console.log('[Session] 无尽模式未开启，跳过');
      return;
    }

    const currentRound = this.endlessCurrentRound();
    const maxRounds = this.endlessMaxRounds();
    const prompt = this.endlessPrompt();

    console.log(`[Session] 无尽模式状态: currentRound=${currentRound}, maxRounds=${maxRounds}, prompt="${prompt.substring(0, 50)}..."`);

    if (currentRound >= maxRounds) {
      // 已达到最大次数，关闭无尽模式
      console.log(`[Session] 无尽模式完成，共执行 ${currentRound} 次`);
      this.endlessMode(false);
      this.endlessCurrentRound(0);
      return;
    }

    if (!prompt.trim()) {
      console.warn('[Session] 无尽模式提示词为空，停止执行');
      this.endlessMode(false);
      return;
    }

    // 增加计数
    this.endlessCurrentRound(currentRound + 1);
    console.log(`[Session] 无尽模式第 ${currentRound + 1}/${maxRounds} 轮，准备发送`);

    // 延迟 1 秒后自动发送（给用户一点缓冲时间）
    setTimeout(() => {
      console.log(`[Session] setTimeout 回调: endlessMode=${this.endlessMode()}, busy=${this.busy()}`);
      if (this.endlessMode() && !this.busy()) {
        console.log('[Session] 发送无尽模式消息');
        this.send(prompt);
      } else {
        console.log('[Session] 条件不满足，未发送消息');
      }
    }, 1000);
  }

  /**
   * 处理特殊消息（TodoWrite, usage 统计）
   */
  private processMessage(event: any): void {
    if (
      event.type === 'assistant' &&
      event.message?.content &&
      Array.isArray(event.message.content)
    ) {
      // 处理 TodoWrite
      for (const block of event.message.content) {
        if (
          block.type === 'tool_use' &&
          block.name === 'TodoWrite' &&
          block.input &&
          typeof block.input === 'object' &&
          'todos' in block.input
        ) {
          this.todos(block.input.todos);
        }
      }

      // 处理 usage 统计
      if (event.message.usage) {
        this.updateUsage(event.message.usage);
      }
    }
  }

  /**
   * 更新 token 使用统计
   * 使用 input_tokens 作为当前上下文占用（代表实际发送给模型的 tokens）
   * 同时累计本次会话的总消耗
   */
  private updateUsage(usage: any): void {
    // input_tokens 代表当前请求发送给模型的实际 tokens 数量
    // 这才是真正的"上下文占用"，而不是累计消耗
    const contextTokens =
      usage.input_tokens +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);

    const current = this.usageData();

    // 累计本次会话的 token 消耗
    this.usageData({
      totalTokens: contextTokens,  // 使用当前上下文大小
      totalCost: current.totalCost,
      contextWindow: current.contextWindow,
      // 累计会话消耗
      sessionInputTokens: current.sessionInputTokens + (usage.input_tokens ?? 0),
      sessionOutputTokens: current.sessionOutputTokens + (usage.output_tokens ?? 0),
      sessionCacheReadTokens: current.sessionCacheReadTokens + (usage.cache_read_input_tokens ?? 0),
      sessionCacheCreationTokens: current.sessionCacheCreationTokens + (usage.cache_creation_input_tokens ?? 0),
      lastSyncTime: current.lastSyncTime
    });

    // 已移除自动同步逻辑，usage 只在启动/结束会话时同步一次
  }

  /**
   * 同步 usage 数据到后端
   * 调用后端 API 刷新总使用量
   * 注意：只在启动会话时和结束会话时调用，不再自动定时同步
   */
  async syncUsageToBackend(): Promise<void> {
    try {
      const connection = await this.getConnection();

      // 获取今天的日期范围
      const today = new Date();
      const startDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
      const endDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      // 调用后端 API 获取最新使用量
      const usageResponse = await connection.getUsage(startDate, endDate);

      if (usageResponse?.usage) {
        const current = this.usageData();
        this.usageData({
          ...current,
          totalCost: usageResponse.usage.totalUsage / 100, // 转换为美元
          lastSyncTime: Date.now()
        });
        console.log('[Session] Usage synced to backend:', usageResponse.usage.totalUsage);
      }
    } catch (error) {
      console.warn('[Session] Failed to sync usage:', error);
    }
  }

  /**
   * 处理上下文压缩状态
   * 当 SDK 发送 compacting 状态时，显示提示并自动发送继续消息
   */
  private async handleCompacting(): Promise<void> {
    console.log('[Session] Context compacting detected, auto-continuing...');

    // 设置压缩状态
    this.isCompacting(true);

    // 显示通知（如果有通知服务）
    if (this.context.showNotification) {
      // 不等待用户响应，仅显示提示
      this.context.showNotification(
        'Context limit reached. Auto-compacting conversation history...',
        'info',
        undefined,
        true  // onlyIfNotVisible: 仅在窗口不可见时显示
      );
    }

    // 自动发送继续消息以触发压缩
    try {
      const connection = await this.getConnection();
      const channelId = this.claudeChannelId();

      if (channelId) {
        // 发送空的继续消息，让 SDK 继续处理
        const continueMessage = {
          type: 'user',
          session_id: '',
          parent_tool_use_id: null,
          message: {
            role: 'user',
            content: [{ type: 'text', text: '' }]  // 空消息触发继续
          }
        };

        connection.sendInput(channelId, continueMessage, false);
        console.log('[Session] Auto-continue message sent for compacting');
      }
    } catch (error) {
      console.error('[Session] Failed to auto-continue during compacting:', error);
    } finally {
      // 重置压缩状态
      this.isCompacting(false);
    }
  }

  /**
   * 手动压缩对话历史（真正的 token 节约）
   *
   * 通过发送 /compact 命令触发 SDK 内置的压缩机制：
   * 1. SDK 会生成对话摘要
   * 2. 用摘要替换历史消息
   * 3. 后续 API 调用真正减少 token 消耗
   *
   * 同时将压缩记录保存到 MD 文件以便查看。
   */
  async compactWithSummary(): Promise<void> {
    const currentMessages = this.messages();
    if (currentMessages.length < 3) {
      console.log('[Session] Too few messages to compact');
      return;
    }

    if (this.busy() || this.isSummarizing()) {
      console.log('[Session] Cannot compact while busy or already summarizing');
      return;
    }

    this.isSummarizing(true);
    console.log('[Session] Starting real compaction via /compact command...');

    try {
      // 确保有活跃的 channel
      await this.launchClaude();
      const connection = await this.getConnection();
      const channelId = this.claudeChannelId();

      if (!channelId) {
        throw new Error('No active channel');
      }

      // 发送 /compact 命令触发 SDK 内置压缩
      const compactRequest = {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [{ type: 'text', text: '/compact' }]
        }
      };

      // 标记为忙碌
      this.busy(true);
      connection.sendInput(channelId, compactRequest, false);

      // 等待响应完成
      await new Promise<void>((resolve) => {
        const checkBusy = () => {
          if (!this.busy()) {
            resolve();
          } else {
            setTimeout(checkBusy, 100);
          }
        };
        setTimeout(checkBusy, 500);
      });

      // 生成 MD 文件记录压缩操作
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const sessionId = this.sessionId() || 'unknown';
      const fileName = `.claude-compact-${timestamp}.md`;

      const mdContent = `# 对话压缩记录

> 压缩时间: ${timestamp.replace('T', ' ')}
> 会话 ID: ${sessionId}
> 压缩前消息数: ${currentMessages.length}

---

此对话已通过 SDK 内置的 /compact 命令进行压缩。
压缩后的摘要已由 Claude 自动生成并替换了历史消息。

**效果**：后续 API 调用将真正减少 token 消耗。

---

*此文件由 Claudix 自动生成，用于记录对话压缩历史。*
`;

      // 写入 MD 文件到工作目录
      try {
        const writeResult = await connection.writeFile(fileName, mdContent);
        if (writeResult.success) {
          console.log(`[Session] Compact record saved to ${fileName}`);
        }
      } catch (writeError) {
        console.warn('[Session] Failed to write compact record:', writeError);
      }

      // 清除前端 toolUse 缓存
      clearToolUseCache();

      console.log(`[Session] Real compaction completed via /compact command`);

      // 显示通知
      if (this.context.showNotification) {
        this.context.showNotification(
          `已通过 /compact 命令压缩对话，后续将真正节约 token`,
          'info'
        );
      }
    } catch (error) {
      console.error('[Session] Failed to compact:', error);
      if (this.context.showNotification) {
        this.context.showNotification(
          '压缩失败: ' + (error instanceof Error ? error.message : String(error)),
          'error'
        );
      }
    } finally {
      this.isSummarizing(false);
    }
  }

  /**
   * 从消息中提取关键对话内容（用于 AI 摘要）
   * 只保留用户问题和助手的文本回答，过滤系统消息和工具调用细节
   */
  private extractKeyConversation(messages: Message[]): string {
    const keyParts: string[] = [];

    for (const message of messages) {
      // Message 类的 role 在 message.message.role 中
      const role = message.message?.role || message.type;

      // 只处理用户和助手消息
      if (role !== 'user' && role !== 'assistant') {
        continue;
      }

      const roleLabel = role === 'user' ? '用户' : '助手';
      const textParts: string[] = [];

      // Message 类的 content 在 message.message.content 中
      const content = message.message?.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          // ContentBlockWrapper 的数据在 .content 属性中
          const blockData = block.content || block.data || block;

          // 只提取文本内容
          if (blockData.type === 'text' && blockData.text) {
            // 过滤掉系统提示相关的文本
            const text = blockData.text as string;
            if (!text.includes('<system-reminder>') && !text.includes('</system-reminder>')) {
              textParts.push(text);
            }
          }
        }
      } else if (typeof content === 'string') {
        textParts.push(content);
      }

      // 只有有实际内容时才添加
      if (textParts.length > 0) {
        const combinedText = textParts.join('\n').trim();
        // 截断过长的单条消息
        const truncated = combinedText.length > 2000
          ? combinedText.slice(0, 2000) + '...'
          : combinedText;
        keyParts.push(`【${roleLabel}】${truncated}`);
      }
    }

    return keyParts.join('\n\n');
  }

  /**
   * 从消息中提取修改的文件列表
   * 通过分析 Write 和 Edit 工具调用来获取
   */
  private extractModifiedFiles(messages: Message[]): string[] {
    const files = new Set<string>();

    for (const message of messages) {
      const content = message.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        const blockData = block.content || block.data || block;

        // 检查 tool_use 块
        if (blockData.type === 'tool_use') {
          const toolName = blockData.name;
          const input = blockData.input as Record<string, unknown> | undefined;

          if ((toolName === 'Write' || toolName === 'Edit') && input?.file_path) {
            // 提取文件路径，去掉工作目录前缀
            let filePath = String(input.file_path);
            // 简化路径显示（去掉绝对路径前缀）
            const lastSlashIndex = filePath.lastIndexOf('/');
            if (lastSlashIndex > 0) {
              // 保留最后两级目录
              const parts = filePath.split('/');
              if (parts.length > 2) {
                filePath = parts.slice(-3).join('/');
              }
            }
            files.add(filePath);
          }
        }
      }
    }

    return Array.from(files);
  }

  /**
   * 导出当前会话事件总结到 Markdown 文件
   *
   * 提取会话关键内容，调用 AI 生成摘要，然后追加到固定的 Markdown 文件。
   *
   * @returns 是否成功导出（用于后续创建新会话）
   */
  async exportSummaryToMarkdown(): Promise<boolean> {
    const currentMessages = this.messages();
    if (currentMessages.length < 1) {
      console.log('[Session] No messages to export');
      return false;
    }

    if (this.busy() || this.isExporting()) {
      console.log('[Session] Cannot export while busy or already exporting');
      return false;
    }

    this.isExporting(true);
    console.log('[Session] Exporting conversation summary to markdown...');

    try {
      const connection = await this.getConnection();

      // 1. 提取关键对话内容
      const keyConversation = this.extractKeyConversation(currentMessages);

      if (!keyConversation.trim()) {
        console.log('[Session] No key conversation content to summarize');
        if (this.context.showNotification) {
          this.context.showNotification('没有可总结的对话内容', 'warning');
        }
        return false;
      }

      // 2. 确保有活跃的 channel
      await this.launchClaude();
      const channelId = this.claudeChannelId();

      if (!channelId) {
        throw new Error('No active channel');
      }

      // 2.5 提取修改的文件列表
      const modifiedFiles = this.extractModifiedFiles(currentMessages);

      // 3. 构建摘要请求 prompt
      const summaryPrompt = `请为以下对话生成一个详细的工作日志摘要。要求：
1. 用 3-6 个要点概括主要工作内容
2. 突出用户的核心需求和最终解决方案
3. 列出关键的技术决策和实现方式
4. 如果有遇到的问题和解决方法，也要记录
5. 使用中文，保持专业但详细
6. 直接输出摘要内容，不要有多余的开场白

对话内容：
${keyConversation.slice(0, 15000)}`;

      // 4. 发送摘要请求
      const summaryRequest = {
        type: 'user',
        session_id: '',
        parent_tool_use_id: null,
        message: {
          role: 'user',
          content: [{ type: 'text', text: summaryPrompt }]
        }
      };

      // 记录发送请求前的消息数量，用于识别新消息
      const msgCountBefore = this.messages().length;

      this.busy(true);
      connection.sendInput(channelId, summaryRequest, false);

      // 5. 等待响应并收集摘要内容
      let aiSummary = '';
      await new Promise<void>((resolve) => {
        const startTime = Date.now();
        const maxWait = 60000; // 最多等待 60 秒

        const checkResponse = () => {
          // 检查新增的助手消息（只看请求后新增的消息）
          const msgs = this.messages();
          if (msgs.length > msgCountBefore) {
            // 从新消息中查找 assistant 响应
            for (let i = msgs.length - 1; i >= msgCountBefore; i--) {
              const msg = msgs[i];
              // Message 类的 type 在顶层，content 在 msg.message.content
              if (msg.type === 'assistant') {
                const content = msg.message?.content;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    // ContentBlockWrapper 的数据在 .content 属性中
                    const blockData = block.content || block.data || block;
                    if (blockData.type === 'text' && blockData.text) {
                      aiSummary = blockData.text;
                    }
                  }
                }
                break;
              }
            }
          }

          if (!this.busy() && aiSummary) {
            // 确保 busy 结束且已获取到摘要
            resolve();
          } else if (Date.now() - startTime > maxWait) {
            console.warn('[Session] Summary generation timeout');
            resolve();
          } else {
            setTimeout(checkResponse, 200);
          }
        };
        setTimeout(checkResponse, 500);
      });

      // 6. 生成时间戳和元信息
      const now = new Date();
      const readableTime = now.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });

      const sessionId = this.sessionId() || 'unknown';
      const sessionSummary = this.summary() || '无标题会话';
      const fileName = `.claude-summary.md`;

      // 7. 构建 Markdown 内容（更详细的工作日志）
      const filesSection = modifiedFiles.length > 0
        ? `\n### 修改的文件\n\n${modifiedFiles.map(f => `- \`${f}\``).join('\n')}\n`
        : '';

      const newContent = `
---

## 工作日志 - ${readableTime.split(' ')[0]}

> **会话标题**: ${sessionSummary}
> **记录时间**: ${readableTime}
> **消息数量**: ${currentMessages.length}

### 工作摘要

${aiSummary || '（摘要生成失败）'}
${filesSection}
`;

      // 8. 尝试读取现有文件内容
      let existingContent = '';
      try {
        const readResult = await connection.readFile(fileName);
        if (readResult.success && readResult.content) {
          existingContent = readResult.content;
        }
      } catch {
        // 文件不存在，创建新文件
        existingContent = `# Claude 会话摘要

*此文件由 Claudix 自动生成，记录会话历史。*
`;
      }

      // 9. 追加新内容
      const finalContent = existingContent + newContent;

      // 10. 写入 MD 文件到工作目录
      const writeResult = await connection.writeFile(fileName, finalContent);
      if (writeResult.success) {
        console.log(`[Session] AI summary appended to ${fileName}`);

        // 显示通知
        if (this.context.showNotification) {
          this.context.showNotification(
            `AI 摘要已生成并追加到 ${fileName}`,
            'info'
          );
        }
        return true;
      } else {
        throw new Error('Failed to write file');
      }
    } catch (error) {
      console.error('[Session] Failed to export summary:', error);
      if (this.context.showNotification) {
        this.context.showNotification(
          '导出失败: ' + (error instanceof Error ? error.message : String(error)),
          'error'
        );
      }
      return false;
    } finally {
      this.isExporting(false);
    }
  }

  private buildUserMessage(
    input: string,
    attachments: AttachmentPayload[],
    selection?: SelectionRange
  ): any {
    const content: any[] = [];

    if (selection?.selectedText) {
      content.push({
        type: 'text',
        text: `<ide_selection>The user selected the lines ${selection.startLine} to ${selection.endLine} from ${selection.filePath}:
${selection.selectedText}

This may or may not be related to the current task.</ide_selection>`
      });
    }

    for (const attachment of attachments) {
      const { fileName, mediaType, data } = attachment;
      if (!data) {
        console.error(`Attachment missing data: ${fileName}`);
        continue;
      }

      const normalizedType = (mediaType || 'application/octet-stream').toLowerCase();

      if (IMAGE_MEDIA_TYPES.includes(normalizedType as (typeof IMAGE_MEDIA_TYPES)[number])) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: normalizedType,
            data
          }
        });
        continue;
      }

      if (normalizedType === 'text/plain') {
        try {
          const decoded = typeof globalThis.atob === 'function' ? globalThis.atob(data) : '';
          content.push({
            type: 'document',
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: decoded
            },
            title: fileName
          });
          continue;
        } catch (error) {
          console.error('Failed to decode text attachment', error);
        }
      }

      if (normalizedType === 'application/pdf') {
        content.push({
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data
          },
          title: fileName
        });
        continue;
      }

      console.error(`Unsupported attachment type: ${fileName} (${normalizedType})`);
    }

    content.push({ type: 'text', text: input });

    return {
      type: 'user',
      session_id: '',
      parent_tool_use_id: null,
      message: {
        role: 'user',
        content
      }
    };
  }

  private isSlashCommand(input: string): boolean {
    return input.trim().startsWith('/');
  }

  private isSameSelection(a?: SelectionRange, b?: SelectionRange): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.filePath === b.filePath &&
      a.startLine === b.startLine &&
      a.endLine === b.endLine &&
      a.startColumn === b.startColumn &&
      a.endColumn === b.endColumn &&
      a.selectedText === b.selectedText
    );
  }
}
