import { signal } from "alien-signals";
import { AsyncQueue } from "./AsyncQueue";
import { EventEmitter } from "../utils/events";
import { PermissionRequest } from "../core/PermissionRequest";
import type { PermissionResult, PermissionMode } from "../../../shared/permissions";
import type {
  ExtensionRequestResponse,
  ExtensionToWebViewMessage,
  GetClaudeStateResponse,
  InitResponse,
  RequestMessage,
  ToolPermissionRequest,
  WebViewToExtensionMessage,
  WebViewRequest,
  ShowNotificationRequest,
  WorkspaceChangedRequest,
} from "../../../shared/messages";

export interface WorkspaceInfo {
  defaultCwd: string;
  workspaceFolders: Array<{ name: string; path: string }>;
}

type ConnectionState = "connecting" | "connected" | "disconnected";

interface RequestHandler {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
}

/**
 * WebView ↔ Extension 传输抽象基类
 * - 使用 alien-signals 管理状态（统一架构）
 */
export abstract class BaseTransport {
  readonly state = signal<ConnectionState>("connecting");
  readonly isVisible = signal(true);
  readonly permissionRequests = signal<PermissionRequest[]>([]);
  readonly config = signal<InitResponse["state"] | undefined>(undefined);
  readonly claudeConfig = signal<GetClaudeStateResponse["config"] | undefined>(undefined);
  readonly workspaceInfo = signal<WorkspaceInfo | undefined>(undefined);

  get opened(): Promise<void> {
    return Promise.resolve();
  }
  get closed(): Promise<void> {
    return Promise.resolve();
  }

  readonly permissionRequested: EventEmitter<PermissionRequest> =
    new EventEmitter<PermissionRequest>();

  /** 工作区变化事件 */
  readonly workspaceChanged: EventEmitter<WorkspaceInfo> =
    new EventEmitter<WorkspaceInfo>();

  /** 自动任务发现事件 */
  readonly autoTaskFound: EventEmitter<{
    tasks: Array<{ title: string; status: string; section: string }>;
    prompt: string;
  }> = new EventEmitter();

  /** 任务文件变化事件（用于实时 UI 更新） */
  readonly taskFileChanged: EventEmitter<{
    tasks: Array<{ title: string; status: string; section: string }>;
  }> = new EventEmitter();

  /** 自动任务禁用事件 */
  readonly autoTaskDisabled: EventEmitter<void> = new EventEmitter();

  protected readonly fromHost = new AsyncQueue<ExtensionToWebViewMessage>();
  protected readonly streams = new Map<string, AsyncQueue<any>>();
  protected readonly outstandingRequests = new Map<string, RequestHandler>();

  constructor(
    protected readonly atMentionEvents: EventEmitter<string>,
    protected readonly selectionChangedEvents: EventEmitter<any>
  ) {
    void this.readMessages();
  }

  protected abstract send(message: WebViewToExtensionMessage): void;

  async initialize(): Promise<void> {
    const initResponse = await this.sendRequest<InitResponse>({ type: "init" });
    this.config({
      defaultCwd: initResponse.state.defaultCwd,
      openNewInTab: initResponse.state.openNewInTab ?? false,
      modelSetting: initResponse.state.modelSetting,
      platform: initResponse.state.platform,
      thinkingLevel: initResponse.state.thinkingLevel,
      hasWorkspace: initResponse.state.hasWorkspace ?? true,
    } as InitResponse["state"]);

    const claudeState = await this.sendRequest<GetClaudeStateResponse>({
      type: "get_claude_state",
    });
    this.claudeConfig(claudeState.config);
    this.state("connected");
  }

  launchClaude(
    channelId: string,
    resume?: string,
    cwd?: string,
    model?: string,
    permissionMode?: PermissionMode,
    thinkingLevel?: string
  ): AsyncQueue<any> {
    const queue = new AsyncQueue<any>();
    this.streams.set(channelId, queue);
    this.send({
      type: "launch_claude",
      channelId,
      resume,
      cwd,
      model,
      permissionMode,
      thinkingLevel,
    });
    return queue;
  }

