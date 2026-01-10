<template>
  <div class="workspace-changed-block">
    <span class="codicon codicon-folder-opened"></span>
    <span class="workspace-message">
      工作区已切换: <span class="workspace-path">{{ displayPath }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { WorkspaceChangedBlock as WorkspaceChangedBlockType } from '../../../models/ContentBlock';

interface Props {
  block: WorkspaceChangedBlockType;
}

const props = defineProps<Props>();

// 显示路径：如果路径太长，只显示最后两级目录
const displayPath = computed(() => {
  const path = props.block.newCwd;
  const parts = path.split(/[/\\]/);
  if (parts.length > 2) {
    return '.../' + parts.slice(-2).join('/');
  }
  return path;
});
</script>

<style scoped>
/* 对齐 InterruptBlock 样式 */
.workspace-changed-block {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: transparent;
  transform: translateX(-10px);
  padding: 8px 0;
}

.workspace-changed-block .codicon {
  color: var(--vscode-charts-blue);
  flex-shrink: 0;
}

.workspace-message {
  color: color-mix(in srgb, var(--vscode-foreground) 80%, transparent);
  font-style: italic;
}

.workspace-path {
  color: var(--vscode-textLink-foreground);
  font-weight: 500;
}
</style>
