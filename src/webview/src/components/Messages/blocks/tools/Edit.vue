<template>
  <ToolMessageWrapper
    tool-icon="codicon-edit"
    tool-name="Edit"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-diff-view': hasDiffView }"
  >
    <template #main>
      <span class="tool-label">Edit</span>
      <ToolFilePath v-if="filePath" :file-path="filePath" :context="context" />
      <span v-if="diffStats" class="diff-stats">
        <span v-if="diffStats.added > 0" class="stat-add">+{{ diffStats.added }}</span>
        <span v-if="diffStats.removed > 0" class="stat-remove">-{{ diffStats.removed }}</span>
      </span>
      <!-- 查看快照差异按钮 -->
      <button
        v-if="canViewSnapshotDiff"
        class="view-snapshot-diff-btn"
        :disabled="isViewingSnapshotDiff"
        @click.stop="handleViewSnapshotDiff"
        title="在 VSCode 中查看完整差异（原始 ↔ 修改后）"
      >
        <span v-if="isViewingSnapshotDiff" class="codicon codicon-loading codicon-modifier-spin"></span>
        <span v-else class="codicon codicon-diff"></span>
      </button>
      <!-- 撤回按钮 -->
      <button
        v-if="canRevert"
        class="revert-btn"
        :disabled="isReverting"
        @click.stop="handleRevert"
        title="撤回此次编辑"
      >
        <span v-if="isReverting" class="codicon codicon-loading codicon-modifier-spin"></span>
        <span v-else class="codicon codicon-discard"></span>
      </button>
      <span v-if="revertSuccess" class="revert-success">✅ 已撤回</span>
      <span v-if="revertError" class="revert-error" :title="revertError">❌ 撤回失败</span>
    </template>

    <!-- 展开内容：显示 diff 视图 -->
    <template #expandable>
      <!-- 替换选项 -->
      <div v-if="replaceAll" class="replace-option">
        <span class="codicon codicon-replace-all"></span>
        <span>全部替换</span>
      </div>

      <!-- Diff 视图 -->
      <div v-if="structuredPatch && structuredPatch.length > 0" class="diff-view">
        <!-- 文件标题栏 -->
        <div v-if="filePath" class="diff-file-header">
          <FileIcon :file-name="filePath" :size="16" class="file-icon" />
          <span class="file-name">{{ fileName }}</span>
          <button
            v-if="canOpenDiff"
            class="open-diff-btn"
            title="在 VSCode 中打开对比"
            @click.stop="openInVSCodeDiff"
          >
            <span class="codicon codicon-diff"></span>
          </button>
        </div>
        <!-- Diff 双列布局:行号 + 内容 -->
        <div class="diff-scroll-container">
          <!-- 左侧:行号列 -->
          <div ref="lineNumbersRef" class="diff-line-numbers">
            <div v-for="(patch, index) in structuredPatch" :key="index">
              <div
                v-for="(line, lineIndex) in patch.lines"
                :key="lineIndex"
                class="line-number-item"
                :class="getDiffLineClass(line)"
              >
                {{ getLineNumber(patch, lineIndex) }}
              </div>
            </div>
          </div>

          <!-- 右侧:内容列(可滚动) -->
          <div ref="contentRef" class="diff-content" @scroll="handleContentScroll">
            <div v-for="(patch, index) in structuredPatch" :key="index" class="diff-block">
              <div class="diff-lines">
                <div
                  v-for="(line, lineIndex) in patch.lines"
                  :key="lineIndex"
                  class="diff-line"
                  :class="getDiffLineClass(line)"
                >
                  <span class="line-prefix">{{ getLinePrefix(line) }}</span>
                  <span class="line-content">{{ getLineContent(line) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 内联确认按钮 (Cline 风格) -->
        <div v-if="pendingPermission" class="inline-permission-actions">
          <button class="btn-reject" @click="handleReject">
            <span class="codicon codicon-close"></span>
            <span>拒绝</span>
          </button>
          <button class="btn-accept" @click="handleAccept">
            <span class="codicon codicon-check"></span>
            <span>接受</span>
          </button>
        </div>
      </div>

      <!-- 错误内容 -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed, ref, watch, inject } from 'vue';
import path from 'path-browserify-esm';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import FileIcon from '@/components/FileIcon.vue';
import { RuntimeKey } from '@/composables/runtimeContext';
import { unescapeString } from '@/utils/formatUtils';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
  context?: ToolContext;
}

