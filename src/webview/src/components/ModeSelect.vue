<template>
  <DropdownTrigger
    align="left"
    :close-on-click-outside="true"
  >
    <template #trigger>
      <div class="mode-dropdown">
        <div class="dropdown-content">
          <div :class="['codicon', selectedModeIcon, 'dropdown-icon', 'text-[14px]!']" />
          <div class="dropdown-text">
            <span class="dropdown-label">{{ selectedModeLabel }}</span>
          </div>
        </div>
        <div class="codicon codicon-chevron-up chevron-icon text-[12px]!" />
      </div>
    </template>

    <template #content="{ close }">
      <DropdownItem
        :item="{
          id: 'default',
          label: '默认',
          icon: 'codicon-chat text-[14px]!',
          checked: permissionMode === 'default',
          type: 'default-mode'
        }"
        :is-selected="permissionMode === 'default'"
        :index="0"
        @click="(item) => handleModeSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'acceptEdits',
          label: '代理',
          icon: 'codicon-infinity text-[14px]!',
          checked: permissionMode === 'acceptEdits',
          type: 'agent-mode'
        }"
        :is-selected="permissionMode === 'acceptEdits'"
        :index="1"
        @click="(item) => handleModeSelect(item, close)"
      />
      <DropdownItem
        :item="{
          id: 'plan',
          label: '计划',
          icon: 'codicon-todos text-[14px]!',
          checked: permissionMode === 'plan',
          type: 'plan-mode'
        }"
        :is-selected="permissionMode === 'plan'"
        :index="2"
        @click="(item) => handleModeSelect(item, close)"
      />

      <!-- 分隔线 -->
      <div class="dropdown-separator" />

      <!-- 自动审批设置标题 -->
      <div class="dropdown-section-header">自动审批设置</div>

      <!-- 自动审批总开关 -->
      <div class="toggle-item main-toggle" @click.stop="toggleAutoApprove">
        <div class="toggle-content">
          <span class="codicon codicon-shield toggle-icon text-[14px]!" />
          <span class="toggle-label">启用自动审批</span>
        </div>
        <div :class="['toggle-switch', { active: autoApproveEnabled }]">
          <div class="toggle-knob" />
        </div>
      </div>

      <!-- 子选项（仅在启用自动审批时显示） -->
      <template v-if="autoApproveEnabled">
        <!-- Write 工具确认开关 -->
        <div class="toggle-item sub-toggle" @click.stop="toggleWriteConfirm">
          <div class="toggle-content">
            <span class="codicon codicon-new-file toggle-icon text-[14px]!" />
            <span class="toggle-label">写入需确认</span>
          </div>
          <div :class="['toggle-switch', { active: confirmWrite }]">
            <div class="toggle-knob" />
          </div>
        </div>

        <!-- Edit 工具确认开关 -->
        <div class="toggle-item sub-toggle" @click.stop="toggleEditConfirm">
          <div class="toggle-content">
            <span class="codicon codicon-edit toggle-icon text-[14px]!" />
            <span class="toggle-label">编辑需确认</span>
          </div>
          <div :class="['toggle-switch', { active: confirmEdit }]">
            <div class="toggle-knob" />
          </div>
        </div>
      </template>

      <!-- 禁用时的提示 -->
      <div v-else class="disabled-hint">
        <span class="codicon codicon-info"></span>
        <span>关闭后所有操作都需要确认</span>
      </div>
    </template>
  </DropdownTrigger>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PermissionMode } from '../../../shared/permissions'
import { DropdownTrigger, DropdownItem, type DropdownItemData } from './Dropdown'

interface Props {
  permissionMode?: PermissionMode
  autoApproveEnabled?: boolean
  confirmWrite?: boolean
  confirmEdit?: boolean
}

interface Emits {
  (e: 'modeSelect', mode: PermissionMode): void
  (e: 'update:autoApproveEnabled', value: boolean): void
  (e: 'update:confirmWrite', value: boolean): void
  (e: 'update:confirmEdit', value: boolean): void
}

const props = withDefaults(defineProps<Props>(), {
  permissionMode: 'acceptEdits',
  autoApproveEnabled: true,
  confirmWrite: true,
  confirmEdit: true
})

const emit = defineEmits<Emits>()

// 计算显示的模式名称
const selectedModeLabel = computed(() => {
  switch (props.permissionMode) {
    case 'acceptEdits':
      return '代理'
    case 'plan':
      return '计划'
    case 'default':
      return '默认'
    default:
      return '默认'
  }
})

// 计算显示的图标
const selectedModeIcon = computed(() => {
  switch (props.permissionMode) {
    case 'acceptEdits':
      return 'codicon-infinity'
    case 'plan':
      return 'codicon-todos'
    case 'default':
      return 'codicon-chat'
    default:
      return 'codicon-chat'
  }
})

// 本地状态（用于 v-model 双向绑定）
const autoApproveEnabled = computed({
  get: () => props.autoApproveEnabled,
  set: (val) => emit('update:autoApproveEnabled', val)
})

const confirmWrite = computed({
  get: () => props.confirmWrite,
  set: (val) => emit('update:confirmWrite', val)
})

const confirmEdit = computed({
  get: () => props.confirmEdit,
  set: (val) => emit('update:confirmEdit', val)
})

function handleModeSelect(item: DropdownItemData, close: () => void) {
  console.log('Selected mode:', item)
  close()

  // 发送模式切换事件
  emit('modeSelect', item.id as PermissionMode)
}

function toggleAutoApprove() {
  autoApproveEnabled.value = !autoApproveEnabled.value
}

