import { onMounted, onUnmounted, watch } from 'vue';
import { signal, effect } from 'alien-signals';
import { EventEmitter } from '../utils/events';
import { ConnectionManager } from '../core/ConnectionManager';
import { VSCodeTransport } from '../transport/VSCodeTransport';
import { AppContext } from '../core/AppContext';
import { SessionStore } from '../core/SessionStore';
import type { SelectionRange } from '../core/Session';

export interface RuntimeInstance {
  connectionManager: ConnectionManager;
  appContext: AppContext;
  sessionStore: SessionStore;
  atMentionEvents: EventEmitter<string>;
  selectionEvents: EventEmitter<any>;
}

export function useRuntime(): RuntimeInstance {
  const atMentionEvents = new EventEmitter<string>();
  const selectionEvents = new EventEmitter<any>();

  const connectionManager = new ConnectionManager(() => new VSCodeTransport(atMentionEvents, selectionEvents));
  const appContext = new AppContext(connectionManager);

  // 创建 alien-signal 用于 SessionContext
  // AppContext.currentSelection 是 Vue Ref，但 SessionContext 需要 alien-signal
  const currentSelectionSignal = signal<SelectionRange | undefined>(undefined);

  // 双向同步 Vue Ref ↔ Alien Signal
  // Vue Ref → Alien Signal
  watch(
    () => appContext.currentSelection(),
    (newValue) => {
      currentSelectionSignal(newValue);
    },
    { immediate: true }
  );

  const sessionStore = new SessionStore(connectionManager, {
    commandRegistry: appContext.commandRegistry,
    currentSelection: currentSelectionSignal,
    fileOpener: appContext.fileOpener,
    showNotification: appContext.showNotification?.bind(appContext),
    startNewConversationTab: appContext.startNewConversationTab?.bind(appContext),
    renameTab: appContext.renameTab?.bind(appContext),
    openURL: appContext.openURL.bind(appContext)
  });

  selectionEvents.add((selection) => {
    appContext.currentSelection(selection);
  });

  // SessionStore 内部的 effect 会自动监听 connection 建立并拉取会话列表

  // 监听 claudeConfig 变化并注册 Slash Commands
  let slashCommandDisposers: Array<() => void> = [];

  const cleanupSlashCommands = effect(() => {
    const connection = connectionManager.connection();
    const claudeConfig = connection?.claudeConfig();

    // 清理旧的 Slash Commands
    slashCommandDisposers.forEach(dispose => dispose());
    slashCommandDisposers = [];

    // 注册新的 Slash Commands
    if (claudeConfig?.slashCommands && Array.isArray(claudeConfig.slashCommands)) {
      slashCommandDisposers = claudeConfig.slashCommands
        .filter((cmd: any) => typeof cmd?.name === 'string' && cmd.name)
        .map((cmd: any) => {
          return appContext.commandRegistry.registerAction(
            {
              id: `slash-command-${cmd.name}`,
              label: `/${cmd.name}`,
              description: typeof cmd?.description === 'string' ? cmd.description : undefined
            },
            'Slash Commands',
            () => {
              console.log('[Runtime] Execute slash command:', cmd.name);
              const activeSession = sessionStore.activeSession();
              if (activeSession) {
                void activeSession.send(`/${cmd.name}`, [], false);
              } else {
                console.warn('[Runtime] No active session to execute slash command');
              }
            }
          );
        });

      console.log('[Runtime] Registered', slashCommandDisposers.length, 'slash commands');
    }
  });

  // 工作区变化监听器清理函数
  let workspaceChangeCleanup: (() => void) | null = null;

  onMounted(() => {
    let disposed = false;

    (async () => {
      const connection = await connectionManager.get();
      try { await connection.opened; } catch (e) { console.error('[runtime] open failed', e); return; }

      if (disposed) return;

      // 🚀 性能优化：并行化初始化请求
      const [selectionResult, assetsResult] = await Promise.allSettled([
        connection.getCurrentSelection(),
        connection.getAssetUris(),
        sessionStore.listSessions()  // 同时开始加载 sessions
      ]);

      if (disposed) return;

      // 处理 selection 结果
      if (selectionResult.status === 'fulfilled') {
        appContext.currentSelection(selectionResult.value?.selection ?? undefined);
      } else {
        console.warn('[runtime] selection fetch failed', selectionResult.reason);
      }

      // 处理 assets 结果
      if (assetsResult.status === 'fulfilled') {
        appContext.assetUris(assetsResult.value?.assetUris);
      } else {
        console.warn('[runtime] assets fetch failed', assetsResult.reason);
      }

      // 监听工作区变化事件
      workspaceChangeCleanup = connection.workspaceChanged.add((info) => {
        console.log('[Runtime] 工作区变化:', info);
        // 更新所有 Session 的 cwd（不仅仅是 activeSession）
        for (const session of sessionStore.sessions()) {
          // 只更新尚未启动 Claude 的 Session 的 cwd
          // 已启动的 Session 会收到 workspace_changed 消息并显示提示
          if (!session.busy()) {
            session.cwd(info.defaultCwd);
          }
        }
        // 对于活跃 Session，调用 updateCwd 以显示工作区变化提示
        const activeSession = sessionStore.activeSession();
        if (activeSession) {
          void activeSession.updateCwd(info.defaultCwd, false, info.workspaceFolders);
        }
      });

      // sessions 已在上面并行加载，这里只需检查是否需要创建新会话
      if (!disposed && !sessionStore.activeSession()) {
        await sessionStore.createSession({ isExplicit: false });
      }
    })();

    onUnmounted(() => {
      disposed = true;

      // 清理工作区变化监听
      if (workspaceChangeCleanup) {
        workspaceChangeCleanup();
        workspaceChangeCleanup = null;
      }

      // 清理命令注册
      slashCommandDisposers.forEach(dispose => dispose());
      cleanupSlashCommands();

      connectionManager.close();
    });
  });

  return { connectionManager, appContext, sessionStore, atMentionEvents, selectionEvents };
}

