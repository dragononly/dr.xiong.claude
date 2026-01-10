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
          :class="['messagesContainer', 'custom-scroll-container', { dimmed: permissionRequestsLen > 0 }]"
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
            <div ref="endEl" />
          </template>
        </div>

        <div class="inputContainer">
          <PermissionRequestModal
            v-if="pendingPermission && toolContext"
            :request="pendingPermission"
            :context="toolContext"
            :on-resolve="handleResolvePermission"
            data-permission-panel="1"
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
            @submit="handleSubmit"
            @stop="handleStop"
            @add-attachment="handleAddAttachment"
            @remove-attachment="handleRemoveAttachment"
            @thinking-toggle="handleToggleThinking"
            @mode-select="handleModeSelect"
            @model-select="handleModelSelect"
            @export-summary="handleExportSummary"
            @compact-now="handleCompactNow"
          />
        </div>
      <!-- </div> -->
    </div>
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, inject, onMounted, onUnmounted, nextTick, watch } from 'vue';
  import { RuntimeKey } from '../composables/runtimeContext';
  import { useSession } from '../composables/useSession';
  import type { Session } from '../core/Session';
  import type { PermissionRequest } from '../core/PermissionRequest';
  import type { ToolContext } from '../types/tool';
  import type { AttachmentItem } from '../types/attachment';
  import { convertFileToAttachment } from '../types/attachment';
  import ChatInputBox from '../components/ChatInputBox.vue';
  import TabBar from '../components/TabBar.vue';
  import PermissionRequestModal from '../components/PermissionRequestModal.vue';
  import Spinner from '../components/Messages/WaitingIndicator.vue';
  import ClaudeWordmark from '../components/ClaudeWordmark.vue';
  import RandomTip from '../components/RandomTip.vue';
  import MessageRenderer from '../components/Messages/MessageRenderer.vue';
  import { useKeybinding } from '../utils/useKeybinding';
  import { useSignal } from '@gn8/alien-signals-vue';
  import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk';

  const runtime = inject(RuntimeKey);
  if (!runtime) throw new Error('[ChatPage] runtime not provided');

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
  }));

  // 订阅 activeSession（alien-signal → Vue ref）
  const activeSessionRaw = useSignal<Session | undefined>(
    runtime.sessionStore.activeSession
  );

  // 使用 useSession 将 alien-signals 转换为 Vue Refs
  const session = computed(() => {
    const raw = activeSessionRaw.value;
    return raw ? useSession(raw) : null;
  });

  // 现在所有访问都使用 Vue Ref（.value）
  const title = computed(() => session.value?.summary.value || 'New Conversation');
  const messages = computed<any[]>(() => session.value?.messages.value ?? []);
  const isBusy = computed(() => session.value?.busy.value ?? false);
  const permissionMode = computed(
    () => session.value?.permissionMode.value ?? 'default'
  );
  const permissionRequests = computed(
    () => session.value?.permissionRequests.value ?? []
  );
  const permissionRequestsLen = computed(() => permissionRequests.value.length);
  const pendingPermission = computed(() => permissionRequests.value[0] as any);
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

  onMounted(async () => {
    prevCount = messages.value.length;
    await nextTick();
    scrollToBottom();

    // 获取余额
    fetchBalance();
  });

  onUnmounted(() => {
    try { unregisterToggle?.(); } catch {}
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

  // Permission modal handler
  function handleResolvePermission(request: PermissionRequest, allow: boolean) {
    try {
      if (allow) {
        request.accept(request.inputs);
      } else {
        request.reject('User denied', true);
      }
    } catch (e) {
      console.error('[ChatPage] permission resolve failed', e);
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
  .messagesContainer.dimmed {
    filter: blur(1px);
    opacity: 0.5;
    pointer-events: none;
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
</style>
