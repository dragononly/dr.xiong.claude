<template>
  <DropdownTrigger
    align="left"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="model-dropdown">
        <div class="dropdown-content">
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModelLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <!-- Claude 模型组 -->
      <div class="model-group-header">Claude</div>
      <DropdownItem
        :item="{
          id: 'claude-opus-4-5',
          label: 'Opus 4.5',
          checked: selectedModel === 'claude-opus-4-5',
          type: 'model'
        }"
        :is-selected="selectedModel === 'claude-opus-4-5'"
        :index="0"
        @click="(item) => handleModelSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'claude-sonnet-4-5',
          label: 'Sonnet 4.5',
          checked: selectedModel === 'claude-sonnet-4-5',
          type: 'model'
        }"
        :is-selected="selectedModel === 'claude-sonnet-4-5'"
        :index="1"
        @click="(item) => handleModelSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'claude-haiku-4-5',
          label: 'Haiku 4.5',
          checked: selectedModel === 'claude-haiku-4-5',
          type: 'model'
        }"
        :is-selected="selectedModel === 'claude-haiku-4-5'"
        :index="2"
        @click="(item) => handleModelSelect(item, close)"
      />

    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'

interface Props {
  selectedModel?: string
}

interface Emits {
  (e: 'modelSelect', modelId: string): void
}

const props = withDefaults(defineProps<Props>(), {
  selectedModel: 'claude-opus-4-5'
})

const emit = defineEmits<Emits>()

// 模型到标签的映射
const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-5': 'Opus 4.5',
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
}

// 计算显示的模型名称
const selectedModelLabel = computed(() => {
  return MODEL_LABELS[props.selectedModel] || 'Opus 4.5'
})

function handleModelSelect(item: DropdownItemData, close: () => void) {
  console.log('Selected model:', item)
  close()

  // 发送模型切换事件
  emit('modelSelect', item.id)
}
</script>

<style scoped>
/* Model 下拉样式 - 简洁透明样式 */
.model-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 2.5px 6px;
  border-radius: 23px;
  flex-shrink: 1;
  cursor: pointer;
  border: none;
  background: transparent;
  overflow: hidden;
  transition: background-color 0.2s ease;
}

.model-dropdown:hover {
  background-color: var(--vscode-inputOption-hoverBackground);
}

/* 共享的 Dropdown 样式 */
.dropdown-content {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-text {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 12px;
  display: flex;
  align-items: baseline;
  gap: 3px;
  height: 13px;
  font-weight: 400;
}

.dropdown-label {
  opacity: 0.8;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.chevron-icon {
  font-size: 9px;
  flex-shrink: 0;
  opacity: 0.5;
  color: var(--vscode-foreground);
}

/* 模型组标题样式 */
.model-group-header {
  padding: 6px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--vscode-descriptionForeground);
  opacity: 0.7;
  border-top: 1px solid var(--vscode-widget-border);
  margin-top: 4px;
}

.model-group-header:first-child {
  border-top: none;
  margin-top: 0;
}
</style>
