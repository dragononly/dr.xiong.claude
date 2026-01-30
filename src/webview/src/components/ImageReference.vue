<template>
  <div class="image-reference" @click="handleClick">
    <div class="icon-wrapper">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
      </svg>
    </div>
    <span class="label">图片</span>
  </div>
</template>

<script setup lang="ts">
interface Props {
  imageUrl?: string;
}

const props = defineProps<Props>();

function handleClick() {
  if (props.imageUrl) {
    // 可以点击打开原图预览
    // 这里可以集成图片预览功能
    console.log('打开图片预览:', props.imageUrl);
  }
}
</script>

<style scoped>
.image-reference {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  margin-right: 8px;
  background-color: var(--vscode-textBlockQuote-background);
  border: 1px solid var(--vscode-textBlockQuote-border);
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.image-reference:hover {
  background-color: var(--vscode-textBlockQuote-border);
}

.icon-wrapper {
  display: flex;
  align-items: center;
  color: var(--vscode-textLink-foreground);
}

.label {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  font-weight: 500;
}
</style>
