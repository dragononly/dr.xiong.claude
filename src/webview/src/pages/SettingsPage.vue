<template>
  <div class="settings-page">
    <div class="settings-container">
      <div class="settings-header">
        <button class="back-btn" @click="$emit('backToChat')" title="返回">
          <span class="codicon codicon-arrow-left"></span>
        </button>
        <h2 class="settings-title">设置</h2>
      </div>

      <!-- API Key 设置 -->
      <section class="settings-section">
        <h3 class="section-title">API 密钥</h3>
        <div class="api-key-row">
          <div class="input-wrapper">
            <input
              v-model="apiKeyInput"
              :type="showApiKey ? 'text' : 'password'"
              :placeholder="currentApiKey || '请输入 API Key'"
              class="api-key-input"
            />
            <button @click="showApiKey = !showApiKey" class="toggle-btn" title="切换显示">
              <span v-if="showApiKey">隐藏</span>
              <span v-else>显示</span>
            </button>
          </div>
          <button @click="saveApiKey" class="save-btn" :disabled="saving">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
        <p v-if="apiKeySaveStatus" class="status-message" :class="apiKeySaveStatus.success ? 'success' : 'error'">
          {{ apiKeySaveStatus.message }}
        </p>
        <p v-if="currentApiKey" class="current-key-hint">
          当前密钥: {{ currentApiKey }}
        </p>
      </section>

      <!-- Base URL 设置 -->
      <section class="settings-section">
        <h3 class="section-title">API 地址</h3>
        <div class="api-key-row">
          <div class="input-wrapper">
            <input
              v-model="baseUrlInput"
              type="text"
              :placeholder="currentBaseUrl || DEFAULT_BASE_URL"
              class="api-key-input"
            />
          </div>
          <button @click="saveBaseUrl" class="save-btn" :disabled="savingBaseUrl">
            {{ savingBaseUrl ? '保存中...' : '保存' }}
          </button>
        </div>
        <p v-if="baseUrlSaveStatus" class="status-message" :class="baseUrlSaveStatus.success ? 'success' : 'error'">
          {{ baseUrlSaveStatus.message }}
        </p>
        <p class="current-key-hint">
          当前地址: {{ currentBaseUrl || DEFAULT_BASE_URL }}
        </p>
      </section>

      <!-- 账户余额 -->
      <section class="settings-section">
        <h3 class="section-title">账户余额</h3>
        <button @click="fetchBalance" class="refresh-btn" :disabled="loadingBalance">
          {{ loadingBalance ? '加载中...' : '刷新' }}
        </button>

        <div v-if="balance !== null" class="info-card">
          <div class="info-row highlight balance-row">
            <span class="info-label">剩余额度:</span>
            <span class="info-value balance-value">${{ balance.toFixed(2) }}</span>
          </div>
        </div>
        <p v-else-if="balanceError" class="status-message error">{{ balanceError }}</p>
        <p v-else class="hint-text">点击"刷新"查看余额</p>
      </section>

      <!-- 使用量查询 -->
      <section class="settings-section">
        <h3 class="section-title">使用量查询</h3>
        <div class="date-range-row">
          <div class="date-input-group">
            <label>开始日期:</label>
            <input v-model="startDate" type="date" class="date-input" />
          </div>
          <div class="date-input-group">
            <label>结束日期:</label>
            <input v-model="endDate" type="date" class="date-input" />
          </div>
          <button @click="fetchUsage" class="refresh-btn" :disabled="loadingUsage">
            {{ loadingUsage ? '查询中...' : '查询' }}
          </button>
        </div>

        <div v-if="usage" class="info-card">
          <div class="info-row highlight">
            <span class="info-label">总使用量:</span>
            <span class="info-value">${{ (usage.totalUsage / 100).toFixed(2) }}</span>
          </div>
        </div>
        <p v-else-if="usageError" class="status-message error">{{ usageError }}</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';

const runtime = inject(RuntimeKey);

// 默认 Base URL
const DEFAULT_BASE_URL = 'http://serve2.moono.vip:3011';

// API Key
const apiKeyInput = ref('');
const currentApiKey = ref<string | null>(null);
const showApiKey = ref(false);
const saving = ref(false);
const apiKeySaveStatus = ref<{ success: boolean; message: string } | null>(null);

// Base URL
const baseUrlInput = ref('');
const currentBaseUrl = ref<string | null>(null);
const savingBaseUrl = ref(false);
const baseUrlSaveStatus = ref<{ success: boolean; message: string } | null>(null);

// 账户余额
const balance = ref<number | null>(null);
const balanceError = ref<string | null>(null);
const loadingBalance = ref(false);

// 使用量
const today = new Date().toISOString().slice(0, 10);
const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
const startDate = ref(firstDayOfMonth);
const endDate = ref(today);
const usage = ref<{
  totalUsage: number;
  dailyUsage: Array<{ date: string; usage: number }>;
} | null>(null);
const usageError = ref<string | null>(null);
const loadingUsage = ref(false);

onMounted(async () => {
  // 获取当前 API Key（脱敏）和 Base URL
  if (!runtime) return;
  try {
    const connection = await runtime.connectionManager.get();
    const response = await connection.getClaudeConfig();
    if (response.config) {
      currentApiKey.value = response.config.apiKey;
      currentBaseUrl.value = response.config.baseUrl;
    }
  } catch (error) {
    console.error('Failed to get Claude config:', error);
  }
});

