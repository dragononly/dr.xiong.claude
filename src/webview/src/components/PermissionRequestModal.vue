<template>
  <div
    class="permission-request-container"
    tabIndex="0"
    @keydown="handleContainerKeyDown"
    data-permission-panel="1"
  >
    <div class="permission-request-content">
      <!-- 文件操作专用视图 (Write/Edit) -->
      <template v-if="isFileOperation">
        <div class="file-operation-header">
          <span :class="['codicon', fileOperationIcon]"></span>
          <span class="operation-title">{{ fileOperationTitle }}</span>
        </div>

        <!-- 文件路径 -->
        <div v-if="filePath" class="file-path-row">
          <span class="codicon codicon-file"></span>
          <span class="file-path">{{ filePath }}</span>
        </div>

        <!-- Write 工具：显示文件内容预览 -->
        <div v-if="isWriteTool && fileContent" class="file-preview">
          <div class="preview-header">
            <span>文件内容预览</span>
            <span class="content-stats">{{ contentStats }}</span>
          </div>
          <div class="preview-content">
            <pre>{{ truncatedContent }}</pre>
          </div>
        </div>

        <!-- Edit 工具：显示 diff 预览 -->
        <div v-if="isEditTool && hasEditContent" class="diff-preview">
          <div class="preview-header">
            <span>修改预览</span>
            <span class="diff-stats">
              <span v-if="diffStats.added > 0" class="stat-add">+{{ diffStats.added }}</span>
              <span v-if="diffStats.removed > 0" class="stat-remove">-{{ diffStats.removed }}</span>
            </span>
          </div>
          <div class="diff-content">
            <div v-for="(line, index) in diffLines" :key="index" class="diff-line" :class="getDiffLineClass(line)">
              <span class="line-prefix">{{ getLinePrefix(line) }}</span>
              <span class="line-text">{{ getLineContent(line) }}</span>
            </div>
          </div>
        </div>
      </template>

      <!-- 通用工具视图 -->
      <template v-else>
        <div class="permission-request-header">
          是否允许执行 <strong>{{ request.toolName }}</strong>？
        </div>

        <!-- 通用 Details 作为兜底 -->
        <div v-if="hasInputs" class="permission-request-description">
          <details>
            <summary>
              <span>详情</span>
              <svg
                class="chevron"
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M3 4.5L6 7.5L9 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <pre class="input-json">{{ displayInputs }}</pre>
          </details>
        </div>
      </template>
    </div>

    <!-- 文件操作按钮 -->
    <div v-if="isFileOperation" class="button-container file-operation-buttons">
      <button class="button primary save-btn" @click="handleApprove">
        <span class="codicon codicon-check"></span>
        <span class="shortcut-num">1</span> 保存
      </button>
      <button class="button revert-btn" @click="handleReject">
        <span class="codicon codicon-discard"></span>
        <span class="shortcut-num">2</span> 撤回
      </button>
      <input
        ref="inputRef"
        class="reject-message-input"
        placeholder="告诉 Claude 应该怎么做"
        v-model="rejectMessage"
        @keydown="handleKeyDown"
      />
    </div>

    <!-- 通用按钮 -->
    <div v-else class="button-container">
      <button class="button primary" @click="handleApprove">
        <span class="shortcut-num">1</span> 允许
      </button>
      <button v-if="showSecondButton" class="button" @click="handleApproveAndDontAsk">
        <span class="shortcut-num">2</span> 允许，且不再询问
      </button>
      <button class="button" @click="handleReject">
        <span class="shortcut-num">{{ showSecondButton ? '3' : '2' }}</span> 拒绝
      </button>
      <input
        ref="inputRef"
        class="reject-message-input"
        placeholder="告诉 Claude 应该怎么做"
        v-model="rejectMessage"
        @keydown="handleKeyDown"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { PermissionRequest } from '../core/PermissionRequest';
import type { ToolContext } from '../types/tool';

interface Props {
  request: PermissionRequest;
  context: ToolContext;
  onResolve: (request: PermissionRequest, allow: boolean) => void;
}

const props = defineProps<Props>();

const inputRef = ref<HTMLInputElement | null>(null);
const rejectMessage = ref('');
const modifiedInputs = ref<any | undefined>(undefined);

// 判断是否为文件操作工具
const isFileOperation = computed(() => {
  return props.request.toolName === 'Write' || props.request.toolName === 'Edit';
});

