<template>
  <ToolMessageWrapper
    tool-icon="codicon-terminal"
    :tool-result="toolResult"
    :default-expanded="shouldExpand"
  >
    <template #main>
      <span class="tool-label">Bash</span>
      <span v-if="description" class="tool-description">{{ description }}</span>
      <span v-if="runInBackground" class="bg-badge">background</span>
      <span v-if="bashId" class="bash-id-badge">ID: {{ bashId }}</span>
      <span v-if="isRunning" class="status-badge running">
        <span class="codicon codicon-loading codicon-modifier-spin"></span>
        running
      </span>
      <span v-else-if="exitCode !== null" class="status-badge" :class="exitCode === 0 ? 'success' : 'error'">
        exit {{ exitCode }}
      </span>
    </template>

    <template #expandable>
      <!-- 命令内容 -->
      <div class="bash-command">
        <pre class="command-content">{{ command }}</pre>
      </div>

      <!-- 后台进程提示 -->
      <div v-if="bashId && !hasOutput" class="background-hint">
        <span class="codicon codicon-info"></span>
        后台进程已启动，使用 <code>bash_output(bash_id="{{ bashId }}")</code> 查看输出
      </div>

      <!-- 输出内容 (如果有) -->
      <div v-if="hasOutput" class="bash-output">
        <div class="output-header">Output</div>
        <pre class="output-content">{{ outputContent }}</pre>
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

// 从 toolResult 中提取 bash_id
const bashId = computed(() => {
  if (typeof props.toolResult?.content === 'string') {
    // 尝试从内容中解析 bash_id
    const match = props.toolResult.content.match(/bash_id[:\s"']+([a-zA-Z0-9_-]+)/);
    if (match) return match[1];
  }
  // 也可能直接在 result 对象中
  return props.toolResult?.bash_id || props.toolUseResult?.bash_id || '';
});

// 运行状态
const isRunning = computed(() => {
  // 后台进程且没有退出码
  return runInBackground.value && bashId.value && exitCode.value === null;
});

// 退出码
const exitCode = computed(() => {
  if (props.toolResult?.exitCode !== undefined) {
    return props.toolResult.exitCode;
  }
  if (props.toolUseResult?.exitCode !== undefined) {
    return props.toolUseResult.exitCode;
  }
  // 尝试从内容中解析
  if (typeof props.toolResult?.content === 'string') {
    const match = props.toolResult.content.match(/exit[:\s]+(\d+)/i);
    if (match) return parseInt(match[1], 10);
  }
  return null;
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

// 默认折叠，只有错误时才展开
const shouldExpand = computed(() => {
  return !!props.toolResult?.is_error;
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

.bash-id-badge {
  background-color: color-mix(in srgb, var(--vscode-charts-purple, #a855f7) 20%, transparent);
  color: var(--vscode-charts-purple, #a855f7);
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-family: var(--vscode-editor-font-family);
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.75em;
  font-weight: 500;
}

.status-badge.running {
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 20%, transparent);
  color: var(--vscode-charts-blue);
}

.status-badge.success {
  background-color: color-mix(in srgb, var(--vscode-charts-green, #22c55e) 20%, transparent);
  color: var(--vscode-charts-green, #22c55e);
}

.status-badge.error {
  background-color: color-mix(in srgb, var(--vscode-errorForeground) 20%, transparent);
  color: var(--vscode-errorForeground);
}

.background-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background-color: color-mix(in srgb, var(--vscode-charts-blue) 10%, transparent);
  border-radius: 4px;
  font-size: 0.85em;
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  margin-bottom: 8px;
}

.background-hint code {
  background-color: color-mix(in srgb, var(--vscode-editor-background) 50%, transparent);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  font-size: 0.9em;
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