function toggleWriteConfirm() {
  confirmWrite.value = !confirmWrite.value
}

function toggleEditConfirm() {
  confirmEdit.value = !confirmEdit.value
}
</script>

<style scoped>
/* Mode 下拉样式 - 玻璃拟态风格 */
.mode-dropdown {
  display: flex;
  gap: 4px;
  font-size: 12px;
  align-items: center;
  line-height: 24px;
  min-width: 0;
  max-width: 100%;
  padding: 4px 8px 4px 10px;
  border-radius: 20px;
  flex-shrink: 0;
  cursor: pointer;
  /* 毛玻璃效果 */
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  /* 渐变边框效果 */
  border: 1px solid color-mix(in srgb, var(--vscode-foreground) 15%, transparent);
  /* 柔和阴影 */
  box-shadow: 
    0 2px 8px color-mix(in srgb, var(--vscode-widget-shadow) 20%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 5%, transparent);
  /* 平滑过渡 */
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.mode-dropdown:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 15%, transparent);
  border-color: color-mix(in srgb, var(--vscode-foreground) 25%, transparent);
  box-shadow: 
    0 4px 16px color-mix(in srgb, var(--vscode-widget-shadow) 30%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 8%, transparent);
  transform: translateY(-1px);
}

.dropdown-content {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.dropdown-icon {
  font-size: 14px;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex !important;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.2s ease;
}

.mode-dropdown:hover .dropdown-icon {
  opacity: 1;
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
  opacity: 0.85;
  max-width: 120px;
  overflow: hidden;
  height: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  font-weight: 500;
  letter-spacing: 0.2px;
}

.chevron-icon {
  font-size: 10px;
  flex-shrink: 0;
  opacity: 0.6;
  color: var(--vscode-foreground);
  transition: transform 0.25s ease, opacity 0.2s ease;
}

.mode-dropdown:hover .chevron-icon {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 分隔线 - 毛玻璃风格 */
.dropdown-separator {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--vscode-foreground) 15%, transparent) 20%,
    color-mix(in srgb, var(--vscode-foreground) 15%, transparent) 80%,
    transparent
  );
  margin: 8px 12px;
}

/* 分组标题 - 毛玻璃风格 */
.dropdown-section-header {
  font-size: 10px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  padding: 6px 12px;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  opacity: 0.7;
}

/* 开关项 - 毛玻璃风格 */
.toggle-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  border-radius: 6px;
  margin: 0 6px;
}

.toggle-item:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  transform: translateX(2px);
}

/* 主开关样式 - 毛玻璃风格 */
.toggle-item.main-toggle {
  background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  border-radius: 8px;
  margin: 4px 8px 8px 8px;
  padding: 10px 12px;
}

.toggle-item.main-toggle:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  border-color: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--vscode-widget-shadow) 15%, transparent);
}

/* 子开关样式 - 与主开关对齐 */
.toggle-item.sub-toggle {
  background: color-mix(in srgb, var(--vscode-foreground) 5%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  border-radius: 8px;
  margin: 4px 8px;
  padding: 10px 12px;
}

.toggle-item.sub-toggle:hover {
  background: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  border-color: color-mix(in srgb, var(--vscode-foreground) 18%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--vscode-widget-shadow) 15%, transparent);
}

.toggle-content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toggle-icon {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.toggle-item:hover .toggle-icon {
  opacity: 0.9;
}

.toggle-label {
  font-size: 12px;
  color: var(--vscode-foreground);
  font-weight: 400;
}

/* 禁用提示 - 毛玻璃风格 */
.disabled-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  font-style: italic;
  background: color-mix(in srgb, var(--vscode-foreground) 3%, transparent);
  border-radius: 6px;
  margin: 4px 8px;
}

.disabled-hint .codicon {
  font-size: 12px;
  opacity: 0.6;
}

/* 开关样式 - 毛玻璃风格 */
.toggle-switch {
  width: 36px;
  height: 18px;
  border-radius: 10px;
  /* 毛玻璃背景 */
  background: color-mix(in srgb, var(--vscode-foreground) 15%, transparent);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid color-mix(in srgb, var(--vscode-foreground) 20%, transparent);
  position: relative;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  box-shadow: inset 0 1px 2px color-mix(in srgb, black 10%, transparent);
}

.toggle-switch.active {
  /* 激活状态渐变 */
  background: linear-gradient(
    135deg,
    var(--vscode-button-background),
    color-mix(in srgb, var(--vscode-button-background) 80%, #667eea)
  );
  border-color: var(--vscode-button-background);
  box-shadow: 
    0 2px 8px color-mix(in srgb, var(--vscode-button-background) 40%, transparent),
    inset 0 1px 0 color-mix(in srgb, white 10%, transparent);
}

.toggle-knob {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  /* 毛玻璃效果的旋钮 */
  background: linear-gradient(
    135deg,
    var(--vscode-foreground),
    color-mix(in srgb, var(--vscode-foreground) 80%, transparent)
  );
  position: absolute;
  top: 1px;
  left: 1px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0.7;
  box-shadow: 0 1px 3px color-mix(in srgb, black 20%, transparent);
}

.toggle-switch.active .toggle-knob {
  transform: translateX(18px);
  background: linear-gradient(
    135deg,
    var(--vscode-button-foreground),
    color-mix(in srgb, var(--vscode-button-foreground) 90%, transparent)
  );
  opacity: 1;
  box-shadow: 0 2px 4px color-mix(in srgb, black 25%, transparent);
}
</style>
