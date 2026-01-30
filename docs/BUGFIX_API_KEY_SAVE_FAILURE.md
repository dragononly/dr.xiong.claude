# API Key 保存失败问题诊断与修复

## 问题描述

用户报告有时候无法保存 API Key，导致无法使用扩展。错误日志：

```
[ERROR] ❌ 会话启动失败: Error: API Key 未配置，请在设置中配置 API Key
```

## 可能的原因

### 1. VSCode SecretStorage 权限问题

**症状：**
- 保存 API Key 时没有明显错误提示
- 刷新后配置丢失
- macOS/Windows 系统密钥链访问被拒绝

**根本原因：**
- `ClaudeConfigService.setApiKey()` 调用 `secretStorage.store()` 失败
- 错误被 catch 后 throw，但前端可能没有正确处理

### 2. WebView 消息通信失败

**症状：**
- 保存按钮一直显示"保存中..."
- F12 控制台没有错误日志
- Extension 日志中没有收到请求

**根本原因：**
- WebView 和 Extension 之间通信断开
- `ConnectionManager.get()` 返回的 connection 无效
- `postMessage()` 失败

### 3. 配置覆盖问题

**症状：**
- 保存成功，但下次打开 VSCode 时配置丢失
- 需要反复配置

**根本原因：**
- SecretStorage 在某些情况下会清空
- VSCode 更新导致密钥链重置

## 诊断步骤

### 第一步：检查 SecretStorage 是否可用

在 `ClaudeConfigService` 构造函数中添加诊断代码：

```typescript
constructor(secretStorage: vscode.SecretStorage) {
    this._secretStorage = secretStorage;
    
    // 诊断：测试 SecretStorage 是否可用
    this.testSecretStorage();
}

private async testSecretStorage(): Promise<void> {
    const TEST_KEY = 'xiong.test';
    const TEST_VALUE = 'test-value';
    
    try {
        // 1. 测试写入
        await this._secretStorage.store(TEST_KEY, TEST_VALUE);
        console.log('[ClaudeConfigService] ✓ SecretStorage 写入测试通过');
        
        // 2. 测试读取
        const readValue = await this._secretStorage.get(TEST_KEY);
        if (readValue === TEST_VALUE) {
            console.log('[ClaudeConfigService] ✓ SecretStorage 读取测试通过');
        } else {
            console.error('[ClaudeConfigService] ✗ SecretStorage 读取值不匹配');
        }
        
        // 3. 清理测试数据
        await this._secretStorage.delete(TEST_KEY);
        console.log('[ClaudeConfigService] ✓ SecretStorage 删除测试通过');
    } catch (error) {
        console.error('[ClaudeConfigService] ✗ SecretStorage 测试失败:', error);
        console.error('[ClaudeConfigService] 系统可能不支持 SecretStorage 或权限不足');
    }
}
```

### 第二步：增强错误处理

在 `setApiKey()` 方法中增强错误处理：

```typescript
async setApiKey(apiKey: string): Promise<void> {
    if (!apiKey || apiKey.trim() === '') {
        const error = 'API Key 不能为空';
        console.error('[ClaudeConfigService] ' + error);
        throw new Error(error);
    }

    try {
        console.log('[ClaudeConfigService] 开始保存 API Key...');
        await this._secretStorage.store(SECRET_API_KEY, apiKey);
        console.log('[ClaudeConfigService] ✓ API Key 已保存到 VSCode SecretStorage');
        
        // 验证保存是否成功
        const savedKey = await this._secretStorage.get(SECRET_API_KEY);
        if (savedKey === apiKey) {
            console.log('[ClaudeConfigService] ✓ 验证成功：API Key 已正确保存');
        } else {
            console.error('[ClaudeConfigService] ✗ 验证失败：保存的 API Key 不匹配');
            throw new Error('API Key 保存验证失败');
        }
    } catch (error) {
        console.error('[ClaudeConfigService] ✗ 保存 API Key 失败:', error);
        
        // 提供更详细的错误信息
        if (error instanceof Error) {
            throw new Error(`保存失败: ${error.message}`);
        }
        throw error;
    }
}
```

### 第三步：前端增强错误提示

在 `SettingsPage.vue` 的 `saveApiKey()` 方法中：

```typescript
async function saveApiKey() {
  // ... 现有验证代码 ...
  
  console.log('[Settings] 开始保存 API Key...');
  
  try {
    const connection = await runtime.connectionManager.get();
    console.log('[Settings] Connection 获取成功，调用 setApiKey...');

    // 添加超时保护（10秒）
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('请求超时（10秒），请检查网络或重试')), 10000);
    });

    const response = await Promise.race([
      connection.setApiKey(apiKeyInput.value.trim()),
      timeoutPromise
    ]) as { success: boolean; error?: string };
    
    console.log('[Settings] setApiKey 响应:', response);

    if (response.success) {
      // ... 现有成功处理逻辑 ...
    } else {
      console.error('[Settings] 保存失败:', response.error);
      
      // 提供更友好的错误提示
      let errorMsg = response.error || '保存失败';
      
      // 常见错误的友好提示
      if (errorMsg.includes('timeout') || errorMsg.includes('超时')) {
        errorMsg = '保存超时，可能是系统密钥链被锁定。请尝试：\n1. 解锁 macOS 钥匙串/Windows 凭据管理器\n2. 重启 VSCode\n3. 重新保存 API Key';
      } else if (errorMsg.includes('permission') || errorMsg.includes('权限')) {
        errorMsg = '系统拒绝访问密钥链。请检查 VSCode 是否有访问系统密钥链的权限。';
      }
      
      apiKeySaveStatus.value = { success: false, message: errorMsg };
    }
  } catch (error) {
    console.error('[Settings] 保存 API Key 异常:', error);
    
    const errorMsg = error instanceof Error 
      ? error.message 
      : '未知错误。请按 F12 查看控制台日志';
    
    apiKeySaveStatus.value = { 
      success: false, 
      message: `保存失败: ${errorMsg}\n\n如果问题持续存在，请尝试：\n1. 重启 VSCode\n2. 检查系统密钥链是否可访问\n3. 查看 Output 面板的扩展日志` 
    };
  } finally {
    saving.value = false;
    console.log('[Settings] 保存流程结束');
  }
}
```

