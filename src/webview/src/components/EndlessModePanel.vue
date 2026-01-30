<template>
  <div class="endless-panel">
    <div class="endless-panel-header" @click="toggleExpanded">
      <div class="endless-panel-title">
        <span class="codicon codicon-sync"></span>
        <span>无尽模式</span>
        <span v-if="isActive" class="status-badge active">
          {{ currentRound }}/{{ maxRounds }}
        </span>
      </div>
      <div class="header-controls" @click.stop>
        <label class="endless-switch" :title="enabled ? '关闭无尽模式' : '开启无尽模式'">
          <input type="checkbox" v-model="enabled" @change="handleToggle" />
          <span class="switch-slider"></span>
        </label>
        <button class="expand-btn" @click.stop="toggleExpanded">
          <span :class="['codicon', expanded ? 'codicon-chevron-down' : 'codicon-chevron-up']"></span>
        </button>
      </div>
    </div>

    <div v-if="expanded" class="endless-panel-content">
      <!-- 次数设置 -->
      <div class="setting-row">
        <label class="setting-label">
          <span class="codicon codicon-symbol-numeric"></span>
          执行次数
        </label>
        <div class="setting-input">
          <input 
            type="number" 
            v-model.number="maxRounds" 
            min="1" 
            max="1000"
            @change="handleMaxRoundsChange"
            :disabled="enabled"
          />
          <span class="input-hint">最大 1000</span>
        </div>
      </div>

      <!-- 提示词设置 -->
      <div class="setting-row">
        <label class="setting-label">
          <span class="codicon codicon-comment"></span>
          提示词
        </label>
        <textarea
          v-model="prompt"
          @change="handlePromptChange"
          :disabled="enabled"
          placeholder="输入每轮自动发送的提示词..."
          rows="3"
        ></textarea>
      </div>

      <!-- 状态显示 -->
      <div v-if="isActive" class="status-row">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
        </div>
        <span class="progress-text">已执行 {{ currentRound }} / {{ maxRounds }} 次</span>
      </div>

      <!-- 操作按钮 -->
      <div class="action-row">
        <button 
          v-if="enabled" 
          class="stop-btn" 
          @click="handleStop"
          title="停止无尽模式"
        >
          <span class="codicon codicon-debug-stop"></span>
          停止
        </button>
        <button 
          v-else 
          class="start-btn" 
          @click="handleStart"
          :disabled="!prompt.trim()"
          title="开始无尽模式"
        >
          <span class="codicon codicon-play"></span>
          开始
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, inject, onUnmounted } from 'vue';
import { effect } from 'alien-signals';
import { RuntimeKey } from '../composables/runtimeContext';
import { useSignal } from '@gn8/alien-signals-vue';
import type { Session } from '../core/Session';

const runtime = inject(RuntimeKey);
if (!runtime) throw new Error('[EndlessModePanel] runtime not provided');

// 从 runtime 获取活动 session
const activeSessionRaw = useSignal<Session | undefined>(
  runtime.sessionStore.activeSession
);

const expanded = ref(false);
const enabled = ref(false);
const maxRounds = ref(10);
const currentRound = ref(0);
const prompt = ref('检查前后端数据连接是否一致，前端是否有未完善的功能，检查美工是否精致好看');

const isActive = computed(() => enabled.value && currentRound.value > 0);
const progressPercent = computed(() => 
  maxRounds.value > 0 ? (currentRound.value / maxRounds.value) * 100 : 0
);

// 同步 session 状态（alien-signals 使用函数调用获取值）
watch(
  () => activeSessionRaw.value,
  (s) => {
    if (s) {
      enabled.value = s.endlessMode();
      maxRounds.value = s.endlessMaxRounds();
      currentRound.value = s.endlessCurrentRound();
      prompt.value = s.endlessPrompt();
    }
  },
  { immediate: true }
);

// 使用 alien-signals 的 effect 来正确监听 session 内部状态变化
// Vue 的 watch 无法追踪 alien-signals 的依赖，所以需要使用 effect
const cleanupEffect = effect(() => {
  const session = activeSessionRaw.value;
  if (session) {
    // effect 内部访问 signal 会自动建立依赖追踪
    const mode = session.endlessMode();
    const round = session.endlessCurrentRound();
    
    // 更新 Vue refs
    enabled.value = mode;
    currentRound.value = round;
    
    console.log(`[EndlessModePanel] effect 同步: mode=${mode}, round=${round}`);
  }
});

