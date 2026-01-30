<template>
  <ToolMessageWrapper
    tool-icon="codicon-terminal-bash"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">Terminal</span>
      <span v-if="description" class="tool-description">{{ description }}</span>
      <span v-if="runInBackground" class="bg-badge">background</span>
      <!-- 运行中状态 -->
      <span v-if="!hasResult" class="running-badge">
        <span class="running-dot"></span>
        运行中
      </span>
      <!-- 完成状态 -->
      <span v-else-if="hasResult && !toolResult?.is_error" class="status-badge success">
        <span class="codicon codicon-check"></span>
        {{ statusSummary }}
      </span>
      <!-- 错误状态 -->
      <span v-else-if="toolResult?.is_error" class="status-badge error">
        <span class="codicon codicon-error"></span>
        执行失败
      </span>
    </template>

    <template #expandable>
      <!-- 终端提示信息 -->
      <div v-if="!runInBackground && !hasResult" class="terminal-info">
        <span class="info-icon">ℹ️</span>
        命令正在 VSCode 终端中执行，请查看终端面板。可以使用 Ctrl+C 中断命令。
      </div>

      <!-- 命令内容 -->
      <div class="bash-command">
        <pre class="command-content">{{ command }}</pre>
      </div>

      <!-- 输出内容 (如果有) -->
      <div v-if="hasOutput" class="bash-output">
        <div class="output-header">Output</div>
        <pre class="output-content">{{ outputContent }}</pre>
      </div>

      <!-- 后台模式提示 -->
      <div v-if="runInBackground && hasResult && !toolResult?.is_error" class="bg-info">
        <span class="info-icon">🚀</span>
        命令已在后台启动。请查看终端面板查看执行情况。
      </div>

      <!-- 超时提示 -->
      <div v-if="timedOut" class="timeout-warning">
        <span class="warning-icon">⏱️</span>
        命令执行超时。请在终端面板中检查命令状态。
      </div>

      <!-- 错误内容 -->
      <ToolError :tool-result="toolResult" />
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import ToolError from './common/ToolError.vue';
import { unescapeString } from '@/utils/formatUtils';

interface Props {
  toolUse?: any;
  toolResult?: any;
  toolUseResult?: any;
}

const props = defineProps<Props>();

const command = computed(() => {
  const cmd = props.toolUse?.input?.command || '';
  return unescapeString(cmd);
});

const description = computed(() => {
  return props.toolUse?.input?.description || '';
});

const runInBackground = computed(() => {
  return props.toolUse?.input?.run_in_background || false;
});

const hasResult = computed(() => {
  return props.toolResult !== undefined;
});

const outputContent = computed(() => {
  // 从 toolResult.content 获取输出
  if (typeof props.toolResult?.content === 'string') {
    return unescapeString(props.toolResult.content);
  }
  return '';
});

const hasOutput = computed(() => {
  return outputContent.value && !props.toolResult?.is_error;
});

const timedOut = computed(() => {
  // 检查输出中是否包含超时信息
  return outputContent.value.includes('超时') || outputContent.value.includes('timed out');
});

// 从输出中解析退出码
const exitCode = computed(() => {
  const content = outputContent.value;
  const exitCodeMatch = content.match(/🔢\s*退出码:\s*(\d+)/);
  if (exitCodeMatch) {
    return parseInt(exitCodeMatch[1], 10);
  }
  return null;
});

// 从输出中解析耗时
const duration = computed(() => {
  const content = outputContent.value;
  const durationMatch = content.match(/⏱️\s*耗时:\s*([\d.]+s)/);
  if (durationMatch) {
    return durationMatch[1];
  }
  return null;
});

// 状态摘要信息（显示在折叠状态下）
const statusSummary = computed(() => {
  if (runInBackground.value) {
    return '已在后台启动';
  }
  if (timedOut.value) {
    return '执行超时';
  }
  // 构建简洁的摘要信息
  const parts: string[] = [];
  if (duration.value) {
    parts.push(duration.value);
  }
  if (exitCode.value !== null) {
    parts.push(`退出码: ${exitCode.value}`);
  }
  if (parts.length > 0) {
    return parts.join(' | ');
  }
  return '执行完成';
});

// 默认折叠，只有错误时才展开
const shouldExpand = computed(() => {
  return !!props.toolResult?.is_error || !hasResult.value;
});
</script>

<style scoped>
.tool-label {
  font-weight: 500;
  color: var(--vscode-foreground);
  font-size: 0.9em;
}

.tool-description {
  color: color-mix(in srgb, var(--vscode-foreground) 70%, transparent);
  font-size: 0.85em;
  font-style: italic;
}

.bg-badge {
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
  color: var(--vscode-charts-blue);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.running-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: color-mix(in srgb, var(--vscode-charts-green) 20%, transparent);
  color: var(--vscode-charts-green);
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.running-dot {
  width: 6px;
  height: 6px;
  background-color: var(--vscode-charts-green);
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.status-badge.success {
  background-color: color-mix(in srgb, var(--vscode-charts-green) 20%, transparent);
  color: var(--vscode-charts-green);
}

.status-badge.error {
  background-color: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
  color: var(--vscode-errorForeground);
}

.status-badge .codicon {
  font-size: 12px;
}

.terminal-info,
.bg-info {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 8px;
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-charts-blue) 30%, transparent);
  border-radius: 4px;
  font-size: 0.85em;
  color: color-mix(in srgb, var(--vscode-foreground) 90%, transparent);
}

.timeout-warning {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  margin-top: 8px;
  background-color: color-mix(in srgb, var(--vscode-charts-yellow) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--vscode-charts-yellow) 30%, transparent);
  border-radius: 4px;
  font-size: 0.85em;
  color: color-mix(in srgb, var(--vscode-foreground) 90%, transparent);
}

.info-icon,
.warning-icon {
  flex-shrink: 0;
}

.bash-command {
  margin-bottom: 8px;
}

.command-content {
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 80%,
    transparent
  );
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
}

.bash-output {
  margin-top: 8px;
}

.output-header {
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-size: 0.85em;
  margin-bottom: 4px;
  font-weight: 500;
}

.output-content {
  background-color: color-mix(
    in srgb,
    var(--vscode-terminal-background, var(--vscode-editor-background)) 90%,
    transparent
  );
  border: 1px solid var(--vscode-terminal-border, var(--vscode-panel-border));
  border-radius: 4px;
  padding: 8px 12px;
  color: var(--vscode-terminal-foreground, var(--vscode-editor-foreground));
  font-family: var(--vscode-editor-font-family);
  font-size: 0.85em;
  overflow-x: auto;
  margin: 0;
  white-space: pre-wrap;
  max-height: 400px;
  overflow-y: auto;
}
</style>
