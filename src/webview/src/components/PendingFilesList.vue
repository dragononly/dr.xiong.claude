<template>
  <div class="pending-files-container">
    <div class="pending-files-header">
      <span class="codicon codicon-edit"></span>
      <span class="header-text">{{ pendingFiles.length }} 个文件待确认</span>
      <div class="header-actions">
        <button class="action-btn reject-all" @click="handleRejectAll" title="全部拒绝">
          <span class="codicon codicon-close"></span>
        </button>
        <button class="action-btn accept-all" @click="handleAcceptAll" title="全部接受">
          <span class="codicon codicon-check-all"></span>
        </button>
      </div>
    </div>
    <div class="pending-files-list">
      <div
        v-for="file in pendingFiles"
        :key="file.id"
        class="pending-file-item"
      >
        <div class="file-info">
          <span :class="['codicon', file.isWrite ? 'codicon-new-file' : 'codicon-edit']"></span>
          <span class="file-name" :title="file.filePath">{{ file.fileName }}</span>
          <span class="file-action-type">{{ file.isWrite ? 'Write' : 'Edit' }}</span>
        </div>
        <div class="file-actions">
          <button class="file-btn reject" @click="handleReject(file)" title="拒绝">
            <span class="codicon codicon-close"></span>
          </button>
          <button class="file-btn accept" @click="handleAccept(file)" title="接受">
            <span class="codicon codicon-check"></span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import path from 'path-browserify-esm';
import type { PermissionRequest } from '../core/PermissionRequest';

interface Props {
  permissionRequests: PermissionRequest[];
}

const props = defineProps<Props>();

interface PendingFile {
  id: string;
  request: PermissionRequest;
  toolName: string;
  filePath: string;
  fileName: string;
  isWrite: boolean;
}

// 工具名称映射（后端使用 file_write/file_edit，需要同时支持两种命名方式）
const isWriteTool = (name: string) => name === 'Write' || name === 'file_write';
const isEditTool = (name: string) => name === 'Edit' || name === 'file_edit';

// 🔍 调试日志
import { watch } from 'vue';
watch(() => props.permissionRequests, (newVal) => {
  console.log('[PendingFilesList] permissionRequests 变化:', newVal.length, newVal);
}, { immediate: true, deep: true });

const pendingFiles = computed<PendingFile[]>(() => {
  console.log('[PendingFilesList] 计算 pendingFiles, permissionRequests:', props.permissionRequests.length);
  return props.permissionRequests
    .filter(req => isWriteTool(req.toolName) || isEditTool(req.toolName))
    .map((req, index) => ({
      id: `${req.toolName}-${req.inputs?.file_path || index}`,
      request: req,
      toolName: req.toolName,
      filePath: (req.inputs?.file_path as string) || '',
      fileName: path.basename((req.inputs?.file_path as string) || ''),
      isWrite: isWriteTool(req.toolName)
    }));
});

function handleAccept(file: PendingFile) {
  // 传递空数组，不记住权限
  file.request.accept(file.request.inputs, []);
}

function handleReject(file: PendingFile) {
  file.request.reject('User rejected the file operation', true);
}

function handleAcceptAll() {
  pendingFiles.value.forEach(file => {
    file.request.accept(file.request.inputs, []);
  });
}

function handleRejectAll() {
  pendingFiles.value.forEach(file => {
    file.request.reject('User rejected all file operations', true);
  });
}
</script>

<style scoped>
.pending-files-container {
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-focusBorder);
  border-radius: 6px;
  margin-bottom: 8px;
  overflow: hidden;
}

.pending-files-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--vscode-focusBorder) 15%, var(--vscode-editor-background));
  border-bottom: 1px solid var(--vscode-panel-border);
}

.pending-files-header .codicon {
  font-size: 14px;
  color: var(--vscode-focusBorder);
}

.header-text {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.header-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.action-btn .codicon {
  font-size: 14px;
}

.action-btn.reject-all {
  background: transparent;
  color: var(--vscode-errorForeground);
}

.action-btn.reject-all:hover {
  background: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
}

.action-btn.accept-all {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.action-btn.accept-all:hover {
  background: var(--vscode-button-hoverBackground);
}

.pending-files-list {
  max-height: 150px;
  overflow-y: auto;
}

.pending-file-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--vscode-panel-border);
  transition: background-color 0.1s;
}

.pending-file-item:last-child {
  border-bottom: none;
}

.pending-file-item:hover {
  background: color-mix(in srgb, var(--vscode-list-hoverBackground) 50%, transparent);
}

.file-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.file-info .codicon {
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}

.file-info .codicon-new-file {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.file-info .codicon-edit {
  color: var(--vscode-gitDecoration-modifiedResourceForeground);
}

.file-name {
  font-size: 12px;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-foreground);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-action-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--vscode-badge-background) 50%, transparent);
  color: var(--vscode-badge-foreground);
  flex-shrink: 0;
}

.file-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.file-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.15s, transform 0.1s;
}

.file-btn .codicon {
  font-size: 12px;
}

.file-btn:active {
  transform: scale(0.95);
}

.file-btn.reject {
  background: transparent;
  color: var(--vscode-errorForeground);
}

.file-btn.reject:hover {
  background: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
}

.file-btn.accept {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.file-btn.accept:hover {
  background: var(--vscode-button-hoverBackground);
}

/* 滚动条样式 */
.pending-files-list::-webkit-scrollbar {
  width: 8px;
}

.pending-files-list::-webkit-scrollbar-track {
  background: transparent;
}

.pending-files-list::-webkit-scrollbar-thumb {
  background-color: var(--vscode-scrollbarSlider-background);
  border-radius: 4px;
}

.pending-files-list::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}
</style>
