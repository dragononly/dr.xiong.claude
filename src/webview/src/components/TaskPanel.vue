<template>
  <div class="task-panel">
    <div class="task-panel-header" @click="toggleExpanded">
      <div class="task-panel-title">
        <span class="codicon codicon-tasklist"></span>
        <span>当前任务</span>
        <span v-if="hasActiveTasks" class="task-count">{{ inProgressTasks.length + pendingTasks.length }}</span>
      </div>
      <div class="header-controls" @click.stop>
        <label class="auto-switch" :title="autoTaskEnabled ? '关闭自动执行' : '开启自动执行'">
          <input type="checkbox" v-model="autoTaskEnabled" @change="handleAutoTaskToggle" />
          <span class="switch-slider"></span>
          <span class="switch-label">{{ autoTaskEnabled ? '自动' : '手动' }}</span>
        </label>
        <button class="expand-btn" @click.stop="toggleExpanded">
          <span :class="['codicon', expanded ? 'codicon-chevron-down' : 'codicon-chevron-up']"></span>
        </button>
      </div>
    </div>

    <div v-if="expanded" class="task-panel-content">
      <!-- 加载中 -->
      <div v-if="loading" class="task-loading">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        <span>加载中...</span>
      </div>

      <!-- 错误状态 -->
      <div v-else-if="error" class="task-error">
        <span class="codicon codicon-warning"></span>
        <span>{{ error }}</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="!hasActiveTasks" class="task-empty">
        <span>暂无进行中的任务</span>
      </div>

      <!-- 任务列表 -->
      <template v-else>
        <!-- 进行中 -->
        <div v-if="inProgressTasks.length > 0" class="task-section">
          <div class="section-label">
            <span class="codicon codicon-play"></span>
            进行中
          </div>
          <div v-for="task in inProgressTasks" :key="task.id" class="task-item in-progress">
            <span class="task-checkbox">
              <span class="codicon codicon-circle-filled"></span>
            </span>
            <span class="task-text">{{ task.content }}</span>
          </div>
        </div>

        <!-- 待办 -->
        <div v-if="pendingTasks.length > 0" class="task-section">
          <div class="section-label">
            <span class="codicon codicon-circle-outline"></span>
            待办
          </div>
          <div v-for="task in pendingTasks" :key="task.id" class="task-item pending">
            <span class="task-checkbox">
              <span class="codicon codicon-circle-outline"></span>
            </span>
            <span class="task-text">{{ task.content }}</span>
          </div>
        </div>
      </template>

      <!-- 快捷操作 -->
      <div class="task-actions">
        <button class="action-link" @click="openTaskFile" title="编辑任务文件">
          <span class="codicon codicon-edit"></span>
          编辑
        </button>
        <button class="action-link" @click="refreshTasks" title="刷新任务">
          <span class="codicon codicon-refresh"></span>
          刷新
        </button>
        <button v-if="hasActiveTasks && !autoTaskEnabled" class="action-link action-primary" @click="executeFirstTask" title="执行第一个任务">
          <span class="codicon codicon-play"></span>
          执行
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';

