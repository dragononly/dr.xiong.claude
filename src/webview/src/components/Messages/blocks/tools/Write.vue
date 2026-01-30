<template>
  <ToolMessageWrapper
    tool-icon="codicon-new-file"
    tool-name="Write"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
    :class="{ 'has-content-view': hasContentView }"
  >
    <template #main>
      <span class="tool-label">Write</span>
      <ToolFilePath v-if="filePath" :file-path="filePath" :context="context" />
      <span v-if="contentStats" class="content-stats">
        <span class="stat-lines">{{ contentStats.lines }} Lines </span>
        <span class="stat-chars">{{ contentStats.chars }} Chars </span>
      </span>
      <!-- 查看差异按钮 -->
      <button
        v-if="canViewDiff"
        class="view-diff-btn"
        :disabled="isViewingDiff"
        @click.stop="handleViewDiff"
        title="在 VSCode 中查看差异"
      >
        <span v-if="isViewingDiff" class="codicon codicon-loading codicon-modifier-spin"></span>
        <span v-else class="codicon codicon-diff"></span>
      </button>
      <!-- 撤回按钮 -->
      <button
        v-if="canRevert"
        class="revert-btn"
        :disabled="isReverting"
        @click.stop="handleRevert"
        title="撤回此次写入"
      >
        <span v-if="isReverting" class="codicon codicon-loading codicon-modifier-spin"></span>
        <span v-else class="codicon codicon-discard"></span>
      </button>
      <span v-if="revertSuccess" class="revert-success">✅ 已撤回</span>
      <span v-if="revertError" class="revert-error" :title="revertError">❌ 撤回失败</span>
    </template>

    <template #expandable>
      <!-- 文件内容视图 -->
      <div v-if="content && !toolResult?.is_error" class="write-view">
        <!-- 文件标题栏 -->
        <div v-if="filePath" class="write-file-header">
          <FileIcon :file-name="filePath" :size="16" class="file-icon" />
          <span class="file-name">{{ fileName }}</span>
        </div>

        <!-- 内容显示 -->
        <div class="write-scroll-container">
          <!-- 左侧行号列 -->
          <div ref="lineNumbersRef" class="write-line-numbers">
            <div
              v-for="n in lineCount"
              :key="n"
              class="line-number-item"
            >
              {{ n }}
            </div>
          </div>

          <!-- 右侧内容列 -->
          <div ref="contentRef" class="write-content" @scroll="handleContentScroll">
            <pre class="content-text">{{ content }}</pre>
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
import { computed, ref, inject } from 'vue';
import path from 'path-browserify-esm';
import type { ToolContext } from '@/types/tool';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import ToolFilePath from './common/ToolFilePath.vue';
import FileIcon from '@/components/FileIcon.vue';
import { RuntimeKey } from '@/composables/runtimeContext';

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

// 查看差异状态
const isViewingDiff = ref(false);

// vcc-re 数据获取方式：只从 inputs 获取
const filePath = computed(() => {
  return props.toolUse?.input?.file_path || '';
});

const fileName = computed(() => {
  if (!filePath.value) return '';
  return path.basename(filePath.value);
});

// 从 inputs.content 获取文件内容
const content = computed(() => {
  return props.toolUse?.input?.content || '';
});

// 内容统计
const contentStats = computed(() => {
  if (!content.value) return null;

  const lines = content.value.split('\n').length;
  const chars = content.value.length;

  return { lines, chars };
});

// 行数
const lineCount = computed(() => {
  if (!content.value) return 0;
  return content.value.split('\n').length;
});

// 是否有内容视图
const hasContentView = computed(() => {
  return !!content.value && !props.toolResult?.is_error;
});

// 查找匹配当前工具的待处理权限请求
const pendingPermission = computed(() => {
  if (!props.context?.permissionRequests || !filePath.value) return null;

  // 查找 toolName 为 file_write 且 file_path 匹配的权限请求
  // 注意: 后端使用 file_write，前端组件名是 Write
  return props.context.permissionRequests.find(req =>
    (req.toolName === 'file_write' || req.toolName === 'Write') &&
    req.inputs?.file_path === filePath.value
  );
});

// 判断是否为权限请求阶段
const isPermissionRequest = computed(() => {
  // 没有 result 或 result 不是错误 = 权限请求或执行中
  return !props.toolResult || !props.toolResult.is_error;
});

// 权限请求阶段展开
const shouldExpand = computed(() => {
  return hasContentView.value && isPermissionRequest.value;
});

// DOM 引用
const lineNumbersRef = ref<HTMLElement>();
const contentRef = ref<HTMLElement>();

// 同步行号列和内容列的垂直滚动
function handleContentScroll() {
  if (lineNumbersRef.value && contentRef.value) {
    lineNumbersRef.value.scrollTop = contentRef.value.scrollTop;
  }
}

