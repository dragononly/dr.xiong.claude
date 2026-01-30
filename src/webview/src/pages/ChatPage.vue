<template>
  <div class="chat-page">
    <!-- 多标签栏 -->
    <TabBar @open-settings="$emit('switchToSettings')" />

    <!-- 顶部标题栏 -->
    <div class="chat-header">
      <div class="header-left">
        <button class="menu-btn" @click="$emit('switchToSessions')">
          <span class="codicon codicon-menu"></span>
        </button>
        <h2 class="chat-title">{{ title }}</h2>
      </div>
      <div class="header-right">
        <button class="header-btn" title="我的任务" @click="$emit('switchToTodos')">
          <span class="codicon codicon-checklist"></span>
        </button>
        <span v-if="balance !== null" class="balance-display" title="剩余额度">
          <span class="codicon codicon-credit-card"></span>
          ${{ balance.toFixed(2) }}
        </span>
        <span v-else-if="balanceLoading" class="balance-display loading">
          <span class="codicon codicon-loading codicon-modifier-spin"></span>
        </span>
      </div>
    </div>

    <!-- 主体：消息容器 -->
    <div class="main">
      <!-- <div class="chatContainer"> -->
        <div
          ref="containerEl"
          :class="['messagesContainer', 'custom-scroll-container']"
        >
          <template v-if="messages.length === 0">
            <div v-if="isBusy" class="emptyState">
              <div class="emptyWordmark">
                <ClaudeWordmark class="emptyWordmarkSvg" />
              </div>
            </div>
            <div v-else-if="!hasWorkspace" class="emptyState">
              <div class="emptyWordmark">
                <ClaudeWordmark class="emptyWordmarkSvg" />
              </div>
              <div class="noWorkspaceHint">
                <span class="codicon codicon-folder-opened"></span>
                <p>请先在 VSCode 中打开一个项目文件夹</p>
                <p class="hint-sub">打开文件夹后，Claude 可以帮助你分析和编辑代码</p>
              </div>
            </div>
            <div v-else class="emptyState">
              <div class="emptyWordmark">
                <ClaudeWordmark class="emptyWordmarkSvg" />
              </div>
              <RandomTip :platform="platform" />
            </div>
          </template>
          <template v-else>
            <!-- <div class="msg-list"> -->
              <MessageRenderer
                v-for="m in messages"
                :key="m.id"
                :message="m"
                :context="toolContext"
              />
            <!-- </div> -->
            <div v-if="isBusy" class="spinnerRow">
              <Spinner :size="16" :permission-mode="permissionMode" />
            </div>
            <Transition name="fade-complete" mode="out-in">
              <div v-if="taskJustCompleted && !isBusy" key="completed" class="completedRow">
                <span class="completed-icon">✓</span>
                <span class="completed-text">已完成</span>
              </div>
            </Transition>
            <div ref="endEl" />
          </template>
        </div>

        <div class="inputContainer">
          <!-- 任务面板 -->
          <div class="panels-row">
            <TaskPanel class="task-panel-wrapper" @execute-task="handleExecuteTask" />
          </div>
          <!-- Copilot 风格的待确认文件列表 -->
          <PendingFilesList
            v-if="permissionRequestsLen > 0"
            :permission-requests="permissionRequests"
          />
          <ChatInputBox
            :show-progress="true"
            :progress-percentage="progressPercentage"
            :conversation-working="isBusy"
            :attachments="attachments"
            :thinking-level="session?.thinkingLevel.value"
            :permission-mode="session?.permissionMode.value"
            :selected-model="session?.modelSelection.value"
            :is-exporting="session?.isExporting.value ?? false"
            :is-summarizing="session?.isSummarizing.value ?? false"
            :message-count="messages.length"
            :auto-approve-enabled="autoApproveEnabled"
            :confirm-write="confirmWrite"
            :confirm-edit="confirmEdit"
            :disabled="!hasWorkspace"
            :disabled-message="'请先在 VSCode 中打开一个项目文件夹'"
            @submit="handleSubmit"
            @stop="handleStop"
            @add-attachment="handleAddAttachment"
            @remove-attachment="handleRemoveAttachment"
            @thinking-toggle="handleToggleThinking"
            @mode-select="handleModeSelect"
            @model-select="handleModelSelect"
            @export-summary="handleExportSummary"
            @compact-now="handleCompactNow"
            @update:auto-approve-enabled="handleAutoApproveEnabledChange"
            @update:confirm-write="handleConfirmWriteChange"
            @update:confirm-edit="handleConfirmEditChange"
          />
        </div>
      <!-- </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, shallowRef, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue';
  import { RuntimeKey, PermissionRequestsKey } from '../composables/runtimeContext';
  import { useSession } from '../composables/useSession';
  import type { Session } from '../core/Session';
  import { PermissionRequest } from '../core/PermissionRequest';
  import type { ToolContext } from '../types/tool';
  import type { AttachmentItem } from '../types/attachment';
  import { convertFileToAttachment } from '../types/attachment';
  import ChatInputBox from '../components/ChatInputBox.vue';
  import TabBar from '../components/TabBar.vue';
  import PermissionRequestModal from '../components/PermissionRequestModal.vue';
  import PendingFilesList from '../components/PendingFilesList.vue';
  import TaskPanel from '../components/TaskPanel.vue';
  import Spinner from '../components/Messages/WaitingIndicator.vue';
  import ClaudeWordmark from '../components/ClaudeWordmark.vue';
  import RandomTip from '../components/RandomTip.vue';
  import MessageRenderer from '../components/Messages/MessageRenderer.vue';
  import { useKeybinding } from '../utils/useKeybinding';
  import { useSignal } from '@gn8/alien-signals-vue';
  import type { PermissionMode } from '../../../shared/permissions';

  const runtime = inject(RuntimeKey);
  if (!runtime) throw new Error('[ChatPage] runtime not provided');
  
  // 从 App 层级注入权限请求上下文
  const permissionRequestsContext = inject(PermissionRequestsKey);

  // 余额状态
  const balance = ref<number | null>(null);
  const balanceLoading = ref(false);

  // 获取余额
  async function fetchBalance() {
    balanceLoading.value = true;
    try {
      const connection = await runtime.connectionManager.get();
      const today = new Date().toISOString().slice(0, 10);
      const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [subResponse, usageResponse] = await Promise.all([
        connection.getSubscription(),
        connection.getUsage(firstDayOfMonth, today)
      ]);

      if (subResponse.subscription) {
        const hardLimit = subResponse.subscription.hardLimit;
        const usedAmount = usageResponse.usage ? usageResponse.usage.totalUsage / 100 : 0;
        balance.value = hardLimit - usedAmount;
      }
    } catch (error) {
      console.error('[ChatPage] Failed to fetch balance:', error);
    } finally {
      balanceLoading.value = false;
    }
  }

  const toolContext = computed<ToolContext>(() => ({
    fileOpener: {
      open: (filePath: string, location?: any) => {
        void runtime.appContext.fileOpener.open(filePath, location);
      },
      openContent: (content: string, fileName: string, editable: boolean) => {
        return runtime.appContext.fileOpener.openContent(
          content,
          fileName,
          editable
        );
      },
    },
    // 传递权限请求列表，用于在工具消息中显示内联确认按钮
    permissionRequests: permissionRequests.value,
    // 传递会话忙碌状态，用于在流式输出期间保持工具展开
    isBusy: isBusy.value,
  }));

  // 订阅 activeSession（alien-signal → Vue ref）
  const activeSessionRaw = useSignal<Session | undefined>(
    runtime.sessionStore.activeSession
  );

  // 🔧 修复：使用 shallowRef 缓存 useSession 的结果，避免每次访问都重新创建
  const sessionCache = shallowRef<ReturnType<typeof useSession> | null>(null);

  // 当 activeSession 变化时更新缓存
  watch(
    () => activeSessionRaw.value,
    (raw) => {
      console.log('[ChatPage] activeSession changed:', !!raw);
      if (raw) {
        sessionCache.value = useSession(raw);
      } else {
        sessionCache.value = null;
      }
    },
    { immediate: true }
  );

  // 使用缓存的 session
  const session = computed(() => sessionCache.value);

  // 现在所有访问都使用 Vue Ref（.value），添加更严格的防护
  const title = computed(() => {
    const s = session.value;
    if (!s || !s.summary) return 'New Conversation';
    return s.summary.value || 'New Conversation';
  });
  const messages = computed<any[]>(() => {
    const s = session.value;
    if (!s || !s.messages) return [];
    return s.messages.value ?? [];
  });
  const isBusy = computed(() => {
    const s = session.value;
    if (!s || !s.busy) return false;
    return s.busy.value ?? false;
  });
  const taskJustCompleted = computed(() => {
    const s = session.value;
    if (!s || !s.taskJustCompleted) return false;
    return s.taskJustCompleted.value ?? false;
  });
  const permissionMode = computed(() => {
    const s = session.value;
    if (!s || !s.permissionMode) return 'default';
    return s.permissionMode.value ?? 'default';
  });
  
  // ======= 权限请求：从 App 层级注入，按当前 session 过滤 =======
  // 所有权限请求（直接从注入的 context 获取）
  const allPermissionRequests = computed(() => permissionRequestsContext?.requests.value ?? []);
  
  // 过滤出当前 session 的权限请求
  const permissionRequests = computed(() => {
    const currentChannelId = activeSessionRaw.value?.claudeChannelId?.();
    const all = allPermissionRequests.value;
    
    // 如果没有 channelId，显示所有请求（避免因为 session 未初始化而丢失请求）
    if (!currentChannelId) {
      if (all.length > 0) {
        console.log('[ChatPage] permissionRequests: 无 channelId，显示所有', all.length, '个请求');
      }
      return all;
    }
    
    const filtered = all.filter(req => req.channelId === currentChannelId);
    if (all.length > 0) {
      console.log('[ChatPage] permissionRequests: channelId=', currentChannelId, 'all=', all.length, 'filtered=', filtered.length);
    }
    return filtered;
  });
  const permissionRequestsLen = computed(() => permissionRequests.value.length);
  
  // 处理权限请求的解决（允许或拒绝）
  function handlePermissionResolve(request: PermissionRequest, allow: boolean) {
    console.log('[ChatPage] 权限请求解决:', request.toolName, allow ? '允许' : '拒绝');
    if (allow) {
      request.accept(request.inputs, []);
    } else {
      request.reject('User rejected the operation', true);
    }
  }
  
  // 🔍 调试：监控权限请求数量变化（使用 watch 而不是在 computed 里打日志）
  watch([allPermissionRequests, permissionRequests], ([all, filtered]) => {
    const currentChannelId = activeSessionRaw.value?.claudeChannelId?.();
    console.log('[ChatPage] 🔔 权限请求变化: all=', all.length, 'filtered=', filtered.length, 'channelId=', currentChannelId);
  }, { immediate: true });
  
  const platform = computed(() => runtime.appContext.platform);
  const hasWorkspace = computed(() => runtime.appContext.hasWorkspace);

  // 注册命令：permissionMode.toggle（在下方定义函数后再注册）

  // 估算 Token 使用占比（基于 usageData）
  const progressPercentage = computed(() => {
    const s = session.value;
    if (!s) return 0;

    const usage = s.usageData.value;
    const total = usage.totalTokens;
    const windowSize = usage.contextWindow || 200000;

    if (typeof total === 'number' && total > 0) {
      return Math.max(0, Math.min(100, (total / windowSize) * 100));
    }

    return 0;
  });

  // DOM refs
  const containerEl = ref<HTMLDivElement | null>(null);
  const endEl = ref<HTMLDivElement | null>(null);

  // 附件状态管理
  const attachments = ref<AttachmentItem[]>([]);

  // 自动审批配置状态
  const autoApproveEnabled = ref(true);  // 总开关：默认启用
  const confirmWrite = ref(true);        // Write 工具需要确认
  const confirmEdit = ref(true);         // Edit 工具需要确认

  // 记录上次消息数量，用于判断是否需要滚动
  let prevCount = 0;

  // 🚀 性能优化：防抖滚动，避免频繁 DOM 操作
  let scrollRAF: number | null = null;
  let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

  function stringify(m: any): string {
    try {
      return JSON.stringify(m ?? {}, null, 2);
    } catch {
      return String(m);
    }
  }

  function scrollToBottom(): void {
    const end = endEl.value;
    if (!end) return;

    // 取消之前的滚动请求
    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF);
    }
    if (scrollTimeout !== null) {
      clearTimeout(scrollTimeout);
    }

    // 使用 RAF + 短延迟确保 DOM 更新完成
    scrollTimeout = setTimeout(() => {
      scrollRAF = requestAnimationFrame(() => {
        try {
          end.scrollIntoView({ block: 'end' });
        } catch {}
        scrollRAF = null;
      });
      scrollTimeout = null;
    }, 16); // ~60fps
  }

  watch(session, async () => {
    // 切换会话：复位并滚动底部
    prevCount = 0;
    await nextTick();
    scrollToBottom();
  });

  // moved above

  watch(
    () => messages.value.length,
    async len => {
      const increased = len > prevCount;
      prevCount = len;
      if (increased) {
        await nextTick();
        scrollToBottom();
      }
    }
  );

  watch(permissionRequestsLen, async () => {
    // 有权限请求出现时也确保滚动到底部
    await nextTick();
    scrollToBottom();
  });

  // 存储 autoTaskDisabled 事件监听器的清理函数
  let autoTaskDisabledCleanup: (() => void) | null = null;

  onMounted(async () => {
    prevCount = messages.value.length;
    await nextTick();
    scrollToBottom();

    // 获取余额
    fetchBalance();

    // 初始化时同步自动审批配置到后端
    syncAutoApproveConfig();

    // 监听自动任务被禁用事件，立即清空待执行任务
    try {
      const connection = await runtime.connectionManager.get();
      autoTaskDisabledCleanup = connection.autoTaskDisabled.add(() => {
        console.log('[ChatPage] 收到自动任务禁用通知，清空待执行任务');
        pendingAutoTask.value = null;
      });
    } catch (e) {
      console.error('[ChatPage] 监听 autoTaskDisabled 失败:', e);
    }
  });

  // 同步自动审批配置到后端
  async function syncAutoApproveConfig() {
    try {
      const connection = await runtime.connectionManager.get();
      console.log('[ChatPage] 初始化同步自动审批配置:', {
        autoApproveEnabled: autoApproveEnabled.value,
        confirmWrite: confirmWrite.value,
        confirmEdit: confirmEdit.value
      });
      await connection.setAutoApproveConfig({
        autoApproveEnabled: autoApproveEnabled.value,
        confirmWrite: confirmWrite.value,
        confirmEdit: confirmEdit.value
      });
      console.log('[ChatPage] 自动审批配置同步成功');
    } catch (e) {
      console.error('[ChatPage] 自动审批配置同步失败:', e);
    }
  }

  onUnmounted(() => {
    try { unregisterToggle?.(); } catch {}
    // 清理 autoTaskDisabled 事件监听器
    try { autoTaskDisabledCleanup?.(); } catch {}
    // 🚀 清理滚动相关定时器
    if (scrollRAF !== null) {
      cancelAnimationFrame(scrollRAF);
    }
    if (scrollTimeout !== null) {
      clearTimeout(scrollTimeout);
    }
  });

  async function createNew(): Promise<void> {
    if (!runtime) return;

    // 1. 先尝试通过 appContext.startNewConversationTab 创建新标签（多标签模式）
    if (runtime.appContext.startNewConversationTab()) {
      return;
    }

    // 2. 如果不是多标签模式，检查当前会话是否为空
    const currentMessages = messages.value;
    if (currentMessages.length === 0) {
      // 当前已经是空会话，无需创建新会话
      return;
    }

    // 3. 当前会话有内容，创建新会话
    await runtime.sessionStore.createSession({ isExplicit: true });
  }

  // ChatInput 事件处理
  async function handleSubmit(content: string) {
    const s = session.value;
    const trimmed = (content || '').trim();
    if (!s || (!trimmed && attachments.value.length === 0) || isBusy.value) return;

    try {
      // 传递附件给 send 方法
      await s.send(trimmed || ' ', attachments.value);

      // 发送成功后清空附件
      attachments.value = [];
    } catch (e) {
      console.error('[ChatPage] send failed', e);
    }
  }

  // 待执行的自动任务（用于在 Claude 空闲后自动执行）
  const pendingAutoTask = ref<string | null>(null);

  // 处理自动任务执行
  async function handleExecuteTask(prompt: string) {
    console.log('[ChatPage] 收到自动任务请求:', prompt);
    const s = session.value;
    
    if (!s) {
      console.log('[ChatPage] 无法执行任务: session 不存在');
      return;
    }

    if (isBusy.value) {
      console.log('[ChatPage] Claude 正忙，任务已加入待执行队列');
      pendingAutoTask.value = prompt;
      return;
    }

    try {
      pendingAutoTask.value = null; // 清除待执行任务
      await s.send(prompt, []);
    } catch (e) {
      console.error('[ChatPage] 执行任务失败', e);
    }
  }

  // 监听 isBusy 变化，当空闲时执行待执行任务
  watch(isBusy, async (newBusy, oldBusy) => {
    // 从忙碌变为空闲
    if (oldBusy && !newBusy) {
      console.log('[ChatPage] Claude 变为空闲状态');
      
      // 延迟一小段时间，确保上一个任务完全结束
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 检查是否有待执行任务
      if (pendingAutoTask.value && session.value && !isBusy.value) {
        console.log('[ChatPage] 执行待执行的自动任务:', pendingAutoTask.value);
        const prompt = pendingAutoTask.value;
        pendingAutoTask.value = null;
        
        try {
          await session.value.send(prompt, []);
        } catch (e) {
          console.error('[ChatPage] 执行待执行任务失败', e);
        }
      }
    }
  });

  async function handleToggleThinking() {
    const s = session.value;
    if (!s) return;

    const currentLevel = s.thinkingLevel.value;
    const newLevel = currentLevel === 'off' ? 'default_on' : 'off';

    await s.setThinkingLevel(newLevel);
  }

  async function handleModeSelect(mode: PermissionMode) {
    const s = session.value;
    if (!s) return;

    await s.setPermissionMode(mode);
  }

  // permissionMode.toggle：按固定顺序轮转
  const togglePermissionMode = () => {
    const s = session.value;
    if (!s) return;
    const order: PermissionMode[] = ['default', 'acceptEdits', 'plan'];
    const cur = (s.permissionMode.value as PermissionMode) ?? 'default';
    const idx = Math.max(0, order.indexOf(cur));
    const next = order[(idx + 1) % order.length];
    void s.setPermissionMode(next);
  };

  // 现在注册命令（toggle 已定义）
  const unregisterToggle = runtime.appContext.commandRegistry.registerAction(
    {
      id: 'permissionMode.toggle',
      label: 'Toggle Permission Mode',
      description: 'Cycle permission mode in fixed order'
    },
    'App Shortcuts',
    () => {
      togglePermissionMode();
    }
  );

  // 注册快捷键：shift+tab → permissionMode.toggle（允许在输入区生效）
  useKeybinding({
    keys: 'shift+tab',
    handler: togglePermissionMode,
    allowInEditable: true,
    priority: 100,
  });

  async function handleModelSelect(modelId: string) {
    console.log(`[ChatPage.handleModelSelect] 收到模型切换请求: ${modelId}`);

    const s = session.value;
    if (!s) {
      console.warn('[ChatPage.handleModelSelect] session 为空，无法切换模型');
      return;
    }

    console.log(`[ChatPage.handleModelSelect] 调用 session.setModel({ value: "${modelId}" })`);
    const result = await s.setModel({ value: modelId });
    console.log(`[ChatPage.handleModelSelect] setModel 返回: ${result}`);
  }

  function handleStop() {
    const s = session.value;
    if (s) {
      // 方法已经在 useSession 中绑定，可以直接调用
      void s.interrupt();
    }
  }

  async function handleAddAttachment(files: FileList) {
    if (!files || files.length === 0) return;

    try {
      // 将所有文件转换为 AttachmentItem
      const conversions = await Promise.all(
        Array.from(files).map(convertFileToAttachment)
      );

      // 添加到附件列表
      attachments.value = [...attachments.value, ...conversions];

      console.log('[ChatPage] Added attachments:', conversions.map(a => a.fileName));
    } catch (e) {
      console.error('[ChatPage] Failed to convert files:', e);
    }
  }

  function handleRemoveAttachment(id: string) {
    attachments.value = attachments.value.filter(a => a.id !== id);
  }

  // 导出会话总结到 MD 文件，然后创建新会话
  async function handleExportSummary() {
    const s = session.value;
    if (!s) return;

    console.log('[ChatPage] Exporting conversation summary to markdown...');
    const success = await s.exportSummaryToMarkdown();

    // 导出成功后创建新会话（归零）
    if (success) {
      console.log('[ChatPage] Export successful, creating new session...');
      await createNew();
    }
  }

  // 压缩对话历史
  async function handleCompactNow() {
    const s = session.value;
    if (!s) return;

    console.log('[ChatPage] Compacting conversation with summary...');
    await s.compactWithSummary();
  }

  // 自动审批确认状态变更处理
  async function handleAutoApproveEnabledChange(value: boolean) {
    autoApproveEnabled.value = value;
    console.log('[ChatPage] Auto approve enabled changed:', value);

    // 通知后端更新自动审批配置
    try {
      const connection = await runtime.connectionManager.get();
      const result = await connection.setAutoApproveConfig({
        autoApproveEnabled: value,
        confirmWrite: confirmWrite.value,
        confirmEdit: confirmEdit.value
      });
      console.log('[ChatPage] setAutoApproveConfig result:', result);
    } catch (e) {
      console.error('[ChatPage] Failed to update auto-approve config:', e);
    }
  }

  async function handleConfirmWriteChange(value: boolean) {
    confirmWrite.value = value;
    console.log('[ChatPage] Confirm write changed:', value);

    // 通知后端更新自动审批配置
    try {
      const connection = await runtime.connectionManager.get();
      const result = await connection.setAutoApproveConfig({
        autoApproveEnabled: autoApproveEnabled.value,
        confirmWrite: value,
        confirmEdit: confirmEdit.value
      });
      console.log('[ChatPage] setAutoApproveConfig result:', result);
    } catch (e) {
      console.error('[ChatPage] Failed to update auto-approve config:', e);
    }
  }

  async function handleConfirmEditChange(value: boolean) {
    confirmEdit.value = value;
    console.log('[ChatPage] Confirm edit changed:', value);

    // 通知后端更新自动审批配置
    try {
      const connection = await runtime.connectionManager.get();
      const result = await connection.setAutoApproveConfig({
        autoApproveEnabled: autoApproveEnabled.value,
        confirmWrite: confirmWrite.value,
        confirmEdit: value
      });
      console.log('[ChatPage] setAutoApproveConfig result:', result);
    } catch (e) {
      console.error('[ChaFailed to update auto-approve config:', e);
    }
  }