  sendInput(channelId: string, message: any, done: boolean): void {
    this.send({ type: "io_message", channelId, message, done });
  }

  interruptClaude(channelId: string): void {
    this.send({ type: "interrupt_claude", channelId });
  }

  openFile(filePath: string, location?: any): Promise<any> {
    return this.sendRequest({ type: "open_file", filePath, location });
  }
  openConfigFile(configType: string): Promise<any> {
    return this.sendRequest({ type: "open_config_file", configType });
  }
  getMcpServers(channelId?: string): Promise<any> {
    return this.sendRequest({ type: "get_mcp_servers" }, channelId);
  }

  async openContent(
    content: string,
    fileName: string,
    editable: boolean,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const response = await this.sendRequest(
      { type: "open_content", content, fileName, editable },
      undefined,
      signal
    );
    return (response as any).updatedContent;
  }

  async openDiff(
    originalFilePath: string,
    newFilePath: string,
    edits: any[],
    supportMultiEdits: boolean,
    signal?: AbortSignal
  ): Promise<any[]> {
    const response = await this.sendRequest(
      {
        type: "open_diff",
        originalFilePath,
        newFilePath,
        edits,
        supportMultiEdits,
      },
      undefined,
      signal
    );
    return (response as any).newEdits;
  }

  async setPermissionMode(channelId: string, mode: PermissionMode): Promise<boolean> {
    const response = await this.sendRequest(
      { type: "set_permission_mode", mode },
      channelId
    );
    return !!(response as any).success;
  }

  async setModel(channelId: string, model: any): Promise<any> {
    return this.sendRequest({ type: "set_model", model }, channelId);
  }

  async setThinkingLevel(channelId: string, thinkingLevel: string): Promise<void> {
    await this.sendRequest({ type: "set_thinking_level", channelId, thinkingLevel }, channelId);
  }

  listSessions(): Promise<any> {
    return this.sendRequest({ type: "list_sessions_request" });
  }
  getSession(sessionId: string): Promise<any> {
    return this.sendRequest({ type: "get_session_request", sessionId });
  }
  listFiles(pattern?: string, signal?: AbortSignal): Promise<any> {
    return this.sendRequest({ type: "list_files_request", pattern }, undefined, signal);
  }
  statPaths(paths: string[]): Promise<any> {
    return this.sendRequest({ type: "stat_path_request", paths });
  }
  startNewConversationTab(initialPrompt?: string): Promise<any> {
    return this.sendRequest({
      type: "new_conversation_tab",
      initialPrompt,
    } as any);
  }
  renameTab(title: string): Promise<any> {
    return this.sendRequest({ type: "rename_tab", title } as any);
  }
  openClaudeInTerminal(): Promise<any> {
    return this.sendRequest({ type: "open_claude_in_terminal" });
  }
  openURL(url: string): void {
    void this.sendRequest({ type: "open_url", url });
  }

  writeFile(filePath: string, content: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest({ type: "write_file", filePath, content });
  }

  readFile(filePath: string): Promise<{ success: boolean; content?: string; error?: string }> {
    return this.sendRequest({ type: "read_file", filePath });
  }

  exec(command: string, params: string[]): Promise<any> {
    return this.sendRequest({ type: "exec", command, params });
  }

  // SSH 操作
  sshConnect(host: string, options?: { port?: number; username?: string; identityFile?: string }): Promise<{ sessionId?: string; error?: string }> {
    return this.sendRequest({
      type: "ssh_connect",
      host,
      ...options
    });
  }

  sshCommand(sessionId: string, command: string, timeout?: number): Promise<{ success: boolean; output: string; error?: string }> {
    return this.sendRequest({
      type: "ssh_command",
      sessionId,
      command,
      timeout
    });
  }

  sshDisconnect(sessionId: string): Promise<{ success: boolean }> {
    return this.sendRequest({
      type: "ssh_disconnect",
      sessionId
    });
  }

  sshGetOutput(sessionId: string): Promise<{ output: string }> {
    return this.sendRequest({
      type: "ssh_get_output",
      sessionId
    });
  }