// 处理接受操作
function handleAccept() {
  console.log('[Write] handleAccept called, pendingPermission:', pendingPermission.value);
  if (pendingPermission.value) {
    console.log('[Write] 调用 accept, inputs:', pendingPermission.value.inputs);
    // 传递空数组，不记住权限，下次还会询问
    pendingPermission.value.accept(pendingPermission.value.inputs, []);
    console.log('[Write] accept 调用完成');
  } else {
    console.warn('[Write] pendingPermission 为空，无法接受');
  }
}

// 处理拒绝操作
function handleReject() {
  console.log('[Write] handleReject called, pendingPermission:', pendingPermission.value);
  if (pendingPermission.value) {
    console.log('[Write] 调用 reject');
    pendingPermission.value.reject('User rejected the file write operation', true);
    console.log('[Write] reject 调用完成');
  } else {
    console.warn('[Write] pendingPermission 为空，无法拒绝');
  }
}

// ============================================================================
// 撤回功能
// ============================================================================

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

// 是否可以查看差异（有快照就可以查看）
const canViewDiff = computed(() => {
  if (!props.toolResult) return false;
  if (props.toolResult.is_error) return false;
  return props.toolResult.canRevert === true;
});

// 处理查看差异
async function handleViewDiff() {
  if (!snapshotId.value || !runtime) return;

  isViewingDiff.value = true;
  try {
    const connection = await runtime.connectionManager.get();
    await connection.viewSnapshotDiff(snapshotId.value);
  } catch (error) {
    console.error('[Write.vue] viewSnapshotDiff 错误:', error);
  } finally {
    isViewingDiff.value = false;
  }
}

// 处理撤回操作
async function handleRevert() {
  console.log('[Write.vue] handleRevert called', {
    snapshotId: snapshotId.value,
    hasRuntime: !!runtime,
    toolResult: props.toolResult,
  });

  if (!snapshotId.value || !runtime) {
    console.warn('[Write.vue] handleRevert 缺少必要参数', {
      snapshotId: snapshotId.value,
      hasRuntime: !!runtime,
    });
    return;
  }

  isReverting.value = true;
  revertError.value = null;

  try {
    console.log('[Write.vue] 正在获取 connection...');
    const connection = await runtime.connectionManager.get();
    console.log('[Write.vue] 正在调用 revertFileChange...', snapshotId.value);
    const result = await connection.revertFileChange(snapshotId.value);
    console.log('[Write.vue] revertFileChange 结果:', result);

    if (result.success) {
      revertSuccess.value = true;
    } else {
      revertError.value = result.error || '撤回失败';
    }
  } catch (error) {
    console.error('[Write.vue] revertFileChange 错误:', error);
    revertError.value = String(error);
  } finally {
    isReverting.value = false;
  }
}
</script>

<style scoped>
/* 有内容视图时移除左侧边框和边距，error 保留默认样式 */
.has-content-view :deep(.expandable-content) {
  border-left: none;
  padding: 0;
  margin-left: 0;
}

.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.content-stats {
  display: flex;
  gap: 8px;
  margin-left: 8px;
  font-size: 0.8em;
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
}

/* 查看差异按钮样式 */
.view-diff-btn {
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

.view-diff-btn:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.view-diff-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.view-diff-btn .codicon {
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

.stat-lines,
.stat-chars {
  font-family: var(--vscode-editor-font-family);
}

.write-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  border: 0.5px solid var(--vscode-widget-border);
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  overflow: hidden;
}

.write-file-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  flex-shrink: 0;
}

.write-file-header :deep(.mdi),
.write-file-header :deep(.codicon) {
  flex-shrink: 0;
}

.write-file-header .file-name {
  color: var(--vscode-foreground);
  font-family: var(--vscode-editor-font-family);
}

.write-scroll-container {
  display: flex;
  max-height: 400px;
  background-color: var(--vscode-editor-background);
}

/* 左侧行号列 */
.write-line-numbers {
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
.write-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

/* Monaco 风格滚动条(仅应用于内容列) */
.write-content::-webkit-scrollbar {
  width: 14px;
  height: 14px;
}

.write-content::-webkit-scrollbar-track {
  background: transparent;
}

.write-content::-webkit-scrollbar-thumb {
  background-color: transparent;
  border-radius: 9px;
  border: 4px solid transparent;
  background-clip: content-box;
}

.write-content:hover::-webkit-scrollbar-thumb {
  background-color: color-mix(in srgb, var(--vscode-scrollbarSlider-background) 60%, transparent);
}

.write-content::-webkit-scrollbar-thumb:hover {
  background-color: var(--vscode-scrollbarSlider-hoverBackground);
}

.write-content::-webkit-scrollbar-thumb:active {
  background-color: var(--vscode-scrollbarSlider-activeBackground);
}

.write-content::-webkit-scrollbar-corner {
  background: transparent;
}

.content-text {
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  line-height: 22px;
  margin: 0;
  padding: 0 8px 0 4px;
  white-space: pre;
  min-width: 100%;
  width: fit-content;
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