const props = defineProps<Props>();

const runtime = inject(RuntimeKey);

// 撤回状态
const isReverting = ref(false);
const revertSuccess = ref(false);
const revertError = ref<string | null>(null);

// 查看快照差异状态
const isViewingSnapshotDiff = ref(false);

const filePath = computed(() => {
  return props.toolUse?.input?.file_path || '';
});

const fileName = computed(() => {
  if (!filePath.value) return '';
  return path.basename(filePath.value);
});

const replaceAll = computed(() => {
  return props.toolUse?.input?.replace_all;
});

// 使用 ref 存储 structuredPatch，通过 watch 更新
const structuredPatch = ref<any>(null);

// 监听 props 变化，更新 structuredPatch
watch(
  () => [props.toolUseResult, props.toolUse, props.toolResult],
  () => {

    // 如果有错误，不显示 diff
    if (props.toolResult?.is_error) {
      structuredPatch.value = null;
      return;
    }

    // 优先使用 toolUseResult 中的 structuredPatch (执行后返回的真实 diff)
    if (props.toolUseResult?.structuredPatch) {
      structuredPatch.value = props.toolUseResult.structuredPatch;
    }
    // 如果有 input,生成临时 diff(权限请求阶段或实时对话执行完成后保留)
    else if (props.toolUse?.input?.old_string && props.toolUse?.input?.new_string) {
      structuredPatch.value = generatePatchFromInput(
        props.toolUse.input.old_string,
        props.toolUse.input.new_string
      );
    }
  },
  { immediate: true, deep: true }
);

const hasDiffView = computed(() => {
  return structuredPatch.value && structuredPatch.value.length > 0;
});

// 判断是否为权限请求阶段(临时 diff from input)
const isPermissionRequest = computed(() => {
  const hasToolUseResult = !!props.toolUseResult?.structuredPatch;
  const hasInputDiff = !!(props.toolUse?.input?.old_string && props.toolUse?.input?.new_string);

  return !hasToolUseResult && hasInputDiff;
});

// 只在权限请求阶段或有错误时展开，执行完成后默认折叠
const shouldExpand = computed(() => {
  // 有错误时展开
  if (props.toolResult?.is_error) return true;
  // 权限请求阶段展开
  return hasDiffView.value && isPermissionRequest.value;
});

// 是否可以打开 VSCode diff（已执行完成且有文件路径）
const canOpenDiff = computed(() => {
  return filePath.value && !isPermissionRequest.value && !props.toolResult?.is_error;
});

// 查找匹配当前工具的待处理权限请求
const pendingPermission = computed(() => {
  if (!props.context?.permissionRequests || !filePath.value) return null;

  // 查找 toolName 为 file_edit 且 file_path 匹配的权限请求
  // 注意: 后端使用 file_edit，前端组件名是 Edit
  return props.context.permissionRequests.find(req =>
    (req.toolName === 'file_edit' || req.toolName === 'Edit') &&
    req.inputs?.file_path === filePath.value
  );
});

// 在 VSCode 中打开 diff 视图
async function openInVSCodeDiff() {
  if (!runtime || !filePath.value) return;

  try {
    const connection = await runtime.sessionStore.getConnection();
    const oldString = props.toolUse?.input?.old_string || '';
    const newString = props.toolUse?.input?.new_string || '';

    // 构建 edits 数组
    const edits = [{
      old_string: oldString,
      new_string: newString
    }];

    await connection.openDiff(
      filePath.value,
      filePath.value,
      edits,
      false
    );
  } catch (error) {
    console.error('[Edit] Failed to open diff:', error);
  }
}

// DOM 引用
const lineNumbersRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();

// 同步行号列和内容列的垂直滚动
function handleContentScroll() {
  if (lineNumbersRef.value && contentRef.value) {
    lineNumbersRef.value.scrollTop = contentRef.value.scrollTop;
  }
}

// 从 old_string 和 new_string 生成简单的 patch
function generatePatchFromInput(oldStr: string, newStr: string): any[] {
  // 先处理转义字符，将 \n 等转换为实际换行符
  const oldLines = unescapeString(oldStr).split('\n');
  const newLines = unescapeString(newStr).split('\n');

  const lines: string[] = [];

  // 添加删除的行
  oldLines.forEach(line => {
    lines.push('-' + line);
  });

  // 添加新增的行
  newLines.forEach(line => {
    lines.push('+' + line);
  });

  return [{
    oldStart: 1,
    oldLines: oldLines.length,
    newStart: 1,
    newLines: newLines.length,
    lines
  }];
}

