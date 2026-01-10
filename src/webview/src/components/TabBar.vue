<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <div
        v-for="(session, index) in sessions"
        :key="session.sessionId() || `new-${index}`"
        :class="['tab', { active: isActive(session) }]"
        :title="getSessionTitle(session)"
        @click="switchTo(session)"
      >
        <span class="tab-icon codicon codicon-comment-discussion"></span>
        <span class="tab-title">{{ getSessionTitle(session) }}</span>
        <button
          v-if="sessions.length > 1"
          class="tab-close"
          title="关闭会话"
          @click.stop="close(session)"
        >
          <span class="codicon codicon-close"></span>
        </button>
      </div>
    </div>
    <button class="new-tab-btn" title="新建会话" @click="createNew">
      <span class="codicon codicon-plus"></span>
    </button>
    <button class="settings-btn" title="设置" @click="openSettings">
      <span class="codicon codicon-gear"></span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSignal } from '@gn8/alien-signals-vue';
import type { Session } from '../core/Session';

const runtime = inject(RuntimeKey);
if (!runtime) throw new Error('[TabBar] runtime not provided');

// 订阅 sessions 列表和 activeSession
const sessionsRaw = useSignal(runtime.sessionStore.sessions);
const activeSessionRaw = useSignal(runtime.sessionStore.activeSession);

// 始终显示当前活跃会话，即使没有消息
const sessions = computed(() => {
  const all = sessionsRaw.value || [];
  const active = activeSessionRaw.value;

  // 如果没有任何会话，返回空数组
  if (all.length === 0) {
    return [];
  }

  // 过滤：有消息的会话 + 当前活跃会话
  const filtered = all.filter(s => {
    const hasMessages = s.messages().length > 0 || s.messageCount() > 0;
    const isCurrentActive = s === active;
    return hasMessages || isCurrentActive;
  });

  // 确保至少有当前活跃会话
  if (filtered.length === 0 && active) {
    return [active];
  }

  return filtered.slice(0, 10); // 最多显示 10 个标签
});

function isActive(session: Session): boolean {
  return session === activeSessionRaw.value;
}

function getSessionTitle(session: Session): string {
  const summary = session.summary();
  if (summary) {
    return summary.length > 20 ? summary.slice(0, 19) + '…' : summary;
  }
  return 'New Chat';
}

function switchTo(session: Session): void {
  runtime!.sessionStore.setActiveSession(session);
}

async function createNew(): Promise<void> {
  await runtime!.sessionStore.createSession({ isExplicit: true });
}

const emit = defineEmits<{
  (e: 'openSettings'): void;
}>();

function openSettings(): void {
  emit('openSettings');
}

async function close(session: Session): Promise<void> {
  const store = runtime!.sessionStore;
  const currentSessions = sessionsRaw.value || [];

  // 如果只剩一个会话，不允许关闭
  if (currentSessions.length <= 1) {
    return;
  }

  // 如果关闭的是当前活跃会话，切换到相邻会话
  if (isActive(session)) {
    const idx = currentSessions.indexOf(session);
    const nextSession = currentSessions[idx + 1] || currentSessions[idx - 1];
    if (nextSession) {
      store.setActiveSession(nextSession);
    }
  }

  // 从列表中移除
  store.closeSession(session);
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  background: var(--vscode-tab-inactiveBackground, var(--vscode-sideBar-background));
  border-bottom: 1px solid var(--vscode-panel-border);
  min-height: 35px;
  padding: 0 4px;
  gap: 2px;
  overflow: hidden;
}

.tabs-container {
  display: flex;
  align-items: center;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: 4px 4px 0 0;
  cursor: pointer;
  color: var(--vscode-tab-inactiveForeground, var(--vscode-foreground));
  font-size: 12px;
  white-space: nowrap;
  max-width: 160px;
  min-width: 80px;
  transition: background-color 0.15s, color 0.15s;
  position: relative;
}

.tab:hover {
  background: var(--vscode-tab-hoverBackground, rgba(255, 255, 255, 0.1));
}

.tab.active {
  background: var(--vscode-tab-activeBackground, var(--vscode-editor-background));
  color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
}

.tab.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--vscode-focusBorder, #007acc);
}

.tab-icon {
  font-size: 14px;
  opacity: 0.7;
  flex-shrink: 0;
}

.tab.active .tab-icon {
  opacity: 1;
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.tab-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 3px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, background-color 0.15s;
  flex-shrink: 0;
}

.tab:hover .tab-close,
.tab.active .tab-close {
  opacity: 0.6;
}

.tab-close:hover {
  opacity: 1 !important;
  background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
}

.tab-close .codicon {
  font-size: 12px;
}

.new-tab-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s, background-color 0.15s;
  flex-shrink: 0;
}

.new-tab-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
}

.new-tab-btn .codicon {
  font-size: 14px;
}

.settings-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s, background-color 0.15s;
  flex-shrink: 0;
}

.settings-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
}

.settings-btn .codicon {
  font-size: 14px;
}
</style>