const isWriteTool = computed(() => props.request.toolName === 'Write');
const isEditTool = computed(() => props.request.toolName === 'Edit');

// 文件操作图标
const fileOperationIcon = computed(() => {
  if (isWriteTool.value) return 'codicon-new-file';
  if (isEditTool.value) return 'codicon-edit';
  return 'codicon-file';
});

// 文件操作标题
const fileOperationTitle = computed(() => {
  if (isWriteTool.value) return '确认写入文件';
  if (isEditTool.value) return '确认编辑文件';
  return '确认文件操作';
});

// 获取文件路径
const filePath = computed(() => {
  return props.request.inputs?.file_path || '';
});

// Write 工具：获取文件内容
const fileContent = computed(() => {
  return props.request.inputs?.content || '';
});

// 内容统计
const contentStats = computed(() => {
  if (!fileContent.value) return '';
  const lines = fileContent.value.split('\n').length;
  const chars = fileContent.value.length;
  return `${lines} 行, ${chars} 字符`;
});

// 截断内容（最多显示 20 行）
const truncatedContent = computed(() => {
  if (!fileContent.value) return '';
  const lines = fileContent.value.split('\n');
  if (lines.length <= 20) return fileContent.value;
  return lines.slice(0, 20).join('\n') + '\n... (还有 ' + (lines.length - 20) + ' 行)';
});

// Edit 工具：判断是否有编辑内容
const hasEditContent = computed(() => {
  return props.request.inputs?.old_string !== undefined ||
         props.request.inputs?.new_string !== undefined;
});

// 生成 diff 行
const diffLines = computed(() => {
  if (!hasEditContent.value) return [];

  const oldStr = props.request.inputs?.old_string || '';
  const newStr = props.request.inputs?.new_string || '';

  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  const lines: string[] = [];

  // 添加删除的行
  oldLines.forEach(line => {
    lines.push('-' + line);
  });

  // 添加新增的行
  newLines.forEach(line => {
    lines.push('+' + line);
  });

  // 限制显示行数
  if (lines.length > 30) {
    return [...lines.slice(0, 30), '... (还有 ' + (lines.length - 30) + ' 行)'];
  }

  return lines;
});

// Diff 统计
const diffStats = computed(() => {
  if (!hasEditContent.value) return { added: 0, removed: 0 };

  const oldStr = props.request.inputs?.old_string || '';
  const newStr = props.request.inputs?.new_string || '';

  const removed = oldStr.split('\n').length;
  const added = newStr.split('\n').length;

  return { added, removed };
});

// 获取 diff 行类名
function getDiffLineClass(line: string): string {
  if (line.startsWith('-')) return 'diff-line-delete';
  if (line.startsWith('+')) return 'diff-line-add';
  return 'diff-line-context';
}

// 获取行前缀
function getLinePrefix(line: string): string {
  if (line.startsWith('-') || line.startsWith('+')) {
    return line[0];
  }
  return ' ';
}

// 获取行内容
function getLineContent(line: string): string {
  if (line.startsWith('-') || line.startsWith('+')) {
    return line.substring(1);
  }
  return line;
}

const hasInputs = computed(() => Object.keys(props.request.inputs).length > 0);
const showSecondButton = computed(
  () => props.request.suggestions && props.request.suggestions.length > 0
);
const displayInputs = computed(() => {
  try {
    return JSON.stringify(modifiedInputs.value ?? props.request.inputs, null, 2);
  } catch {
    return '{}';
  }
});

const handleModifyInputs = (newInputs: any) => {
  modifiedInputs.value = newInputs;
};

const handleApprove = () => {
  if (modifiedInputs.value) {
    (props.request as any).inputs = modifiedInputs.value;
  }
  props.onResolve(props.request, true);
};

const handleApproveAndDontAsk = () => {
  props.request.accept(props.request.inputs, props.request.suggestions || []);
};

const handleReject = () => {
  const trimmedMessage = rejectMessage.value.trim();
  const rejectionMessage = trimmedMessage
    ? `The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). The user provided the following reason for the rejection: ${trimmedMessage}`
    : "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.";

  props.request.reject(rejectionMessage, !trimmedMessage);
};

const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleReject();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    handleReject();
  }
};