// 计算 diff 统计
const diffStats = computed(() => {
  if (!structuredPatch.value) return null;

  let added = 0;
  let removed = 0;

  structuredPatch.value.forEach((patch: any) => {
    patch.lines.forEach((line: string) => {
      if (line.startsWith('+')) added++;
      if (line.startsWith('-')) removed++;
    });
  });

  return { added, removed };
});

// 获取 diff 行的类型类名
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

// 获取行内容（去除前缀）
function getLineContent(line: string): string {
  if (line.startsWith('-') || line.startsWith('+')) {
    return line.substring(1);
  }
  return line;
}

// 计算行号（删除行显示旧行号，添加行显示新行号）
function getLineNumber(patch: any, lineIndex: number): string {
  const currentLine = patch.lines[lineIndex];

  if (currentLine.startsWith('-')) {
    // 删除行：显示旧行号
    let oldLine = patch.oldStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = patch.lines[i];
      if (!line.startsWith('+')) {
        oldLine++;
      }
    }
    return String(oldLine);
  } else if (currentLine.startsWith('+')) {
    // 添加行：显示新行号
    let newLine = patch.newStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = patch.lines[i];
      if (!line.startsWith('-')) {
        newLine++;
      }
    }
    return String(newLine);
  } else {
    // 上下文行：显示新行号
    let newLine = patch.newStart;
    for (let i = 0; i < lineIndex; i++) {
      const line = patch.lines[i];
      if (!line.startsWith('-')) {
        newLine++;
      }
    }
    return String(newLine);
  }
}

// 处理接受操作
function handleAccept() {
  if (pendingPermission.value) {
    // 传递空数组，不记住权限，下次还会询问
    pendingPermission.value.accept(pendingPermission.value.inputs, []);
  }
}

// 处理拒绝操作
function handleReject() {
  if (pendingPermission.value) {
    pendingPermission.value.reject('User rejected the file edit operation', true);
  }
}

// ============================================================================
// 撤回功能
// ============================================================================

// 从 toolResult 获取快照 ID 和是否可撤回
// 从 toolResult 获取快照 ID（不使用 toolUse.id fallback，因为那不是真正的快照 ID）
const snapshotId = computed(() => {
  return props.toolResult?.snapshotId || null;
});

const canRevert = computed(() => {
  // 只有成功执行且未被撤回的修改才能撤回
  if (revertSuccess.value) return false;  // 已撤回
  if (!props.toolResult) return false;    // 未执行完成
  if (props.toolResult.is_error) return false;  // 执行失败
  // 只有后端明确标记 canRevert=true 才显示撤回按钮
  return props.toolResult.canRevert === true;
});

// 是否可以查看快照差异（有快照就可以查看）
const canViewSnapshotDiff = computed(() => {
  if (!props.toolResult) return false;
  if (props.toolResult.is_error) return false;
  return props.toolResult.canRevert === true;
});

// 处理查看快照差异
async function handleViewSnapshotDiff() {
  if (!snapshotId.value || !runtime) return;

  isViewingSnapshotDiff.value = true;
  try {
    const connection = await runtime.connectionManager.get();
    await connection.viewSnapshotDiff(snapshotId.value);
  } catch (error) {
    console.error('[Edit.vue] viewSnapshotDiff 错误:', error);
  } finally {
    isViewingSnapshotDiff.value = false;
  }
}

// 处理撤回操作
async function handleRevert() {
  if (!snapshotId.value || !runtime) return;

  isReverting.value = true;
  revertError.value = null;

  try {
    const connection = await runtime.connectionManager.get();
    const result = await connection.revertFileChange(snapshotId.value);

    if (result.success) {
      revertSuccess.value = true;
    } else {
      revertError.value = result.error || '撤回失败';
    }
  } catch (error) {
    revertError.value = String(error);
  } finally {
    isReverting.value = false;
  }
}
</script>

<style scoped>
/* 有 diff 视图时移除左侧边框和边距，error 保留默认样式 */
.has-diff-view :deep(.expandable-content) {
  border-left: none;
  padding: 0;
  margin-left: 0;
}

.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.diff-stats {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  font-size: 0.85em;
  font-weight: 500;
}