interface Task {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

const emit = defineEmits<{
  (e: 'execute-task', prompt: string): void;
}>();

const runtime = inject(RuntimeKey);
const expanded = ref(false);
const tasks = ref<Task[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const autoTaskEnabled = ref(true);

// 自动刷新定时器
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

const inProgressTasks = computed(() => tasks.value.filter(t => t.status === 'in_progress'));
const pendingTasks = computed(() => tasks.value.filter(t => t.status === 'pending'));
const hasActiveTasks = computed(() => inProgressTasks.value.length > 0 || pendingTasks.value.length > 0);

function toggleExpanded() {
  expanded.value = !expanded.value;
}

// 解析 markdown 任务文件
function parseTasksFromMarkdown(content: string): Task[] {
  const result: Task[] = [];
  const lines = content.split('\n');

  let currentSection: 'in_progress' | 'pending' | 'completed' | null = null;
  let taskId = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // 检测章节
    if (trimmed.startsWith('## 进行中')) {
      currentSection = 'in_progress';
      continue;
    } else if (trimmed.startsWith('## 待办')) {
      currentSection = 'pending';
      continue;
    } else if (trimmed.startsWith('## 已完成')) {
      currentSection = 'completed';
      continue;
    } else if (trimmed.startsWith('## ') || trimmed.startsWith('---')) {
      currentSection = null;
      continue;
    }

    // 解析任务项
    if (currentSection && (trimmed.startsWith('- [ ]') || trimmed.startsWith('- [x]'))) {
      const isCompleted = trimmed.startsWith('- [x]');
      const taskContent = trimmed.replace(/^- \[[ x]\]\s*/, '').trim();

      if (taskContent) {
        result.push({
          id: `task-${taskId++}`,
          content: taskContent,
          status: isCompleted ? 'completed' : currentSection === 'in_progress' ? 'in_progress' : 'pending'
        });
      }
    }
  }

  return result;
}

async function loadTasks() {
  if (!runtime) {
    error.value = 'Runtime 未初始化';
    return;
  }

  loading.value = true;
  error.value = null;
  try {
    const connection = await runtime.connectionManager.get();
    const response = await connection.readTaskFile();
    console.log('[TaskPanel] readTaskFile response:', response);

    if (response.success && response.content) {
      tasks.value = parseTasksFromMarkdown(response.content);
      console.log('[TaskPanel] Parsed tasks:', tasks.value);
    } else {
      error.value = response.error || '读取任务文件失败';
    }
  } catch (e) {
    console.error('[TaskPanel] Failed to load tasks:', e);
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function refreshTasks() {
  await loadTasks();
}

async function openTaskFile() {
  if (!runtime) return;

  try {
    runtime.appContext.fileOpener.open('.tasks/current.md');
  } catch (e) {
    console.error('[TaskPanel] Failed to open task file:', e);
  }
}

// 处理自动任务开关
async function handleAutoTaskToggle() {
  if (!runtime) return;

  try {
    const connection = await runtime.connectionManager.get();
    if (autoTaskEnabled.value) {
      const response = await connection.enableAutoTask(3000); // 3秒检查一次
      console.log('[TaskPanel] 启用自动任务:', response);
    } else {
      const response = await connection.disableAutoTask();
      console.log('[TaskPanel] 禁用自动任务:', response);
    }
  } catch (e) {
    console.error('[TaskPanel] 自动任务切换失败:', e);
    autoTaskEnabled.value = !autoTaskEnabled.value;
  }
}

// 生成任务执行提示词
function generateTaskPrompt(): string {
  const activeTasks = [...inProgressTasks.value, ...pendingTasks.value];
  if (activeTasks.length === 0) return '';

  let prompt = '请继续执行以下任务：\n\n';

  if (inProgressTasks.value.length > 0) {
    prompt += '## 正在进行的任务\n';
    inProgressTasks.value.forEach(t => {
      prompt += `- ${t.content}\n`;
    });
    prompt += '\n';
  }

  if (pendingTasks.value.length > 0 && inProgressTasks.value.length === 0) {
    prompt += '## 待办任务\n';
    pendingTasks.value.forEach(t => {
      prompt += `- ${t.content}\n`;
    });
    prompt += '\n';
  }

  prompt += '完成后请更新 `.tasks/current.md` 文件，将已完成的任务标记为 `[x]` 并移到"已完成"部分。';

  return prompt;
}

// 手动执行第一个任务
function executeFirstTask() {
  const prompt = generateTaskPrompt();
  if (prompt) {
    emit('execute-task', prompt);
  }
}

// 处理自动任务发现
function handleAutoTaskFound(data: { tasks: any[]; prompt: string }) {
  console.log('[TaskPanel] 收到自动任务发现通知:', data);
  loadTasks();
  if (autoTaskEnabled.value && data.prompt) {
    emit('execute-task', data.prompt);
  }
}

// 处理任务文件变化（实时更新 UI）
function handleTaskFileChanged(data: { tasks: Array<{ title: string; status: string; section: string }> }) {
  console.log('[TaskPanel] 任务文件变化，实时更新 UI:', data.tasks.length, '个任务');
  
  // 直接从通知数据更新任务列表，不需要重新读取文件
  tasks.value = data.tasks.map((t, index) => ({
    id: `task-${index}`,
    content: t.title,
    status: t.status === 'completed' ? 'completed' : t.section === '进行中' ? 'in_progress' : 'pending'
  }));
}

// 加载自动任务配置
async function loadAutoTaskConfig() {
  if (!runtime) return;

  try {
    const connection = await runtime.connectionManager.get();
    const response = await connection.getAutoTaskConfig();
    autoTaskEnabled.value = response.config.enabled;
    console.log('[TaskPanel] 自动任务配置:', response.config);
  } catch (e) {
    console.error('[TaskPanel] 加载自动任务配置失败:', e);
  }
}

onMounted(async () => {
  await loadTasks();
  await loadAutoTaskConfig();

  if (runtime) {
    const connection = await runtime.connectionManager.get();
    connection.autoTaskFound.add(handleAutoTaskFound);
    connection.taskFileChanged.add(handleTaskFileChanged);
  }

  autoRefreshTimer = setInterval(() => {
    if (expanded.value) {
      loadTasks();
    }
  }, 5000);
});

onUnmounted(async () => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
  }

  if (runtime) {
    try {
      const connection = await runtime.connectionManager.get();
      connection.autoTaskFound.remove(handleAutoTaskFound);
      connection.taskFileChanged.remove(handleTaskFileChanged);
    } catch {}
  }
});
</script>

<style scoped>
.task-panel {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--vscode-sideBarSectionHeader-background);
  cursor: pointer;
  user-select: none;
}