async function saveApiKey() {
  if (!apiKeyInput.value.trim()) {
    apiKeySaveStatus.value = { success: false, message: '请输入 API Key' };
    return;
  }
  if (!runtime) return;

  saving.value = true;
  apiKeySaveStatus.value = null;

  try {
    const connection = await runtime.connectionManager.get();
    const response = await connection.setApiKey(apiKeyInput.value.trim());

    if (response.success) {
      apiKeySaveStatus.value = { success: true, message: 'API Key 保存成功，重启会话后生效' };
      apiKeyInput.value = '';
      // 刷新显示
      const configResponse = await connection.getClaudeConfig();
      if (configResponse.config) {
        currentApiKey.value = configResponse.config.apiKey;
      }
    } else {
      apiKeySaveStatus.value = { success: false, message: response.error || '保存失败' };
    }
  } catch (error) {
    apiKeySaveStatus.value = { success: false, message: String(error) };
  } finally {
    saving.value = false;
  }
}

async function saveBaseUrl() {
  if (!runtime) return;

  savingBaseUrl.value = true;
  baseUrlSaveStatus.value = null;

  try {
    const connection = await runtime.connectionManager.get();
    // 如果输入为空，使用默认值
    const urlToSave = baseUrlInput.value.trim() || DEFAULT_BASE_URL;
    const response = await connection.setBaseUrl(urlToSave);

    if (response.success) {
      baseUrlSaveStatus.value = { success: true, message: 'API 地址保存成功，重启会话后生效' };
      baseUrlInput.value = '';
      // 刷新显示
      const configResponse = await connection.getClaudeConfig();
      if (configResponse.config) {
        currentBaseUrl.value = configResponse.config.baseUrl;
      }
    } else {
      baseUrlSaveStatus.value = { success: false, message: response.error || '保存失败' };
    }
  } catch (error) {
    baseUrlSaveStatus.value = { success: false, message: String(error) };
  } finally {
    savingBaseUrl.value = false;
  }
}

async function fetchBalance() {
  if (!runtime) return;
  balanceError.value = null;
  loadingBalance.value = true;

  try {
    const connection = await runtime.connectionManager.get();

    // 同时获取订阅信息和当月使用量
    const [subResponse, usageResponse] = await Promise.all([
      connection.getSubscription(),
      connection.getUsage(firstDayOfMonth, today)
    ]);

    if (subResponse.subscription) {
      const hardLimit = subResponse.subscription.hardLimit;
      // 使用量是以 cents 为单位，需要除以 100 转换为美元
      const usedAmount = usageResponse.usage ? usageResponse.usage.totalUsage / 100 : 0;
      // 剩余额度 = 限额 - 已使用
      balance.value = hardLimit - usedAmount;
    } else {
      balanceError.value = subResponse.error || '获取余额失败，请检查 API Key 是否正确';
    }
  } catch (error) {
    balanceError.value = String(error);
  } finally {
    loadingBalance.value = false;
  }
}

async function fetchUsage() {
  if (!runtime) return;
  usageError.value = null;
  loadingUsage.value = true;

  try {
    const connection = await runtime.connectionManager.get();
    const response = await connection.getUsage(startDate.value, endDate.value);

    if (response.usage) {
      usage.value = response.usage;
    } else {
      usageError.value = response.error || '获取使用量失败';
    }
  } catch (error) {
    usageError.value = String(error);
  } finally {
    loadingUsage.value = false;
  }
}
</script>

<style scoped>
.settings-page {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
}

.settings-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 20px;
}

.settings-title {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: var(--vscode-editor-foreground);
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  color: var(--vscode-foreground);
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.15s, background-color 0.15s;
}

.back-btn:hover {
  opacity: 1;
  background: var(--vscode-toolbar-hoverBackground, rgba(255, 255, 255, 0.1));
}

.back-btn .codicon {
  font-size: 16px;
}

.settings-section {
  margin-bottom: 32px;
  padding: 16px;
  background: var(--vscode-input-background);
  border-radius: 8px;
  border: 1px solid var(--vscode-input-border, transparent);
}

.section-title {
  font-size: 1rem;
  font-weight: 500;
  margin-bottom: 12px;
  color: var(--vscode-editor-foreground);
}

.api-key-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.input-wrapper {
  flex: 1;
  display: flex;
  gap: 4px;
}

.api-key-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 14px;
}

.api-key-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.toggle-btn {
  padding: 8px 12px;
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  font-size: 12px;
}

.toggle-btn:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.save-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  cursor: pointer;
  font-size: 14px;
}

.save-btn:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.refresh-btn {
  padding: 6px 12px;
  border: 1px solid var(--vscode-button-border, transparent);
  border-radius: 4px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  cursor: pointer;
  font-size: 13px;
  margin-bottom: 12px;
}

.refresh-btn:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.refresh-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.status-message {
  margin-top: 8px;
  font-size: 13px;
}

.status-message.success {
  color: var(--vscode-testing-iconPassed, #4caf50);
}

.status-message.error {
  color: var(--vscode-testing-iconFailed, #f44336);
}

.current-key-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.hint-text {
  font-size: 13px;
  color: var(--vscode-descriptionForeground);
}

.info-card {
  padding: 12px;
  background: var(--vscode-editor-background);
  border-radius: 6px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
}

.info-row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--vscode-input-border, #3c3c3c);
}

.info-row:last-child {
  border-bottom: none;
}

.info-row.highlight {
  font-weight: 600;
}

.balance-row {
  padding: 12px 0;
}

.balance-value {
  font-size: 1.5rem;
  color: var(--vscode-testing-iconPassed, #4caf50);
}

.info-label {
  color: var(--vscode-descriptionForeground);
}

.info-value {
  color: var(--vscode-editor-foreground);
}

.date-range-row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.date-input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.date-input-group label {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.date-input {
  padding: 6px 10px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 13px;
}

.date-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}
</style>
