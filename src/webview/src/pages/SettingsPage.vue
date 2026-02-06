<template>
  <div class="settings-page">
    <div class="settings-container">
      <div class="settings-header">
        <button class="back-btn" @click="$emit('backToChat')" title="返回">
          <span class="codicon codicon-arrow-left"></span>
        </button>
        <h2 class="settings-title">设置</h2>
      </div>

      <!-- API 设置 -->
      <section class="settings-section">
        <h3 class="section-title">API 设置</h3>

        <!-- API Key -->
        <div class="setting-row">
          <label class="setting-label">API 密钥</label>
          <div class="input-wrapper">
            <input
              v-model="apiKeyInput"
              :type="showApiKey ? 'text' : 'password'"
              :placeholder="currentApiKey || '请输入 API Key'"
              class="setting-input"
            />
            <button @click="showApiKey = !showApiKey" class="toggle-btn" title="切换显示">
              <span v-if="showApiKey">隐藏</span>
              <span v-else>显示</span>
            </button>
          </div>
        </div>
        <p v-if="currentApiKey" class="current-value-hint">
          当前密钥: {{ currentApiKey }}
        </p>

        <!-- Base URL -->
        <div class="setting-row">
          <label class="setting-label">API 地址</label>
          <div class="input-wrapper">
            <input
              v-model="baseUrlInput"
              type="text"
              placeholder="请输入 API 地址"
              class="setting-input"
            />
          </div>
        </div>
        <p class="current-value-hint">
          默认地址: {{ DEFAULT_BASE_URL }}
        </p>

        <!-- 保存按钮 -->
        <div class="save-section">
          <button @click="saveAllSettings" class="save-btn" :disabled="saving">
            {{ saving ? '保存中...' : '保存设置' }}
          </button>
        </div>

        <p v-if="saveStatus" class="status-message" :class="saveStatus.success ? 'success' : 'error'">
          {{ saveStatus.message }}
        </p>
      </section>

      <!-- 环境检测 -->
      <section class="settings-section">
        <h3 class="section-title">环境检测</h3>
        <button @click="refreshEnvironment" class="refresh-btn" :disabled="loadingEnvironment">
          {{ loadingEnvironment ? '检测中...' : '重新检测' }}
        </button>

        <div v-if="environmentCheck" class="info-card">
          <div class="info-row">
            <span class="info-label">Claude CLI:</span>
            <span class="info-value">
              {{ environmentCheck.claudeCode.installed ? '已检测到' : '未检测到' }}
              <span v-if="environmentCheck.claudeCode.version">（{{ environmentCheck.claudeCode.version }}）</span>
            </span>
          </div>
          <div v-if="environmentCheck.claudeCode.path" class="info-row">
            <span class="info-label">CLI 路径:</span>
            <span class="info-value">{{ environmentCheck.claudeCode.path }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Git:</span>
            <span class="info-value">
              {{ environmentCheck.git.installed ? '已检测到' : '未检测到' }}
              <span v-if="environmentCheck.git.version">（{{ environmentCheck.git.version }}）</span>
            </span>
          </div>
        </div>
        <p v-else class="hint-text">点击“重新检测”查看环境信息</p>
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

      <!-- 帮助信息 -->
      <section class="settings-section help-section">
        <h3 class="section-title">💡 联系作者</h3>
        <div class="help-content">
          <p><strong>QQ：494588788</strong></p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, inject } from 'vue';
import { RuntimeKey } from '../composables/runtimeContext';

const runtime = inject(RuntimeKey);

// 默认 Base URL
const DEFAULT_BASE_URL = 'https://aiapi3.moono.vip';

// API Key
const apiKeyInput = ref('');
const currentApiKey = ref<string | null>(null);
const showApiKey = ref(true); // 默认显示

// Base URL
const baseUrlInput = ref('');
const currentBaseUrl = ref<string | null>(null);

// 保存状态
const saving = ref(false);
const saveStatus = ref<{ success: boolean; message: string } | null>(null);

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

// 环境检测
const environmentCheck = ref<{
  claudeCode: { installed: boolean; version?: string; path?: string };
  git: { installed: boolean; version?: string };
  allReady: boolean;
} | null>(null);
const loadingEnvironment = ref(false);

async function refreshEnvironment() {
  if (!runtime) return;
  loadingEnvironment.value = true;
  try {
    const connection = await runtime.connectionManager.get();
    environmentCheck.value = await connection.checkEnvironment();
  } catch (error) {
    console.error('[SettingsPage] 环境检测失败:', error);
    environmentCheck.value = null;
  } finally {
    loadingEnvironment.value = false;
  }
}

