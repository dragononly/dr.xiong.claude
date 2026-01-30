<template>
  <div class="todos-page">
    <!-- 头部 -->
    <div class="todos-header">
      <button class="back-btn" @click="$emit('backToChat')">
        <span class="codicon codicon-arrow-left" />
      </button>
      <h2 class="todos-title">我的任务</h2>
    </div>

    <!-- 本地 Todo 列表 -->
    <LocalTodoList />
  </div>
</template>

<script setup lang="ts">
import { onMounted, inject } from 'vue';
import LocalTodoList from '../components/LocalTodoList.vue';
import { localTodoStore } from '../stores/localTodoStore';
import { RuntimeKey } from '../composables/runtimeContext';

defineEmits<{
  (e: 'backToChat'): void;
}>();

const runtime = inject(RuntimeKey);

onMounted(async () => {
  // 设置 transport 并加载数据
  if (runtime) {
    const connection = await runtime.connectionManager.get();
    localTodoStore.setTransport(connection);
    await localTodoStore.load();
  }
});
</script>

<style scoped>
.todos-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--vscode-editor-background);
}

.todos-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--vscode-panel-border);
  background: var(--vscode-sideBar-background);
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--vscode-foreground);
  cursor: pointer;
  transition: background 0.15s;
}

.back-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.todos-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}
</style>