  sshListSessions(): Promise<{ sessions: Array<{ id: string; host: string; isConnected: boolean }> }> {
    return this.sendRequest({ type: "ssh_list_sessions" });
  }

  getCurrentSelection(): Promise<any> {
    return this.sendRequest({ type: "get_current_selection" });
  }
  getAssetUris(): Promise<any> {
    return this.sendRequest({ type: "get_asset_uris" });
  }

  showNotification(
    message: string,
    severity: ShowNotificationRequest["severity"],
    buttons?: string[],
    onlyIfNotVisible?: boolean
  ): Promise<string | undefined> {
    return this.sendRequest({
      type: "show_notification",
      message,
      severity,
      buttons,
      onlyIfNotVisible,
    }).then((r: any) => r.buttonValue);
  }

  // ============================================================================
  // Claude 配置管理 API
  // ============================================================================

  /**
   * 获取 Claude 配置（API Key 脱敏显示）
   */
  getClaudeConfig(): Promise<{
    config: {
      apiKey: string | null;
      baseUrl: string | null;
      claudeCliPath?: string | null;
      isConfigured: boolean;
      /** 存储模式：secretStorage（安全存储）或 globalState（备用存储） */
      storageMode?: 'secretStorage' | 'globalState';
    };
  }> {
    return this.sendRequest({ type: "get_claude_config" });
  }

  /**
   * 设置 API Key
   */
  setApiKey(apiKey: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest({ type: "set_api_key", apiKey });
  }

  /**
   * 设置 Base URL
   */
  setBaseUrl(baseUrl: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest({ type: "set_base_url", baseUrl });
  }

  /**
   * 设置 Claude CLI 路径
   */
  setClaudeCliPath(cliPath: string): Promise<{ success: boolean; error?: string }> {
    return this.sendRequest({ type: "set_claude_cli_path", cliPath });
  }

  /**
   * 查询订阅信息
   */
  getSubscription(): Promise<{
    subscription: {
      plan: string;
      hardLimit: number;
      softLimit: number;
      expiresAt?: string;
    } | null;
    error?: string;
  }> {
    return this.sendRequest({ type: "get_subscription" });
  }

  /**
   * 查询使用量
   */
  getUsage(startDate: string, endDate: string): Promise<{
    usage: {
      totalUsage: number;
      dailyUsage: Array<{ date: string; usage: number }>;
    } | null;
    error?: string;
  }> {
    return this.sendRequest({ type: "get_usage", startDate, endDate });
  }

  /**
   * 检查环境（Claude Code CLI 和 Git）
   */
  checkEnvironment(): Promise<{
    claudeCode: {
      installed: boolean;
      version?: string;
      path?: string;
    };
    git: {
      installed: boolean;
      version?: string;
    };
    allReady: boolean;
  }> {
    return this.sendRequest({ type: "check_environment" });
  }

  /**
   * 设置自动审批配置
   */
  setAutoApproveConfig(config: { autoApproveEnabled: boolean; confirmWrite: boolean; confirmEdit: boolean }): Promise<{ success: boolean }> {
    return this.sendRequest({ type: "set_auto_approve_config", config });
  }

  readTaskFile(): Promise<{ success: boolean; content?: string; error?: string }> {
    return this.sendRequest({ type: "read_task_file" });
  }

  // ============================================================================
  // 自动任务 API
  // ============================================================================

  /**
   * 启用自动任务
   */
  enableAutoTask(interval?: number): Promise<{
    success: boolean;
    config: { enabled: boolean; checkInterval: number };
  }> {
    return this.sendRequest({ type: "enable_auto_task", interval });
  }

  /**
   * 禁用自动任务
   */
  disableAutoTask(): Promise<{ success: boolean }> {
    return this.sendRequest({ type: "disable_auto_task" });
  }

  /**
   * 获取自动任务配置
   */
  getAutoTaskConfig(): Promise<{
    config: { enabled: boolean; checkInterval: number };
  }> {
    return this.sendRequest({ type: "get_auto_task_config" });
  }