onMounted(async () => {
  // 获取当前 API Key 和 Base URL（优先从 VSCode 配置 xiong.apiKey/xiong.baseUrl 读取）
  console.log('[SettingsPage] onMounted 开始获取配置');
  if (!runtime) {
    console.error('[SettingsPage] runtime 不存在');
    return;
  }
  try {
    const connection = await runtime.connectionManager.get();
    console.log('[SettingsPage] 获取 connection 成功，调用 getClaudeConfig...');
    const response = await connection.getClaudeConfig();
    console.log('[SettingsPage] getClaudeConfig 响应:', JSON.stringify(response, null, 2));
    if (response.config) {
      currentApiKey.value = response.config.apiKey;
      currentBaseUrl.value = response.config.baseUrl;

      // 自动填充输入框（从 VSCode 配置 xiong.apiKey / xiong.baseUrl 读取）
      // API Key: 如果有值，自动填充到输入框
      apiKeyInput.value = response.config.apiKey || '';
      // Base URL: 优先使用当前配置值，否则使用默认值
      baseUrlInput.value = response.config.baseUrl || DEFAULT_BASE_URL;
      // CLI Path: 如果有值，自动填充到输入框
      
      console.log('[SettingsPage] 已填充: apiKeyInput=', apiKeyInput.value ? '有值' : '空', ', baseUrlInput=', baseUrlInput.value);
    }
  } catch (error) {
    console.error('[SettingsPage] Failed to get Claude config:', error);
  }

  await refreshEnvironment();
});

async function saveAllSettings() {
  if (!runtime) return;

  // 验证：至少需要填写一项
  const hasApiKey = apiKeyInput.value.trim();
  const hasBaseUrl = baseUrlInput.value.trim();
  if (!hasApiKey && !hasBaseUrl) {
    saveStatus.value = { success: false, message: '请至少填写一项设置' };
    return;
  }

  saving.value = true;
  saveStatus.value = null;

  console.log('[Settings] 开始保存设置...');

  try {
    const connection = await runtime.connectionManager.get();

    // 0. 检查环境（Claude Code CLI 和 Git）
    console.log('[Settings] 检查环境...');
    saveStatus.value = { success: true, message: '正在检查环境...' };

    const envCheck = await connection.checkEnvironment();

    if (!envCheck.claudeCode.installed) {
      console.warn('[Settings] 未检测到 Claude Code CLI，将继续保存设置');
      saveStatus.value = {
        success: true,
        message: '⚠ 未检测到 Claude Code CLI，仍将保存设置（可选安装）。'
      };
    }

    if (!envCheck.git.installed) {
      console.warn('[Settings] 未检测到 Git，将继续保存设置');
      saveStatus.value = {
        success: true,
        message: '⚠ 未检测到 Git，仍将保存设置（部分功能可能受限）。'
      };
    }

    console.log(`[Settings] 环境检查通过: Claude=${envCheck.claudeCode.version}, Git=${envCheck.git.version}`);

    // 1. 保存 API Key（如果填写了）
    if (hasApiKey) {
      console.log('[Settings] 保存 API Key...');
      saveStatus.value = { success: true, message: '正在保存 API Key...' };

      const timeoutPromise = new Promise<{ success: boolean; error?: string }>((_, reject) => {
        setTimeout(() => reject(new Error('请求超时（15秒），请重试')), 15000);
      });

      const keyResponse = await Promise.race([
        connection.setApiKey(apiKeyInput.value.trim()),
        timeoutPromise
      ]) as { success: boolean; error?: string };

      if (!keyResponse.success) {
        throw new Error(keyResponse.error || 'API Key 保存失败');
      }

      console.log('[Settings] API Key 保存成功');
    }

    // 2. 保存 Base URL（如果填写了）
    if (hasBaseUrl) {
      console.log('[Settings] 保存 Base URL...');
      saveStatus.value = { success: true, message: '正在保存 API 地址...' };

      // 清理 URL：去除首尾空格，去除尾部的斜杠
      let urlToSave = baseUrlInput.value.trim();
      urlToSave = urlToSave.replace(/\/+$/, ''); // 去除尾部斜杠

      const urlResponse = await connection.setBaseUrl(urlToSave);

      if (!urlResponse.success) {
        throw new Error(urlResponse.error || 'Base URL 保存失败');
      }

      console.log('[Settings] Base URL 保存成功');
    }

    // 3. 刷新显示
    const configResponse = await connection.getClaudeConfig();
    if (configResponse.config) {
      currentApiKey.value = configResponse.config.apiKey;
      currentBaseUrl.value = configResponse.config.baseUrl;
    }

    // 清空输入框
    apiKeyInput.value = '';
    baseUrlInput.value = currentBaseUrl.value || DEFAULT_BASE_URL;

    // 自动重启当前会话，让新配置立即生效
    const activeSession = runtime.sessionStore.activeSession();
    if (activeSession) {
      console.log('[Settings] 发现活跃会话，尝试重启...');
      saveStatus.value = { success: true, message: '✓ 设置保存成功，正在重启会话...' };
      try {
        await activeSession.restartClaude();
        console.log('[Settings] 会话重启成功');
        saveStatus.value = { success: true, message: '✓ 设置保存成功，会话已重启！现在可以开始聊天了。' };
      } catch (restartError) {
        console.error('[Settings] 重启会话失败:', restartError);
        saveStatus.value = { success: true, message: '✓ 设置保存成功！请新建会话开始聊天。' };
      }
    } else {
      console.log('[Settings] 没有活跃会话');
      saveStatus.value = { success: true, message: '✓ 设置保存成功！请新建会话开始聊天。' };
    }

    await refreshEnvironment();
  } catch (error) {
    console.error('[Settings] 保存设置异常:', error);

    const errorMsg = error instanceof Error
      ? error.message
      : '未知错误。请按 F12 查看控制台日志';

    saveStatus.value = {
      success: false,
      message: errorMsg
    };
  } finally {
    saving.value = false;
    console.log('[Settings] 保存流程结束');
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
  border: 1px solid transparent;
  /* 毛玻璃效果 */
  background: color-mix(in srgb, var(--vscode-foreground) 8%, transparent);
  color: var(--vscode-foreground);
  border-radius: 8px;
  cursor: pointer;
  opacity: 0.8;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.back-btn:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--vscode-foreground) 15%, transparent);
  border-color: color-mix(in srgb, var(--vscode-foreground) 12%, transparent);
  transform: translateX(-2px);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--vscode-widget-shadow) 20%, transparent);
}

