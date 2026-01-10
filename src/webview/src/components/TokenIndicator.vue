<template>
  <DropdownTrigger
    ref="dropdownRef"
    align="left"
    @open="isOpen = true"
    @close="isOpen = false"
  >
    <!-- 触发器：进度指示器 -->
    <template #trigger>
      <div
        class="progress-container"
        :class="{ 'is-open': isOpen, 'is-summarizing': isSummarizing }"
        :style="containerStyle"
      >
        <span class="progress-text">{{ formattedPercentage }}</span>
        <div class="progress-circle">
          <svg width="14" height="14" class="progress-svg">
            <circle
              cx="7"
              cy="7"
              r="5.25"
              :stroke="strokeColor"
              stroke-width="1.5"
              fill="none"
              opacity="0.25"
            />
            <circle
              cx="7"
              cy="7"
              r="5.25"
              :stroke="strokeColor"
              stroke-width="1.5"
              fill="none"
              stroke-linecap="round"
              opacity="0.9"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="strokeOffset"
              transform="rotate(-90 7 7)"
              class="progress-arc"
            />
          </svg>
        </div>
      </div>
    </template>

    <!-- 下拉内容 -->
    <template #content="{ close }">
      <div class="token-menu">
        <div class="menu-header">Context Usage</div>
        <div class="menu-info">
          <span class="info-label">Used:</span>
          <span class="info-value">{{ formattedPercentage }}</span>
        </div>
        <div class="menu-divider" />
        <div
          class="menu-item"
          :class="{ disabled: isSummarizing || messageCount < 3 }"
          @click="handleCompact(close)"
        >
          <span class="codicon codicon-fold" />
          <span class="item-label">{{ isSummarizing ? 'Compacting...' : 'Compact Now' }}</span>
        </div>
        <div class="menu-hint">
          Generate summary to reduce context
        </div>
      </div>
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { DropdownTrigger } from './Dropdown'

interface Props {
  percentage: number
  size?: number
  isSummarizing?: boolean
  messageCount?: number
}

interface Emits {
  (e: 'compactNow'): void
}

const props = withDefaults(defineProps<Props>(), {
  percentage: 0,
  size: 14,
  isSummarizing: false,
  messageCount: 0
})

const emit = defineEmits<Emits>()

const dropdownRef = ref<InstanceType<typeof DropdownTrigger>>()
const isOpen = ref(false)

const circumference = computed(() => {
  const radius = 5.25
  return 2 * Math.PI * radius
})

const strokeOffset = computed(() => {
  const progress = Math.max(0, Math.min(100, props.percentage))
  return circumference.value - (progress / 100) * circumference.value
})

const formattedPercentage = computed(() => {
  const value = props.percentage
  return `${value % 1 === 0 ? Math.round(value) : value.toFixed(1)}%`
})

const containerStyle = computed(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  cursor: 'pointer'
}))

const strokeColor = 'color-mix(in srgb,var(--vscode-foreground) 92%,transparent)'

function handleCompact(close: () => void) {
  if (props.isSummarizing || props.messageCount < 3) return
  emit('compactNow')
  close()
}
</script>

<style scoped>
.progress-container {
  position: relative;
  z-index: 100;
  border-radius: 4px;
  padding: 2px 4px;
  transition: background-color 0.15s ease;
}

.progress-container:hover,
.progress-container.is-open {
  background-color: var(--vscode-toolbar-hoverBackground);
}

.progress-container.is-summarizing {
  opacity: 0.6;
}

.progress-text {
  font-size: 12px;
  color: color-mix(in srgb,var(--vscode-foreground) 48%,transparent);
  line-height: 1;
}

.progress-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
}

.progress-svg {
  position: absolute;
}

.progress-arc {
  transition: stroke-dashoffset 0.3s ease;
}

/* 下拉菜单样式 */
.token-menu {
  min-width: 180px;
  padding: 4px 0;
}

.menu-header {
  padding: 4px 12px 8px;
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.menu-info {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  font-size: 12px;
}

.info-label {
  color: var(--vscode-descriptionForeground);
}

.info-value {
  color: var(--vscode-foreground);
  font-weight: 500;
}

.menu-divider {
  height: 1px;
  background: var(--vscode-panel-border);
  margin: 6px 0;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background-color 0.1s ease;
}

.menu-item:hover:not(.disabled) {
  background-color: var(--vscode-list-hoverBackground);
}

.menu-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.menu-item .codicon {
  font-size: 14px;
  width: 14px;
  opacity: 0.8;
}

.item-label {
  font-size: 13px;
  color: var(--vscode-foreground);
}

.menu-hint {
  padding: 4px 12px 6px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
}
</style>
