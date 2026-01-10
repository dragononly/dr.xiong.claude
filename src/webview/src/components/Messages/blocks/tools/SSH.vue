<template>
  <ToolMessageWrapper
    :tool-name="toolName"
    :status="status"
    :is-expanded="isExpanded"
    @toggle="isExpanded = !isExpanded"
  >
    <template #title>
      <span class="ssh-title">
        <span class="codicon codicon-remote"></span>
        {{ displayTitle }}
      </span>
    </template>

    <template #content>
      <div class="ssh-content">
        <!-- 连接信息 -->
        <div v-if="connectionInfo" class="connection-info">
          <span class="label">连接:</span>
          <span class="value">{{ connectionInfo }}</span>
        </div>

        <!-- 命令 -->
        <div v-if="command" class="command-section">
          <span class="label">命令:</span>
          <code class="command">{{ command }}</code>
        </div>

        <!-- 输出 -->
        <div v-if="output && isExpanded" class="output-section">
          <span class="label">输出:</span>
          <pre class="output">{{ output }}</pre>
        </div>

        <!-- 错误 -->
        <div v-if="error" class="error-section">
          <span class="codicon codicon-error"></span>
          <span class="error-message">{{ error }}</span>
        </div>
      </div>
    </template>
  </ToolMessageWrapper>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { ToolUseContentBlock } from '../../../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../../../models/ContentBlockWrapper';
import ToolMessageWrapper from './common/ToolMessageWrapper.vue';
import { useSignal } from '@gn8/alien-signals-vue';

interface Props {
  block: ToolUseContentBlock;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

const isExpanded = ref(false);

// 工具名称
const toolName = computed(() => {
  const name = props.block.name;
  if (name === 'SSHConnect') return 'SSH 连接';
  if (name === 'SSHCommand') return 'SSH 命令';
  if (name === 'SSHDisconnect') return 'SSH 断开';
  return 'SSH';
});

// 连接信息
const connectionInfo = computed(() => {
  const input = props.block.input || {};
  if (input.host) {
    const user = input.username || '';
    const port = input.port && input.port !== 22 ? `:${input.port}` : '';
    return user ? `${user}@${input.host}${port}` : `${input.host}${port}`;
  }
  if (input.sessionId) {
    return `会话: ${input.sessionId}`;
  }
  return null;
});

// 命令
const command = computed(() => {
  const input = props.block.input || {};
  return input.command || null;
});

// 获取 tool_result
const toolResultSignal = computed(() => props.wrapper?.toolResult);
const toolResult = toolResultSignal.value ? useSignal(toolResultSignal.value) : ref(undefined);

// 输出
const output = computed(() => {
  const result = toolResult.value;
  if (!result) return null;

  const content = result.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  return null;
});

// 错误
const error = computed(() => {
  const result = toolResult.value;
  if (result?.is_error) {
    const content = result.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }
  }
  return null;
});

// 状态
const status = computed(() => {
  if (error.value) return 'error';
  if (toolResult.value) return 'success';
  return 'pending';
});

// 显示标题
const displayTitle = computed(() => {
  if (props.block.name === 'SSHConnect') {
    return connectionInfo.value ? `连接到 ${connectionInfo.value}` : '建立 SSH 连接';
  }
  if (props.block.name === 'SSHCommand') {
    return command.value ? `执行: ${command.value.substring(0, 50)}${command.value.length > 50 ? '...' : ''}` : '执行命令';
  }
  if (props.block.name === 'SSHDisconnect') {
    return '断开连接';
  }
  return 'SSH 操作';
});
</script>

<style scoped>
.ssh-title {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ssh-title .codicon {
  color: var(--vscode-terminal-ansiGreen);
}

.ssh-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.connection-info,
.command-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  color: var(--vscode-descriptionForeground);
  flex-shrink: 0;
}

.value {
  color: var(--vscode-terminal-ansiCyan);
  font-family: var(--vscode-editor-font-family);
}

.command {
  background: var(--vscode-textCodeBlock-background);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: var(--vscode-editor-font-family);
  color: var(--vscode-terminal-ansiYellow);
}

.output-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.output {
  background: var(--vscode-terminal-background);
  color: var(--vscode-terminal-foreground);
  padding: 8px;
  border-radius: 4px;
  font-family: var(--vscode-editor-font-family);
  font-size: 11px;
  line-height: 1.4;
  max-height: 300px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
  margin: 0;
}

.error-section {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--vscode-errorForeground);
}

.error-section .codicon {
  flex-shrink: 0;
  margin-top: 2px;
}

.error-message {
  font-family: var(--vscode-editor-font-family);
}
</style>
