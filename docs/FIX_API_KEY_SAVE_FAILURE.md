# API Key 保存失败问题 - 快速修复指南

## 问题描述

用户报告有时候无法保存 API Key，导致无法使用扩展。错误日志：

```
[ERROR] ❌ 会话启动失败: Error: API Key 未配置，请在设置中配置 API Key
```

## 已实施的修复

### 1. 后端增强（claudeConfigService.ts）

**新增功能：**
- ✅ **启动诊断测试**：构造函数中自动测试 SecretStorage 是否可用
- ✅ **保存验证**：保存后立即读取验证，检测静默失败
- ✅ **详细错误信息**：提供具体的错误原因和解决建议
- ✅ **友好错误提示**：针对常见错误（超时、权限拒绝）提供具体指导

**代码变更：**
```typescript
// 新增启动测试
constructor(secretStorage: vscode.SecretStorage) {
    this._secretStorage = secretStorage;
    this.testSecretStorage(); // 🔍 诊断
}

// 增强保存方法
async setApiKey(apiKey: string): Promise<void> {
    // 1. 输入验证
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('API Key 不能为空');
    }

    try {
        // 2. 保存
        await this._secretStorage.store(SECRET_API_KEY, trimmedKey);
        
        // 3. 验证（新增）
        const savedKey = await this._secretStorage.get(SECRET_API_KEY);
        if (savedKey !== trimmedKey) {
            throw new Error('API Key 保存验证失败');
        }
    } catch (error) {
        // 4. 友好错误提示
        throw new Error(`保存失败: ${this.formatError(error)}`);
    }
}
```

### 2. 前端增强（SettingsPage.vue）

**新增功能：**
- ✅ **超时保护**：15秒超时，避免无限等待
- ✅ **友好错误提示**：分类错误类型，提供解决建议
- ✅ **详细日志**：控制台输出完整调试信息

**代码变更：**
```typescript
async function saveApiKey() {
    try {
        // 超时保护
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('请求超时（15秒）')), 15000);
        });

        const response = await Promise.race([
            connection.setApiKey(apiKeyInput.value.trim()),
            timeoutPromise
        ]);

        if (response.success) {
            // 成功处理...
        } else {
            // 友好错误提示
            let errorMsg = formatError(response.error);
            apiKeySaveStatus.value = { success: false, message: errorMsg };
        }
    } catch (error) {
        // 详细错误信息
        apiKeySaveStatus.value = { 
            success: false, 
            message: `保存失败: ${error}\n\n建议：\n1. 重启 VSCode\n2. 检查系统密钥链\n3. 查看 Output 日志`
        };
    }
}
```

### 3. 诊断命令（diagnoseApiKeyStorage.ts）

**新增功能：**
- ✅ **SecretStorage 测试**：写入、读取、删除测试
- ✅ **API Key 检查**：验证配置是否存在
- ✅ **配置权限测试**：检查 VSCode 配置写入权限
- ✅ **系统信息**：平台、VSCode 版本等
- ✅ **诊断报告**：Output 面板显示完整报告

**使用方法：**
```
1. 打开命令面板 (Cmd/Ctrl + Shift + P)
2. 输入 "Dr. XIONG: 诊断 API Key 存储"
3. 查看 Output 面板的诊断报告
```

**诊断内容：**
```
╔════════════════════════════════════════╗
║     API Key 存储诊断报告                 ║
╚════════════════════════════════════════╝

📋 测试 1：SecretStorage 可用性
─────────────────────────────────────
  ✓ 写入测试通过
  ✓ 读取测试通过
  ✓ 删除测试通过

📋 测试 2：当前 API Key 配置
─────────────────────────────────────
  ✓ API Key 已配置 (长度: 52)

📋 测试 3：Base URL 配置
─────────────────────────────────────
  ✓ Base URL 已配置: http://...

💡 建议：
─────────────────────────────────────
• 所有测试通过！系统配置正常。
```

## 用户使用指南

### 如果遇到保存失败：

1. **查看错误提示**
   - 前端会显示具体的错误信息和解决建议
   - 按 F12 打开浏览器控制台查看详细日志

2. **运行诊断工具**
   ```
   Cmd/Ctrl + Shift + P → "Dr. XIONG: 诊断 API Key 存储"
   ```

3. **常见解决方案**
   
   **错误：保存超时**
   - 解锁 macOS 钥匙串 / Windows 凭据管理器
   - 重启 VSCode
   - 重新保存 API Key

   **错误：权限拒绝**
   - 检查 VSCode 是否有访问系统密钥链的权限
   - macOS: 系统设置 → 隐私与安全性 → 钥匙串访问
   - Windows: 凭据管理器 → 检查 VSCode 权限

4. **查看完整日志**
   - 打开 Output 面板（View → Output）
   - 选择 "Dr. XIONG" 频道
   - 查看详细错误信息

5. **报告问题**
   - 如果问题持续，请运行诊断工具
   - 复制诊断报告
   - 在 GitHub 提交 issue

## 技术细节

### SecretStorage 失败的常见原因

1. **系统密钥链被锁定**
   - macOS: 钥匙串需要解锁
   - Windows: 凭据管理器访问受限

2. **权限不足**
   - VSCode 没有访问系统密钥链的权限
   - SELinux/AppArmor 策略限制（Linux）

3. **密钥链损坏**
   - 系统密钥链文件损坏
   - 需要修复或重建密钥链

### 验证保存的重要性

**问题：** `secretStorage.store()` 可能静默失败，不抛出错误

**解决：** 保存后立即读取验证
```typescript
await secretStorage.store(key, value);
const saved = await secretStorage.get(key);
if (saved !== value) {
    throw new Error('保存验证失败');
}
```

### 超时保护的必要性

**问题：** SecretStorage 操作可能卡住（密钥链锁定时）

**解决：** Promise.race 实现超时控制
```typescript
const response = await Promise.race([
    connection.setApiKey(apiKey),
    timeout(15000) // 15秒超时
]);
```

## 测试清单

- [x] 正常保存流程：输入 API Key → 保存 → 验证成功
- [x] 空输入验证：输入空值 → 显示错误提示
- [x] 超时保护：模拟超时 → 显示超时错误
- [x] 诊断命令：运行诊断 → 显示完整报告
- [x] 错误恢复：修复密钥链 → 重新保存成功
- [x] 重启保留：保存后重启 VSCode → 配置保留

## 相关文件

- `src/services/claudeConfigService.ts` - 配置服务（增强）
- `src/webview/src/pages/SettingsPage.vue` - 设置页面（增强）
- `src/commands/diagnoseApiKeyStorage.ts` - 诊断命令（新增）
- `src/extension.ts` - 扩展入口（注册命令）
- `package.json` - 命令声明（添加）
- `docs/BUGFIX_API_KEY_SAVE_FAILURE.md` - 详细文档（新增）

## 后续改进

1. **备用存储方案**：如果 SecretStorage 完全不可用，提供文件存储（需要用户明确同意）
2. **配置导出/导入**：支持多设备同步
3. **健康检查**：定期验证配置完整性
4. **自动修复**：检测到问题时自动尝试修复

---

**创建时间：** 2025-01-19
**状态：** ✅ 已完成并测试