/* 查看快照差异按钮样式 */
.view-snapshot-diff-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  padding: 2px 6px;
  font-size: 0.75em;
  border: none;
  border-radius: 3px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
}

.view-snapshot-diff-btn:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.view-snapshot-diff-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.view-snapshot-diff-btn .codicon {
  font-size: 14px;
}

/* 撤回按钮样式 */
.revert-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  padding: 2px 6px;
  font-size: 0.75em;
  border: none;
  border-radius: 3px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  transition: background-color 0.15s, opacity 0.15s;
}

.revert-btn:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.revert-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.revert-btn .codicon {
  font-size: 12px;
}

.revert-success {
  margin-left: 8px;
  font-size: 0.75em;
  color: var(--vscode-testing-iconPassed);
}

.revert-error {
  margin-left: 8px;
  font-size: 0.75em;
  color: var(--vscode-testing-iconFailed);
  cursor: help;
}

.stat-add {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.stat-remove {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.replace-option {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--vscode-charts-orange);
  font-size: 0.85em;
  font-weight: 500;
  padding: 4px 0;
}

.replace-option .codicon {
  font-size: 12px;
}

.diff-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: .5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

.diff-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.diff-file-header :deep(.mdi),
.diff-file-header :deep(.codicon) {
  flex-shrink: 0;
}

.diff-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
  flex: 1;
}

.open-diff-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  border-radius: 3px;
  cursor: pointer;
  opacity: 0.6;
  transition: opacity 0.15s, background-color 0.15s;
  margin-left: auto;
}

.open-diff-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
}

.open-diff-btn .codicon {
  font-size: 14px;
}

.diff-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

/* 左侧行号列 */
.diff-line-numbers {
  width: 50px;
  flex-shrink: 0;
  overflow: hidden;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, transparent);
  border-right: 1px solid var(--vscode-panel-border);
}

.line-number-item {
  height: 22px;
  line-height: 22px;
  padding: 0 8px;
  text-align: right;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
}

/* 右侧内容列 */
.diff-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Monaco 风格滚动条(仅应用于内容列) */
.diff-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.diff-content::-webkit-scrollbar-track {
  background: transparent;
}

.diff-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.diff-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.diff-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.diff-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.diff-content::-webkit-scrollbar-corner {
  background: transparent;
}

.diff-block {
  width: 100%;
}

.diff-lines {
  background-color: var(--vscode-editor-background);
  width: fit-content;
  min-width: 100%;
}

.diff-line {
  display: flex;
  font-family: var(--vscode-editor-font-family);
  white-space: nowrap;
  height: 22px;
  line-height: 22px;
}

.line-prefix {
  display: inline-block;
  width: 20px;
  text-align: center;
  padding: 0 4px;
  flex-shrink: 0;
  user-select: none;
}

.line-content {
  flex: 1;
  padding: 0 8px 0 4px;
  white-space: pre;
}

.diff-line-delete {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 20%, transparent);
}

.diff-line-delete .line-prefix {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-deletedResourceForeground) 25%, transparent);
}

.diff-line-delete .line-content {
  color: var(--vscode-gitDecoration-deletedResourceForeground);
}

.diff-line-add {
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 20%, transparent);
}

.diff-line-add .line-prefix {
  color: var(--vscode-gitDecoration-addedResourceForeground);
  background-color: color-mix(in srgb, var(--vscode-gitDecoration-addedResourceForeground) 25%, transparent);
}

.diff-line-add .line-content {
  color: var(--vscode-gitDecoration-addedResourceForeground);
}

.diff-line-context {
  background-color: var(--vscode-editor-background);
}

.diff-line-context .line-prefix {
  color: color-mix(in srgb, var(--vscode-foreground) 40%, transparent);
}

.diff-line-context .line-content {
  color: var(--vscode-editor-foreground);
}

/* 内联确认按钮样式 (Cline 风格) */
.inline-permission-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 8px 12px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 95%, var(--vscode-focusBorder));
  border-top: 1px solid var(--vscode-widget-border);
}

.btn-reject,
.btn-accept {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.15s, transform 0.1s;
}

.btn-reject {
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
}

.btn-reject:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.btn-reject:active {
  transform: scale(0.98);
}

.btn-accept {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.btn-accept:hover {
  background: var(--vscode-button-hoverBackground);
}

.btn-accept:active {
  transform: scale(0.98);
}

.btn-reject .codicon,
.btn-accept .codicon {
  font-size: 11px;
}
</style>