</script>

<style scoped>
  .chat-page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .chat-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--vscode-panel-border);
    min-height: 32px;
    padding: 0 12px;
    background: var(--vscode-sideBar-background);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
    flex: 1;
  }

  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-titleBar-activeForeground);
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
    opacity: 0.7;
  }

  .menu-btn .codicon {
    font-size: 12px;
  }

  .menu-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .chat-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--vscode-titleBar-activeForeground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .header-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-titleBar-activeForeground);
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
    opacity: 0.7;
  }

  .header-btn .codicon {
    font-size: 12px;
  }

  .header-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .balance-display {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    white-space: nowrap;
  }

  .balance-display .codicon {
    font-size: 12px;
  }

  .balance-display.loading {
    opacity: 0.6;
  }

  .new-chat-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: var(--vscode-titleBar-activeForeground);
    border-radius: 3px;
    cursor: pointer;
    transition: background-color 0.2s;
    opacity: 0.7;
  }

  .new-chat-btn .codicon {
    font-size: 12px;
  }

  .new-chat-btn:hover {
    background: var(--vscode-toolbar-hoverBackground);
    opacity: 1;
  }

  .main {
    flex: 1;
    display: flex;
    flex-direction: column;
    position: relative;
    overflow: hidden;
  }

  /* Chat 容器与消息滚动容器（对齐 React） */
  .chatContainer {
    position: relative;
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .messagesContainer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 12px 8px 16px;
    position: relative;
    background: linear-gradient(
      180deg,
      var(--vscode-editor-background) 0%,
      var(--vscode-sideBar-background) 100%
    );
  }

  .msg-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 0 12px;
  }

  .msg-item {
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 6px;
    padding: 8px;
  }

  .json-block {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(
      --app-monospace-font-family,
      ui-monospace,
      SFMono-Regular,
      Menlo,
      Monaco,
      Consolas,
      'Liberation Mono',
      'Courier New',
      monospace
    );
    font-size: var(--app-monospace-font-size, 12px);
    line-height: 1.5;
    color: var(--vscode-editor-foreground);
  }

  /* 其他样式复用 */

  /* 输入区域容器 */
  .inputContainer {
    padding: 8px 12px 12px;
    border-top: 1px solid var(--vscode-panel-border);
    background: var(--vscode-sideBar-background);
    box-shadow: 0 -8px 20px rgba(0, 0, 0, 0.08);
  }

  /* 任务面板布局 */
  .panels-row {
    display: flex;
    flex-direction: row;
    gap: 6px;
    margin-bottom: 4px;
  }

  .task-panel-wrapper {
    flex: 1;
    min-width: 0;
  }

  /* 底部对话框区域钉在底部 */
  .main > :last-child {
    flex-shrink: 0;
    width: 100%;
  }

  /* 空状态样式 */
  .emptyState {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 32px 16px;
  }

  .emptyWordmark {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  }

  /* 无工作区提示样式 */
  .noWorkspaceHint {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    gap: 8px;
  }

  .noWorkspaceHint .codicon {
    font-size: 32px;
    color: var(--vscode-textLink-foreground);
    margin-bottom: 8px;
  }

  .noWorkspaceHint p {
    margin: 0;
    font-size: 14px;
    color: var(--vscode-foreground);
  }

  .noWorkspaceHint .hint-sub {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }

  /* 任务完成提示样式 */
  .completedRow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px 4px 24px;
    color: var(--vscode-testing-iconPassed, #4caf50);
    font-size: 12px;
    font-weight: 500;
  }

  .completed-icon {
    font-size: 14px;
    font-weight: bold;
  }

  .completed-text {
    color: var(--vscode-descriptionForeground);
  }

  /* 完成提示进入动画（保持显示直到用户发新消息） */
  .fade-complete-enter-active {
    transition: opacity 0.3s ease-out;
  }

  .fade-complete-enter-from {
    opacity: 0;
  }
</style>

<!-- 非 scoped 样式，用于 Teleport 渲染的元素 -->
<style>
  .permission-modals-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 1000;
    display: flex;
    align-items: flex-end;
    padding: 16px;
  }

  .permission-modals-container {
    width: 100%;
    max-height: 60vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
</style>
