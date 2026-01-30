/**
 * useSession - Vue Composable for Session
 *
 * 核心功能：
 * 1. 将 Session 类的 alien-signals 转换为 Vue refs
 * 2. 将 alien computed 转换为 Vue computed
 * 3. 提供 Vue-friendly 的 API
 *
 * 使用方法：
 * ```typescript
 * const session = new Session(...);
 * const sessionAPI = useSession(session);
 * // sessionAPI.messages 是 Vue Ref<any[]>
 * // sessionAPI.busy 是 Vue Ref<boolean>
 * ```
 */

import { computed, ref } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import { effect } from 'alien-signals';
import type { PermissionMode } from '../../../shared/permissions';
import type { Session, SelectionRange } from '../core/Session';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { BaseTransport } from '../transport/BaseTransport';
import type { ModelOption } from '../../../shared/messages';

/**
 * useSession 返回类型
 */
export interface UseSessionReturn {
  // 基础状态
  connection: Ref<BaseTransport | undefined>;
  busy: Ref<boolean>;
  isLoading: Ref<boolean>;
  error: Ref<string | undefined>;
  sessionId: Ref<string | undefined>;
  isExplicit: Ref<boolean>;
  lastModifiedTime: Ref<number>;

  // 核心数据
  messages: Ref<any[]>;
  messageCount: Ref<number>;
  cwd: Ref<string | undefined>;
  permissionMode: Ref<PermissionMode>;
  summary: Ref<string | undefined>;
  modelSelection: Ref<string | undefined>;
  thinkingLevel: Ref<string>;
  todos: Ref<any[]>;
  worktree: Ref<{ name: string; path: string } | undefined>;
  selection: Ref<SelectionRange | undefined>;

  // 使用统计
  usageData: Ref<{
    totalTokens: number;
    totalCost: number;
    contextWindow: number;
  }>;

  // 上下文压缩状态
  isCompacting: Ref<boolean>;
  isSummarizing: Ref<boolean>;
  isExporting: Ref<boolean>;

  // 计算属性
  claudeConfig: ComputedRef<any>;
  config: ComputedRef<any>;
  permissionRequests: ComputedRef<PermissionRequest[]>;

  // 派生状态
  isOffline: ComputedRef<boolean>;

  // 方法
  getConnection: () => Promise<BaseTransport>;
  preloadConnection: () => Promise<void>;
  loadFromServer: () => Promise<void>;
  send: (
    input: string,
    attachments?: Array<{ fileName: string; mediaType: string; data: string }>,
    includeSelection?: boolean
  ) => Promise<void>;
  launchClaude: () => Promise<string>;
  interrupt: () => Promise<void>;
  restartClaude: () => Promise<void>;
  listFiles: (pattern?: string) => Promise<any>;
  setPermissionMode: (mode: PermissionMode, applyToConnection?: boolean) => Promise<boolean>;
  setModel: (model: ModelOption) => Promise<boolean>;
  setThinkingLevel: (level: string) => Promise<void>;
  getMcpServers: () => Promise<any>;
  openConfigFile: (configType: string) => Promise<void>;
  updateCwd: (newCwd: string, restartIfActive?: boolean) => Promise<void>;
  onPermissionRequested: (callback: (request: PermissionRequest) => void) => () => void;
  dispose: () => void;

  // 上下文压缩方法
  compactWithSummary: () => Promise<void>;

  // 导出总结方法
  exportSummaryToMarkdown: () => Promise<boolean>;

  // 原始实例（用于高级场景）
  __session: Session;
}

/**
 * useSession - 将 Session 实例包装为 Vue Composable API
 *
 * @param session Session 实例
 * @returns Vue-friendly API
 */
