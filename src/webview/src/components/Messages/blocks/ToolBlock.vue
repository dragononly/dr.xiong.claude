<template>
  <component
    :is="toolComponent"
    :tool-use="toolUse"
    :tool-result="toolResult"
    :tool-use-result="toolUseResult"
    :context="context"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSignal } from '@gn8/alien-signals-vue';
import type { ToolUseContentBlock } from '../../../models/ContentBlock';
import type { ContentBlockWrapper } from '../../../models/ContentBlockWrapper';
import type { ToolContext } from '../../../types/tool';

// 导入所有工具组件
import ReadTool from './tools/Read.vue';
import WriteTool from './tools/Write.vue';
import EditTool from './tools/Edit.vue';
import BashTool from './tools/Bash.vue';
import BashTerminalTool from './tools/BashTerminal.vue';
import GlobTool from './tools/Glob.vue';
import GrepTool from './tools/Grep.vue';
import BashOutputTool from './tools/BashOutput.vue';
import ExitPlanModeTool from './tools/ExitPlanMode.vue';
import KillShellTool from './tools/KillShell.vue';
import McpTool from './tools/McpTool.vue';
import MultiEditTool from './tools/MultiEdit.vue';
import NotebookEditTool from './tools/NotebookEdit.vue';
import SlashCommandTool from './tools/SlashCommand.vue';
import SSHTool from './tools/SSH.vue';
import TaskTool from './tools/Task.vue';
import TodoWriteTool from './tools/TodoWrite.vue';
import DefaultTool from './tools/Default.vue';

interface Props {
  block: ToolUseContentBlock;
  context?: ToolContext;
  wrapper?: ContentBlockWrapper;
}

const props = defineProps<Props>();

// 🔥 使用 useSignal 包装 alien-signals，确保 Vue 可以追踪响应式变化
const toolResult = props.wrapper ? useSignal(props.wrapper.toolResult) : ref(undefined);

// 获取 tool use result（会话加载时的数据）
const toolUseResult = computed(() => {
  if (!props.wrapper) return undefined;
  return props.wrapper.toolUseResult;
});

// Tool 使用信息
const toolUse = computed(() => {
  return {
    name: props.block.name,
    input: props.block.input,
    id: props.block.id,
  };
});

// 根据工具名称选择对应的组件
const toolComponent = computed(() => {
  const name = props.block.name;

  // MCP 工具匹配（以 mcp__ 开头）
  if (name.startsWith('mcp__')) {
    return McpTool;
  }

  switch (name) {
    case 'Read':
    case 'file_read':
      return ReadTool;
    case 'Write':
    case 'file_write':
      return WriteTool;
    case 'Edit':
    case 'file_edit':
      return EditTool;
    case 'Bash':
    case 'bash_exec':
      return BashTool;
    case 'BashTerminal':
    case 'bash_terminal':
      return BashTerminalTool;
    case 'Glob':
    case 'glob_search':
      return GlobTool;
    case 'Grep':
    case 'grep_search':
      return GrepTool;
    case 'BashOutput':
    case 'bash_output':
      return BashOutputTool;
    case 'ExitPlanMode':
      return ExitPlanModeTool;
    case 'KillShell':
      return KillShellTool;
    case 'MultiEdit':
      return MultiEditTool;
    case 'NotebookEdit':
      return NotebookEditTool;
    case 'SlashCommand':
      return SlashCommandTool;
    case 'Task':
      return TaskTool;
    case 'TodoWrite':
      return TodoWriteTool;
    case 'SSHConnect':
    case 'SSHCommand':
    case 'SSHDisconnect':
      return SSHTool;
    default:
      return DefaultTool;
  }
});
</script>

<style scoped>
/* 工具块样式由各个具体工具组件自己管理 */
</style>
