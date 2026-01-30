<template>
  <div v-if="errorContent" class="error-content">
    <span class="codicon codicon-error"></span>
    <span class="error-text">{{ errorContent }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatErrorContent } from '@/utils/formatUtils';

interface Props {
  toolResult?: any;
}

const props = defineProps<Props>();

const errorContent = computed(() => {
  if (!props.toolResult || !props.toolResult.is_error) {
    return null;
  }

  return formatErrorContent(props.toolResult.content);
});
</script>

<style scoped>
.error-content {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--vscode-errorForeground);
}

.error-content .codicon {
  color: var(--vscode-charts-red);
  flex-shrink: 0;
  font-size: 12px;
  line-height: inherit;
}

.error-text {
  word-break: break-word;
}
</style>