export function useSession(session: Session): UseSessionReturn {
  //  使用官方 useSignal 桥接 signals/computed
  const connection = useSignal(session.connection);
  const busy = useSignal(session.busy);
  const isLoading = useSignal(session.isLoading);
  const error = useSignal(session.error);
  const sessionId = useSignal(session.sessionId);
  const isExplicit = useSignal(session.isExplicit);
  const lastModifiedTime = useSignal(session.lastModifiedTime);
  const messages = useSignal(session.messages);
  const messageCount = useSignal(session.messageCount);
  const cwd = useSignal(session.cwd);
  const permissionMode = useSignal(session.permissionMode);
  const summary = useSignal(session.summary);
  const modelSelection = useSignal(session.modelSelection);
  const thinkingLevel = useSignal(session.thinkingLevel);
  const todos = useSignal(session.todos);
  const worktree = useSignal(session.worktree);
  const selection = useSignal(session.selection);
  const usageData = useSignal(session.usageData);
  const isCompacting = useSignal(session.isCompacting);
  const isSummarizing = useSignal(session.isSummarizing);
  const isExporting = useSignal(session.isExporting);

  //  使用 Vue computed 包装 alien-signals 的 computed（只读）
  // 🔥 useSignal 只支持 WritableSignal（signal() 创建的），不支持只读的 computed
  const claudeConfig = computed(() => session.claudeConfig());
  const config = computed(() => session.config());

  // 🔧 修复：直接监听 BaseTransport.permissionRequests signal
  // 问题：Session.permissionRequests computed 的依赖追踪有问题
  // 解决方案：在 effect 中直接读取 connection().permissionRequests()
  const permissionRequestsRef = ref<PermissionRequest[]>([]);
  effect(() => {
    const conn = session.connection();
    const channelId = session.claudeChannelId();
    console.log('[useSession] effect 触发 - conn:', !!conn, 'channelId:', channelId);

    if (!conn || !channelId) {
      permissionRequestsRef.value = [];
      return;
    }

    // 直接读取 BaseTransport 的 permissionRequests signal
    const allRequests = conn.permissionRequests();
    console.log('[useSession] 所有请求:', allRequests.length);

    const filtered = allRequests.filter(req => req.channelId === channelId);
    console.log('[useSession] 过滤后请求:', filtered.length);

    permissionRequestsRef.value = [...filtered];
  });

  // 直接暴露 ref，不包装成 computed
  const permissionRequests = permissionRequestsRef;

  //  派生状态（临时保留 Vue computed）
  const isOffline = computed(() => session.isOffline());

  //  绑定所有方法（确保 this 指向正确）
  const getConnection = session.getConnection.bind(session);
  const preloadConnection = session.preloadConnection.bind(session);
  const loadFromServer = session.loadFromServer.bind(session);
  const send = session.send.bind(session);
  const launchClaude = session.launchClaude.bind(session);
  const interrupt = session.interrupt.bind(session);
  const restartClaude = session.restartClaude.bind(session);
  const listFiles = session.listFiles.bind(session);
  const setPermissionMode = session.setPermissionMode.bind(session);
  const setModel = session.setModel.bind(session);
  const setThinkingLevel = session.setThinkingLevel.bind(session);
  const getMcpServers = session.getMcpServers.bind(session);
  const openConfigFile = session.openConfigFile.bind(session);
  const updateCwd = session.updateCwd.bind(session);
  const onPermissionRequested = session.onPermissionRequested.bind(session);
  const dispose = session.dispose.bind(session);
  const compactWithSummary = session.compactWithSummary.bind(session);
  const exportSummaryToMarkdown = session.exportSummaryToMarkdown.bind(session);

  return {
    // 状态
    connection,
    busy,
    isLoading,
    error,
    sessionId,
    isExplicit,
    lastModifiedTime,
    messages,
    messageCount,
    cwd,
    permissionMode,
    summary,
    modelSelection,
    thinkingLevel,
    todos,
    worktree,
    selection,
    usageData,
    isCompacting,
    isSummarizing,
    isExporting,

    // 计算属性
    claudeConfig,
    config,
    permissionRequests,
    isOffline,

    // 方法
    getConnection,
    preloadConnection,
    loadFromServer,
    send,
    launchClaude,
    interrupt,
    restartClaude,
    listFiles,
    setPermissionMode,
    setModel,
    setThinkingLevel,
    getMcpServers,
    openConfigFile,
    updateCwd,
    onPermissionRequested,
    dispose,
    compactWithSummary,
    exportSummaryToMarkdown,

    // 原始实例
    __session: session,
  };
}