const handleContainerKeyDown = (e: KeyboardEvent) => {
  if (inputRef.value && document.activeElement === inputRef.value) {
    return;
  }

  if (e.key === '1') {
    e.preventDefault();
    handleApprove();
  } else if (e.key === '2') {
    e.preventDefault();
    if (isFileOperation.value) {
      handleReject();
    } else if (showSecondButton.value) {
      handleApproveAndDontAsk();
    } else {
      handleReject();
    }
  } else if (e.key === '3' && showSecondButton.value && !isFileOperation.value) {
    e.preventDefault();
    handleReject();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    handleReject();
  }
};
</script>

<style scoped>
.permission-request-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-input-border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  outline: none;
}

.permission-request-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.permission-request-header {
  font-size: 14px;
  line-height: 1.5;
  color: var(--vscode-foreground);
}

.permission-request-header strong {
  font-weight: 600;
}

/* 文件操作样式 */
.file-operation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.file-operation-header .codicon {
  font-size: 16px;
  color: var(--vscode-textLink-foreground);
}

.operation-title {
  color: var(--vscode-foreground);
}

.file-path-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  font-family: var(--vscode-editor-font-family);
  font-size: 12px;
}

.file-path-row .codicon {
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
}

.file-path {
  color: var(--vscode-textLink-foreground);
  word-break: break-all;
}

/* 文件预览样式 */
.file-preview,
.diff-preview {
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  overflow: hidden;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.15);
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.content-stats {
  color: var(--vscode-descriptionForeground);
  font-weight: normal;
}

.diff-stats {
  display: flex;
  gap: 8px;
}

.stat-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  font-weight: 600;
}

.stat-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  font-weight: 600;
}

.preview-content {
  max-height: 200px;
  overflow: auto;
  background: var(--vscode-editor-background);
}

.preview-content pre {
  margin: 0;
  padding: 8px 12px;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--vscode-editor-foreground);
}

/* Diff 内容样式 */
.diff-content {
  max-height: 200px;
  overflow: auto;
  background: var(--vscode-editor-background);
}

.diff-line {
  display: flex;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  line-height: 20px;
}

.line-prefix {
  width: 20px;
  text-align: center;
  flex-shrink: 0;
  user-select: none;
}

.line-text {
  flex: 1;
  padding: 0 8px;
  white-space: pre-wrap;
  word-break: break-all;
}

.diff-line-delete {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 20%, transparent);
}

.diff-line-delete .line-prefix {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 25%, transparent);
}

.diff-line-delete .line-text {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-line-add {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 20%, transparent);
}

.diff-line-add .line-prefix {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 25%, transparent);
}

.diff-line-add .line-text {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-line-context {
  background-color: var(--vscode-editor-background);
}

.diff-line-context .line-prefix {
  color: var(--vscode-descriptionForeground);
}

.diff-line-context .line-text {
  color: var(--vscode-editor-foreground);
}

/* 通用样式 */
.permission-request-description {
  font-size: 13px;
}

.permission-request-description details {
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.1);
}

.permission-request-description summary {
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  list-style: none;
}

.permission-request-description summary::-webkit-details-marker {
  display: none;
}

.chevron {
  transition: transform 0.2s;
  color: var(--vscode-descriptionForeground);
}

.permission-request-description details[open] .chevron {
  transform: rotate(180deg);
}

.input-json {
  margin: 8px 0 0 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 200px;
  overflow: auto;
  font-family: var(--vscode-editor-font-family, 'Monaco', 'Courier New', monospace);
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--vscode-editor-foreground);
}

.button-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: stretch;
}

/* 文件操作按钮样式 */
.file-operation-buttons {
  flex-direction: row;
  flex-wrap: wrap;
}

.file-operation-buttons .button {
  flex: 1;
  min-width: 100px;
  justify-content: center;
}

.file-operation-buttons .reject-message-input {
  flex-basis: 100%;
  margin-top: 4px;
}

.save-btn {
  gap: 6px;
}

.save-btn .codicon {
  font-size: 14px;
}

.revert-btn {
  gap: 6px;
}

.revert-btn .codicon {
  font-size: 14px;
}

.button {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 8px 12px;
  font-size: 13px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: 1px solid var(--vscode-button-border);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  width: 100%;
}

.button:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.button.primary:hover {
  background: var(--vscode-button-hoverBackground);
}

.shortcut-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-right: 6px;
  font-size: 11px;
  font-weight: 600;
  opacity: 0.7;
}

.reject-message-input {
  padding: 8px 12px;
  font-size: 13px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  border-radius: 4px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
}

.reject-message-input:focus {
  border-color: var(--vscode-focusBorder);
}

.reject-message-input::placeholder {
  color: var(--vscode-input-placeholderForeground);
}
</style>