.back-btn .codicon {
  font-size: 16px;
}

.settings-section {
  margin-bottom: 32px;
  padding: 16px;
  /* 毛玻璃效果 */
  background: color-mix(in srgb, var(--vscode-input-background) 80%, transparent);
  backdrop-filter: blur(12px) saturate(150%);
  -webkit-backdrop-filter: blur(12px) saturate(150%);
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--vscode-foreground) 10%, transparent);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--vscode-widget-shadow) 15%, transparent);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-section:hover {
  border-color: color-mix(in srgb, var(--vscode-foreground) 15%, transparent);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--vscode-widget-shadow) 20%, transparent);
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

.setting-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.setting-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--vscode-foreground);
}

.input-wrapper {
  display: flex;
  gap: 4px;
}

.api-key-input,
.setting-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--vscode-input-border, #3c3c3c);
  border-radius: 4px;
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  font-size: 14px;
}

.api-key-input:focus,
.setting-input:focus {
  outline: none;
  border-color: var(--vscode-focusBorder);
}

.save-section {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--vscode-input-border, #3c3c3c);
  display: flex;
  justify-content: flex-end;
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
  border: 1px solid transparent;
  border-radius: 8px;
  /* 毛玻璃渐变效果 */
  background: linear-gradient(
    135deg,
    var(--vscode-button-background),
    color-mix(in srgb, var(--vscode-button-background) 80%, #667eea)
  );
  color: var(--vscode-button-foreground);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--vscode-button-background) 30%, transparent);
}

.save-btn:hover:not(:disabled) {
  background: linear-gradient(
    135deg,
    var(--vscode-button-hoverBackground),
    color-mix(in srgb, var(--vscode-button-hoverBackground) 80%, #667eea)
  );
  transform: translateY(-1px);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--vscode-button-background) 40%, transparent);
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

.current-value-hint {
  margin-top: 4px;
  margin-bottom: 8px;
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

.help-section {
  background: color-mix(in srgb, var(--vscode-textBlockQuote-background) 50%, transparent);
}

.help-content {
  font-size: 13px;
  line-height: 1.6;
}

.help-content p {
  margin: 8px 0;
  font-weight: 600;
}

.help-content ul,
.help-content ol {
  margin: 8px 0;
  padding-left: 20px;
}

.help-content li {
  margin: 4px 0;
  color: var(--vscode-editor-foreground);
}

.help-content a {
  color: var(--vscode-textLink-foreground);
  text-decoration: underline;
}

.help-content a:hover {
  color: var(--vscode-textLink-activeForeground);
}
</style>
