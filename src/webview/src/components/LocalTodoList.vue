<template>
  <div class="local-todo-panel">
    <!-- 头部：添加新任务 -->
    <div class="todo-header">
      <div class="todo-input-wrapper">
        <input
          v-model="newTodoContent"
          type="text"
          placeholder="添加新任务..."
          class="todo-input"
          @keyup.enter="addTodo"
        />
        <button
          class="todo-add-btn"
          :disabled="!newTodoContent.trim()"
          @click="addTodo"
        >
          <span class="codicon codicon-add" />
        </button>
      </div>
    </div>

    <!-- 统计信息 -->
    <div v-if="hasTodos" class="todo-stats">
      <span class="stats-text">{{ stats.completed }}/{{ stats.total }} 已完成</span>
      <button
        v-if="stats.completed > 0"
        class="clear-btn"
        @click="clearCompleted"
      >
        清除已完成
      </button>
    </div>

    <!-- 加载状态 -->
    <div v-if="isLoading" class="todo-loading">
      <span class="codicon codicon-loading codicon-modifier-spin" />
      <span>加载中...</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="!hasTodos" class="todo-empty">
      <span class="codicon codicon-checklist" />
      <span>暂无任务</span>
    </div>

    <!-- 任务列表 -->
    <div v-else class="todo-list-container custom-scrollbar">
      <!-- 进行中 -->
      <div v-if="inProgressTodos.length > 0" class="todo-section">
        <div class="section-title">
          <span class="codicon codicon-play" />
          进行中 ({{ inProgressTodos.length }})
        </div>
        <TodoItem
          v-for="todo in inProgressTodos"
          :key="todo.id"
          :todo="todo"
          @toggle-status="toggleStatus"
          @update-content="updateContent"
          @delete="deleteTodo"
        />
      </div>

      <!-- 待办 -->
      <div v-if="pendingTodos.length > 0" class="todo-section">
        <div class="section-title">
          <span class="codicon codicon-circle-outline" />
          待办 ({{ pendingTodos.length }})
        </div>
        <TodoItem
          v-for="todo in pendingTodos"
          :key="todo.id"
          :todo="todo"
          @toggle-status="toggleStatus"
          @update-content="updateContent"
          @delete="deleteTodo"
        />
      </div>

      <!-- 已完成 -->
      <div v-if="completedTodos.length > 0" class="todo-section">
        <div class="section-title">
          <span class="codicon codicon-check" />
          已完成 ({{ completedTodos.length }})
        </div>
        <TodoItem
          v-for="todo in completedTodos"
          :key="todo.id"
          :todo="todo"
          @toggle-status="toggleStatus"
          @update-content="updateContent"
          @delete="deleteTodo"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import { localTodoStore } from '../stores/localTodoStore';
import TodoItem from './TodoItem.vue';

const newTodoContent = ref('');

// 使用 al 桥接 alien-signals 到 Vue
const todos = useSignal(localTodoStore.todos);
const isLoading = useSignal(localTodoStore.isLoading);
const stats = useSignal(localTodoStore.stats);
const hasTodos = useSignal(localTodoStore.hasTodos);
const pendingTodos = useSignal(localTodoStore.pendingTodos);
const inProgressTodos = useSignal(localTodoStore.inProgressTodos);
const completedTodos = useSignal(localTodoStore.completedTodos);

onMounted(() => {
  localTodoStore.load();
});

async function addTodo() {
  const content = newTodoContent.value.trim();
  if (!content) return;

  await localTodoStore.add(content);
  newTodoContent.value = '';
}

async function toggleStatus(id: string) {
  await localTodoStore.toggleStatus(id);
}

async function updateContent(id: string, content: string) {
  await localTodoStore.updateContent(id, content);
}

async function deleteTodo(id: string) {
  await localTodoStore.delete(id);
}

async function clearCompleted() {
  await localTodoStore.clearCompleted();
}
</script>

<style scoped>
.local-todo-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 8px;
  background: var(--vscode-sideBar-background);
}

.todo-header {
  margin-bottom: 8px;
}

.todo-input-wrapper {
  display: flex;
  gap: 4px;
}

.todo-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 12px;
  outline: none;
}

.todo-input:focus {
  border-color: var(--vscode-focusBorder);
}

.todo-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}

.todo-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  transition: opacity 0.2s;
}

.todo-add-btn:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.todo-add-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.todo-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.stats-text {
  opacity: 0.8;
}

.clear-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--vscode-textLink-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: background 0.2s;
}

.clear-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.todo-loading,
.todo-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}

.todo-loading .codicon,
.todo-empty .codicon {
  font-size: 24px;
  opacity: 0.5;
}

.todo-list-container {
  flex: 1;
  overflow-y: auto;
}

.todo-section {
  margin-bottom: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-title .codicon {
  font-size: 12px;
}

/* 自定义滚动条 */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 3px;
  transition: background 0.2s;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background: var(--vscode-scrollbarSlider-background);
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: var(--vscode-scrollbarSlider-hoverBackground);
}

/* 动画 */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.codicon-modifier-spin {
  animation: spin 1s linear infinite;
}
</style>