// 组件卸载时清理 effect
onUnmounted(() => {
  cleanupEffect();
});

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function handleToggle() {
  const session = activeSessionRaw.value;
  if (session) {
    if (enabled.value) {
      // 开启无尽模式
      if (!prompt.value.trim()) {
        enabled.value = false;
        return;
      }
      session.endlessMaxRounds(maxRounds.value);
      session.endlessPrompt(prompt.value);
      session.endlessCurrentRound(0);
      session.endlessMode(true);
      
      // 如果当前没有任务在执行，立即发送第一条消息
      if (!session.busy()) {
        session.send(prompt.value);
        session.endlessCurrentRound(1);
        currentRound.value = 1;
      }
    } else {
      // 关闭无尽模式
      session.endlessMode(false);
      session.endlessCurrentRound(0);
      currentRound.value = 0;
    }
  }
}

function handleMaxRoundsChange() {
  // 限制范围
  if (maxRounds.value < 1) maxRounds.value = 1;
  if (maxRounds.value > 1000) maxRounds.value = 1000;
  
  const session = activeSessionRaw.value;
  if (session) {
    session.endlessMaxRounds(maxRounds.value);
  }
}

function handlePromptChange() {
  const session = activeSessionRaw.value;
  if (session) {
    session.endlessPrompt(prompt.value);
  }
}

function handleStart() {
  if (!prompt.value.trim()) return;
  
  const session = activeSessionRaw.value;
  if (session) {
    session.endlessMaxRounds(maxRounds.value);
    session.endlessPrompt(prompt.value);
    session.endlessCurrentRound(0);
    session.endlessMode(true);
    enabled.value = true;
    
    // 立即发送第一条消息
    session.send(prompt.value);
    session.endlessCurrentRound(1);
    currentRound.value = 1;
  }
}

function handleStop() {
  const session = activeSessionRaw.value;
  if (session) {
    session.endlessMode(false);
    enabled.value = false;
  }
}
</script>

<style scoped>
.endless-panel {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  border-radius: 4px;
  margin-bottom: 4px;
  overflow: hidden;
}

.endless-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  cursor: pointer;
  background: var(--vscode-sideBarSectionHeader-background);
  transition: background 0.15s;
}

.endless-panel-header:hover {
  background: var(--vscode-list-hoverBackground);
}

.endless-panel-title {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.endless-panel-title .codicon {
  font-size: 12px;
  color: var(--vscode-textLink-foreground);
}

.status-badge {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 10px;
  background: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
}

.status-badge.active {
  background: var(--vscode-testing-iconPassed, #4caf50);
  color: white;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.endless-switch {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.endless-switch input {
  display: none;
}

.switch-slider {
  width: 28px;
  height: 14px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 7px;
  position: relative;
  transition: all 0.2s;
}

.switch-slider::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 1px;
  width: 10px;
  height: 10px;
  background: var(--vscode-descriptionForeground);
  border-radius: 50%;
  transition: all 0.2s;
}

.endless-switch input:checked + .switch-slider {
  background: var(--vscode-textLink-foreground);
  border-color: var(--vscode-textLink-foreground);
}

.endless-switch input:checked + .switch-slider::after {
  left: 15px;
  background: white;
}

.expand-btn {
  background: transparent;
  border: none;
  color: var(--vscode-descriptionForeground);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expand-btn:hover {
  color: var(--vscode-foreground);
}

.endless-panel-content {
  padding: 8px;
  border-top: 1px solid var(--vscode-panel-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.setting-label .codicon {
  font-size: 12px;
}

.setting-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-input input {
  width: 80px;
  padding: 4px 8px;
  font-size: 12px;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  color: var(--vscode-input-foreground);
}

.setting-input input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.setting-input input:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.input-hint {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
}

.setting-row textarea {
  width: 100%;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  background: var(--vscode-input-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  color: var(--vscode-input-foreground);
  resize: vertical;
  min-height: 60px;
}

.setting-row textarea:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.setting-row textarea:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-bar {
  height: 4px;
  background: var(--vscode-progressBar-background, #333);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--vscode-textLink-foreground);
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 10px;
  color: var(--vscode-descriptionForeground);
  text-align: center;
}

.action-row {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.start-btn, .stop-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  font-size: 11px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

.start-btn {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.start-btn:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.start-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.stop-btn {
  background: var(--vscode-inputValidation-errorBackground, #f44336);
  color: white;
}

.stop-btn:hover {
  opacity: 0.9;
}
</style>
