<template>
  <div
    class="todo-item"
    :class="[todo.status, { editing: isEditing }]"
  >
    <!-- 状态指示器 -->
    <div class="todo-status-indicator" @click="$emit('toggle-status', todo.id)">
      <div v-if="todo.status === 'in_progress'" class="status-in-progress">
        <span class="codicon codicon-arrow-right" />
      </div>
      <div v-else-if="todo.status === 'completed'" class="status-completed">
        <span class="codicon codicon-check" />
      </div>
      <div v-else class="status-pending">
        <span class="codicon codicon-circle-outline" />
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="todo-content" @dblclick="startEditing">
      <template v-if="isEditing">
        <input
          ref="editInput"
          v-model="editContent"
          type="text"
          class="edit-input"
          @keyup.enter="saveEdit"
          @keyup.escape="cancelEdit"
          @blur="saveEdit"
        />
      </template>
      <template v-else>
        <span class="todo-text" :class="{ completed: todo.status === 'completed' }">
          {{ todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content }}
        </span>
        <span v-if="todo.priority" class="todo-priority" :class="todo.priority">
          {{ priorityLabel }}
        </span>
      </template>
    </div>

    <!-- 操作按钮 -->
    <div class="todo-actions">
      <button
        class="action-btn"
        title="删除"
        @click="$emit('delete', todo.id)"
      >
        <span class="codicon codicon-trash" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import type { LocalTodo } from '../../../shared/todos';

interface Props {
  todo: LocalTodo;
}

interface Emits {
  (e: 'toggle-status', id: string): void;
  (e: 'update-content', id: string, content: string): void;
  (e: 'delete', id: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const isEditing = ref(false);
const editContent = ref('');
const editInput = ref<HTMLInputElement | null>(null);

const priorityLabel = computed(() => {
  const labels: Record<string, string> = {
    high: '高',
    medium: '中',
    low: '低'
  };
  return props.todo.priority ? labels[props.todo.priority] : '';
});

function startEditing() {
  if (props.todo.status === 'completed') return;

  isEditing.value = true;
  editContent.value = props.todo.content;

  nextTick(() => {
    editInput.value?.focus();
    editInput.value?.select();
  });
}

function saveEdit() {
  if (!isEditing.value) return;

  const newContent = editContent.value.trim();
  if (newContent && newContent !== props.todo.content) {
    emit('update-content', props.todo.id, newContent);
  }

  isEditing.value = false;
}

function cancelEdit() {
  isEditing.value = false;
  editContent.value = props.todo.content;
}
</script>

<style scoped>
.todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  transition: background 0.15s;
}

.todo-item:hover {
  background: var(--vscode-list-hoverBackground);
}

.todo-item.editing {
  background: var(--vscode-list-activeSelectionBackground);
}

/* 状态指示器 */
.todo-status-indicator {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 50%;
  transition: all 0.15s;
}

.todo-status-indicator:hover {
  background: var(--vscode-toolbar-hoverBackground);
}

.status-pending .codicon {
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.6;
}

.status-in-progress {
  background: var(--vscode-progressBar-background);
  border-radius: 50%;
}

.status-in-progress .codicon {
  font-size: 12px;
  color: var(--vscode-button-foreground);
}

.status-completed {
  background: var(--vscode-testing-iconPassed, #73c991);
  border-radius: 50%;
}

.status-completed .codicon {
  font-size: 10px;
  color: #fff;
}

/* 内容区域 */
.todo-content {
  flex: 1;
  min-width: 0;
  cursor: default;
}

.todo-text {
  font-size: 12px;
  color: var(--vscode-foreground);
  word-break: break-word;
}

.todo-text.completed {
  text-decoration: line-through;
  opacity: 0.6;
}

.todo-priority {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 4px;
  font-size: 10px;
  border-radius: 2px;
  vertical-align: middle;
}

.todo-priority.high {
  background: var(--vscode-inputValidation-errorBackground, rgba(255, 85, 85, 0.2));
  color: var(--vscode-inputValidation-errorForeground, #f48771);
}

.todo-priority.medium {
  background: var(--vscode-inputValidation-warningBackground, rgba(255, 170, 0, 0.2));
  color: var(--vscode-inputValidation-warningForeground, #cca700);
}

.todo-priority.low {
  background: var(--vscode-inputValidation-infoBackground, rgba(75, 156, 211, 0.2));
  color: var(--vscode-inputValidation-infoForeground, #75beff);
}

.edit-input {
  width: 100%;
  padding: 2px 4px;
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 2px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 12px;
  outline: none;
}

/* 操作按钮 */
.todo-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.todo-item:hover .todo-actions {
  opacity: 1;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 3px;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.action-btn .codicon {
  font-size: 12px;
}

/* 状态样式 */
.todo-item.in_progress {
  border-left: 2px solid var(--vscode-progressBar-background);
}

.todo-item.completed {
  opacity: 0.7;
}
</style>