  /**
   * 设置自动任务检查间隔
   */
  setAutoTaskInterval(interval: number): Promise<{
    success: boolean;
    config: { enabled: boolean; checkInterval: number };
  }> {
    return this.sendRequest({ type: "set_auto_task_interval", interval });
  }

  /**
   * 手动触发任务检查
   */
  checkTasksNow(): Promise<{
    tasks: Array<{
      title: string;
      status: 'pending' | 'in-progress' | 'completed';
      section: 'in-progress' | 'pending' | 'completed';
    }>;
  }> {
    return this.sendRequest({ type: "check_tasks_now" });
  }

  /**
   * 撤回文件修改
   */
  revertFileChange(snapshotId: string): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
  }> {
    return this.sendRequest({ type: "revert_file_change", snapshotId });
  }

  /**
   * 查看快照差异（在 VSCode 中打开 diff 视图）
   */
  viewSnapshotDiff(snapshotId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    return this.sendRequest({ type: "view_snapshot_diff", snapshotId });
  }

  onPermissionRequested(callback: (request: PermissionRequest) => void): void {
    this.permissionRequested.add(callback);
  }

  close(): void {
    /* no-op */
  }

  protected async sendRequest<TResponse = any>(
    request: WebViewRequest,
    channelId?: string,
    abortSignal?: AbortSignal
  ): Promise<TResponse> {
    const requestId = Math.random().toString(36).slice(2);
    const abortHandler = () => {
      this.cancelRequest(requestId);
    };
    if (abortSignal)
      abortSignal.addEventListener("abort", abortHandler, { once: true });

    return new Promise<TResponse>((resolve, reject) => {
      this.outstandingRequests.set(requestId, { resolve, reject });
      this.send({ type: "request", channelId, requestId, request });
    }).finally(() => {
      if (abortSignal) abortSignal.removeEventListener("abort", abortHandler);
    });
  }

  protected cancelRequest(requestId: string): void {
    this.send({ type: "cancel_request", targetRequestId: requestId });
  }

  private async readMessages(): Promise<void> {
    try {
      for await (const message of this.fromHost) {
        switch (message.type) {
          case "io_message": {
            const stream = this.streams.get(message.channelId);
            if (stream) stream.enqueue(message.message);
            else
              console.warn(
                `[BaseTransport] Missing stream for ${message.channelId}`
              );
            break;
          }
          case "close_channel": {
            const stream = this.streams.get(message.channelId);
            if (stream) {
              if (message.error) stream.error(new Error(message.error));
              stream.done();
              // 延迟删除，给尾部 io_message/result 留出时间片
              setTimeout(() => {
                this.streams.delete(message.channelId);
              }, 50);
            } else {
              this.streams.delete(message.channelId);
            }
            break;
          }
          case "request":
            await this.processRequest(message as RequestMessage);
            break;
          case "response": {
            const handler = this.outstandingRequests.get(message.requestId);
            if (!handler) {
              console.warn(
                `[BaseTransport] No handler for response ${message.requestId}`
              );
              break;
            }
            const response = (message as any).response;
            if (response && (response as any).type === "error")
              handler.reject(new Error((response as any).error));
            else handler.resolve(response);
            this.outstandingRequests.delete(message.requestId);
            break;
          }
          default:
            console.warn(
              `[BaseTransport] Unknown message type ${(message as any).type}`
            );
        }
      }
    } catch (error) {
      for (const stream of this.streams.values()) stream.error(error);
    } finally {
      for (const stream of this.streams.values()) stream.done();
      this.streams.clear();
    }
  }

  private async processRequest(message: RequestMessage): Promise<void> {
    const req: any = (message as any).request;
    switch (req.type) {
      case "tool_permission_request": {
        console.log('[BaseTransport] 开始处理 tool_permission_request');
        const response = await this.handleToolPermissionRequest(
          (message.channelId ?? "") as string,
          req as ToolPermissionRequest
        );
        console.log('[BaseTransport] handleToolPermissionRequest 已返回:', response);
        console.log('[BaseTransport] 准备发送 response, requestId:', message.requestId);
        try {
          this.send({ type: "response", requestId: message.requestId, response });
          console.log('[BaseTransport] response 已发送');
        } catch (e) {
          console.error('[BaseTransport] 发送 response 失败:', e);
        }
        break;
      }
      case "insert_at_mention": {
        if (this.isVisible()) this.atMentionEvents.emit(req.text);
        break;
      }
      case "selection_changed": {
        this.selectionChangedEvents.emit(req.selection);
        break;
      }
      case "visibility_changed": {
        this.isVisible(req.isVisible);
        break;
      }

      case "update_state": {
        this.config({
          defaultCwd: req.state.defaultCwd,
          openNewInTab: req.state.openNewInTab,
          modelSetting: req.state.modelSetting,
          platform: req.state.platform,
          thinkingLevel: req.state.thinkingLevel,
          hasWorkspace: req.state.hasWorkspace ?? true,
        } as InitResponse["state"]);
        this.claudeConfig(req.config);
        break;
      }
      case "workspace_changed": {
        const workspaceReq = req as WorkspaceChangedRequest;
        const info: WorkspaceInfo = {
          defaultCwd: workspaceReq.defaultCwd,
          workspaceFolders: workspaceReq.workspaceFolders,
        };
        // 更新 config 中的 defaultCwd 和 hasWorkspace
        const currentConfig = this.config();
        if (currentConfig) {
          this.config({
            ...currentConfig,
            defaultCwd: workspaceReq.defaultCwd,
            hasWorkspace: workspaceReq.workspaceFolders.length > 0,
          });
        }
        // 更新 workspaceInfo signal
        this.workspaceInfo(info);
        // 触发事件
        this.workspaceChanged.emit(info);
        console.log("[BaseTransport] 工作区变化:", info);
        break;
      }
      case "auto_task_found": {
        // 自动任务发现通知
        const taskReq = req as { tasks: Array<{ title: string; status: string; section: string }>; prompt: string };
        console.log("[BaseTransport] 自动任务发现:", taskReq.tasks.length, "个任务");
        this.autoTaskFound.emit({
          tasks: taskReq.tasks,
          prompt: taskReq.prompt,
        });
        break;
      }
      case "task_file_changed": {
        // 任务文件变化通知（用于实时 UI 更新）
        const fileChangeReq = req as { tasks: Array<{ title: string; status: string; section: string }> };
        console.log("[BaseTransport] 任务文件变化:", fileChangeReq.tasks.length, "个任务");
        this.taskFileChanged.emit({
          tasks: fileChangeReq.tasks,
        });
        break;
      }
      case "auto_task_disabled": {
        // 自动任务禁用通知
        console.log("[BaseTransport] 自动任务已禁用");
        this.autoTaskDisabled.emit();
        break;
      }
      default:
        console.warn("[BaseTransport] Unhandled request", req);
    }
  }

  private async handleToolPermissionRequest(
    channelId: string,
    request: ToolPermissionRequest
  ): Promise<ExtensionRequestResponse> {
    console.log('[BaseTransport] 收到权限请求:', channelId, request.toolName);
    let trackedRequest: PermissionRequest | undefined;
    return new Promise<ExtensionRequestResponse>((resolve) => {
      const permissionRequest = new PermissionRequest(
        channelId,
        request.toolName,
        request.inputs,
        request.suggestions ?? []
      );
      trackedRequest = permissionRequest;

      permissionRequest.onResolved((resolution: PermissionResult) => {
        console.log('[BaseTransport] 权限请求已解决:', channelId, request.toolName, resolution);
        resolve({ type: "tool_permission_response", result: resolution });
        this.permissionRequests(
          this.permissionRequests().filter((i) => i !== permissionRequest)
        );
      });

      this.permissionRequests([
        ...this.permissionRequests(),
        permissionRequest,
      ]);
      console.log('[BaseTransport] 权限请求已添加, 当前数量:', this.permissionRequests().length);
      this.permissionRequested.emit(permissionRequest);
    }).finally(() => {
      if (trackedRequest) {
        this.permissionRequests(
          this.permissionRequests().filter((i) => i !== trackedRequest)
        );
      }
    });
  }
}