.task-panel-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.task-panel-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  color: var(--vscode-foreground);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.task-panel-title .codicon {
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
}

.task-count {
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
}

.auto-switch input {
  display: none;
}

.switch-slider {
  position: relative;
  width: 28px;
  height: 14px;
  background: var(--vscode-input-background);
  border-radius: 7px;
  border: 1px solid var(--vscode-input-border);
  transition: background 0.2s, border-color 0.2s;
}

.switch-slider::after {
  content: '';
  position: absolute;
  left: 2px;
  top: 2px;
  width: 8px;
  height: 8px;
  background: var(--vscode-descriptionForeground);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.auto-switch input:checked + .switch-slider {
  background: var(--vscode-progressBar-background);
  border-color: var(--vscode-progressBar-background);
}

.auto-switch input:checked + .switch-slider::after {
  transform: translateX(14px);
  background: white;
}

.switch-label {
  min-width: 24px;
}

.expand-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: none;
  background: transparent;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  border-radius: 3px;
}

.expand-btn:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}

.task-panel-content {
  padding: 8px 10px;
}

.task-section {
  margin-bottom: 8px;
}

.task-section:last-of-type {
  margin-bottom: 0;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.section-label .codicon {
  font-size: 10px;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 3px 0;
  font-size: 12px;
  color: var(--vscode-foreground);
}

.task-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.task-checkbox .codicon {
  font-size: 12px;
}

.task-item.in-progress .task-checkbox .codicon {
  color: var(--vscode-progressBar-background);
}

.task-item.pending .task-checkbox .codicon {
  color: var(--vscode-descriptionForeground);
}

.task-text {
  flex: 1;
  line-height: 1.4;
  word-break: break-word;
}

.task-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--vscode-panel-border);
}

.action-link {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--vscode-textLink-foreground);
  font-size: 11px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.action-link:hover {
  opacity: 0.8;
  text-decoration: underline;
}

.action-link .codicon {
  font-size: 12px;
}

.action-link.action-primary {
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  padding: 2px 8px;
  border-radius: 3px;
}

.action-link.action-primary:hover {
  background: var(--vscode-button-hoverBackground);
  text-decoration: none;
  opacity: 1;
}

.task-loading,
.task-error,
.task-empty {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 0;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.task-error {
  color: var(--vscode-errorForeground);
}

.task-loading .codicon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
