<template>
  <div class="app-wrapper">
    <main class="app-main">
      <div class="page-container">
        <Motion
          :animate="pageAnimation"
          :transition="{ duration: 0.3, ease: 'easeOut' }"
          class="motion-wrapper"
        >
          <SessionsPage
            v-if="currentPage === 'sessions'"
            key="sessions"
            @switch-to-chat="handleSwitchToChat"
          />
          <ChatPage
            v-else-if="currentPage === 'chat'"
            key="chat"
            @switch-to-sessions="switchToPage('sessions')"
            @switch-to-settings="switchToPage('settings')"
            @switch-to-todos="switchToPage('todos')"
          />
          <SettingsPage
            v-else-if="currentPage === 'settings'"
            key="settings"
            @back-to-chat="switchToPage('chat')"
          />
          <TodosPage
            v-else-if="currentPage === 'todos'"
            key="todos"
            @back-to-chat="switchToPage('chat')"
          />
          <!-- IconTestPage -->
          <!-- <IconTestPage
            v-else-if="currentPage === 'icontest'"
            key="icontest"
          /> -->
        </Motion>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, provide, computed, toRaw } from 'vue';
import { Motion } from 'motion-v';
import SessionsPage from './pages/SessionsPage.vue';
import ChatPage from './pages/ChatPage.vue';
import SettingsPage from './pages/SettingsPage.vue';
import TodosPage from './pages/TodosPage.vue';
import './styles/claude-theme.css';
import { useRuntime } from './composables/useRuntime';
import { RuntimeKey, PermissionRequestsKey } from './composables/runtimeContext';
import type { PermissionRequest } from './core/PermissionRequest';
// import IconTestPage from './pages/IconTestPage.vue';

type PageName = 'sessions' | 'chat' | 'settings' | 'todos';

const bootstrap = window.CLAUDIX_BOOTSTRAP;
const initialPage = (bootstrap?.page as PageName | undefined) ?? 'chat';
const currentPage = ref<PageName>(initialPage);
const pageAnimation = ref({ opacity: 1, x: 0 });

// 仅在需要的页面上初始化运行时（聊天 / 会话列表 / 任务）
const needsRuntime = initialPage === 'chat' || initialPage === 'sessions' || initialPage === 'todos';
console.log('[App] 🔴 App.vue setup 开始执行, initialPage=', initialPage, 'needsRuntime=', needsRuntime);
const runtime = needsRuntime ? useRuntime() : null;
console.log('[App] 🔴 runtime 初始化结果:', !!runtime);

if (runtime) {
  provide(RuntimeKey, runtime);
}

// ======= 权限请求状态管理（在 App 层级管理，避免子组件渲染冲突）=======
const permissionRequests = ref<PermissionRequest[]>([]);
let permissionRequestCleanup: (() => void) | null = null;

// 提供给子组件 - 直接提供 ref 而不是 computed，确保响应式传递
const permissionRequestsComputed = computed(() => permissionRequests.value);
provide(PermissionRequestsKey, {
  requests: permissionRequestsComputed,
  add: (request: PermissionRequest) => {
    console.log('[App] 添加权限请求:', request.toolName);
    permissionRequests.value = [...permissionRequests.value, request];
    console.log('[App] 添加后数量:', permissionRequests.value.length, 'computed值:', permissionRequestsComputed.value.length);
  },
  remove: (request: PermissionRequest) => {
    console.log('[App] 移除权限请求:', request.toolName);
    permissionRequests.value = permissionRequests.value.filter(r => r !== request);
  }
});

// 设置权限请求监听器（在 setup 阶段立即执行，确保在任何子组件触发之前就开始监听）
async function setupPermissionRequestListener() {
  if (!runtime) return;
  
  try {
    const connection = await runtime.connectionManager.get();
    console.log('[App] 设置权限请求监听器');
    
    permissionRequestCleanup = connection.permissionRequested.add((request: PermissionRequest) => {
      console.log('[App] 收到权限请求:', request.toolName, 'channelId:', request.channelId);
      // 使用 queueMicrotask 确保在当前事件循环结束后更新状态，避免与 Vue 渲染冲突
      queueMicrotask(() => {
        permissionRequests.value = [...permissionRequests.value, request];
        console.log('[App] 权限请求数组更新完成, 当前数量:', permissionRequests.value.length);
      });
      
      // 监听请求被解决时从列表移除
      const cleanup = request.onResolved((resolution) => {
        console.log('[App] ✅ 权限请求已解决:', request.toolName, 'channelId:', request.channelId, 'resolution:', resolution);
        queueMicrotask(() => {
          const before = permissionRequests.value.length;
          // 使用 toRaw 获取原始对象进行比较，避免 Proxy 包装导致的引用不一致问题
          permissionRequests.value = permissionRequests.value.filter(r => toRaw(r) !== request);
          console.log('[App] 权限请求已移除, before:', before, 'after:', permissionRequests.value.length);
        });
      });
      console.log('[App] onResolved 监听器已注册');
    });
  } catch (e) {
    console.error('[App] 设置权限请求监听器失败:', e);
  }
}

// 立即启动监听器设置（不等待 onMounted）
if (runtime) {
  console.log('[App] setup 阶段立即设置权限请求监听器');
  setupPermissionRequestListener();
}

onMounted(() => {
  if (runtime) {
    console.log('[App] runtime initialized', runtime);
  } else {
    console.log('[App] runtime not initialized for page', initialPage);
  }
});

onUnmounted(() => {
  if (permissionRequestCleanup) {
    permissionRequestCleanup();
    permissionRequestCleanup = null;
  }
});

function switchToPage(page: 'sessions' | 'chat' | 'settings') {
  pageAnimation.value = { opacity: 0, x: 0 };

  setTimeout(() => {
    currentPage.value = page;
    if (page === 'sessions') {
      pageAnimation.value = { opacity: 0.7, x: -3 };
      setTimeout(() => {
        pageAnimation.value = { opacity: 1, x: 0 };
      }, 50);
    } else {
      pageAnimation.value = { opacity: 0.7, x: 3 };
      setTimeout(() => {
        pageAnimation.value = { opacity: 1, x: 0 };
      }, 50);
    }
  }, 0);
}

function handleSwitchToChat(sessionId?: string) {
  if (sessionId) {
    console.log('Switching to chat with session:', sessionId);
  }
  switchToPage('chat');
}
</script>

<style>
.app-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  color: var(--vscode-editor-foreground);
}

.app-main {
  flex: 1;
  overflow: hidden;
}

.page-container {
  position: relative;
  height: 100%;
  width: 100%;
}

.motion-wrapper {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
}
</style>