### 第四步：添加备用存储方案（可选）

如果 SecretStorage 完全不可用，可以提供备用方案：

**选项 A：使用 VSCode 全局配置（不安全，仅用于调试）**

```typescript
async setApiKey(apiKey: string): Promise<void> {
    try {
        // 优先使用 SecretStorage
        await this._secretStorage.store(SECRET_API_KEY, apiKey);
    } catch (error) {
        console.warn('[ClaudeConfigService] SecretStorage 失败，回退到全局配置（不安全）');
        
        // 回退方案：存储到 VSCode 全局配置
        // 注意：这不是安全的做法，仅用于调试
        const config = vscode.workspace.getConfiguration('xiong');
        await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
        
        // 警告用户
        vscode.window.showWarningMessage(
            'API Key 已保存到全局配置（非加密存储）。建议修复 SecretStorage 问题。',
            '查看详情'
        ).then(selection => {
            if (selection === '查看详情') {
                vscode.env.openExternal(vscode.Uri.parse('https://github.com/Haleclipse/Claudix/issues'));
            }
        });
    }
}
```

**选项 B：引导用户手动解决**

创建一个诊断命令 `xiong.diagnoseApiKeyStorage`：

```typescript
vscode.commands.registerCommand('xiong.diagnoseApiKeyStorage', async () => {
    const logService = accessor.get(ILogService);
    const secretStorage = context.secrets;
    
    const results: string[] = [];
    
    // 测试 1：SecretStorage 可用性
    try {
        await secretStorage.store('test', 'value');
        const value = await secretStorage.get('test');
        if (value === 'value') {
            results.push('✓ SecretStorage 正常工作');
            await secretStorage.delete('test');
        } else {
            results.push('✗ SecretStorage 读取异常');
        }
    } catch (error) {
        results.push(`✗ SecretStorage 不可用: ${error}`);
    }
    
    // 测试 2：配置写入权限
    try {
        const config = vscode.workspace.getConfiguration('xiong');
        await config.update('test', 'value', vscode.ConfigurationTarget.Global);
        results.push('✓ VSCode 配置写入正常');
        await config.update('test', undefined, vscode.ConfigurationTarget.Global);
    } catch (error) {
        results.push(`✗ VSCode 配置写入失败: ${error}`);
    }
    
    // 显示结果
    const message = results.join('\n');
    await vscode.window.showInformationMessage(
        '诊断完成，请查看 Output 面板',
        '查看日志'
    );
    
    logService.info('[诊断结果]\n' + message);
});
```

## 立即修复方案

基于以上分析，建议按以下优先级修复：

### 优先级 1：增强错误处理和日志（必须）

修改文件：
- `src/services/claudeConfigService.ts`
- `src/webview/src/pages/SettingsPage.vue`

**目标：** 让用户能看到详细的错误信息，而不是静默失败。

### 优先级 2：添加诊断工具（推荐）

新增文件：
- `src/commands/diagnoseApiKeyStorage.ts`

在 `package.json` 中添加命令：
```json
{
  "contributes": {
    "commands": [
      {
        "command": "xiong.diagnoseApiKeyStorage",
        "title": "Dr. XIONG: 诊断 API Key 存储"
      }
    ]
  }
}
```

### 优先级 3：备用存储方案（可选）

仅在 SecretStorage 完全不可用时启用，需要用户明确同意。

## 测试计划

1. **正常流程测试**
   - 输入 API Key → 点击保存 → 验证成功
   - 重启 VSCode → 检查配置是否保留

2. **异常流程测试**
   - 模拟 SecretStorage 失败（如权限拒绝）
   - 验证错误提示是否清晰
   - 检查用户是否能根据提示解决问题

3. **回归测试**
   - 确保修改不影响其他功能
   - 测试 Base URL、模型选择等其他配置项

## 用户体验优化建议

1. **首次使用引导**
   - 检测到未配置时，显示配置向导
   - 提供常见问题的 FAQ 链接

2. **配置验证**
   - 保存后自动验证 API Key 是否有效
   - 显示账户余额作为反馈

3. **多设备同步**
   - 提供导出/导入配置的功能
   - 支持从多个来源读取配置（环境变量、配置文件等）

## 下一步行动

1. ✅ 读取相关代码，理解保存流程
2. ✅ 分析可能的问题原因
3. ⬜ 实现 `testSecretStorage()` 诊断方法
4. ⬜ 增强 `setApiKey()` 错误处理
5. ⬜ 改进前端错误提示
6. ⬜ 添加诊断命令
7. ⬜ 编写测试用例
8. ⬜ 更新文档

---

**创建时间：** 2025-01-19
**状态：** 待实施
