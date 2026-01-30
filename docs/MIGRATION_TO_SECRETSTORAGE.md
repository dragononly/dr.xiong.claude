# 迁移到 VSCode SecretStorage

## 概述

从 v0.8.2 开始，Dr-XIONG Claude 扩展已移除对 `~/.claude/settings.json` 的依赖，改用 VSCode 原生的 **SecretStorage API** 来安全存储 API Key。

## 变更内容

### 移除的功能

- ❌ 读取 `~/.claude/settings.json` 配置文件
- ❌ 写入 `~/.claude/settings.json` 配置文件
- ❌ 回退到 Claude Code 的配置文件

### 新增的功能

- ✅ 使用 VSCode `secretStorage` API 存储 API Key
- ✅ API Key 仅存储在 VSCode 的加密存储中
- ✅ 更安全、更标准的配置管理方式

## 技术实现

### SecretStorage Key

```typescript
const SECRET_API_KEY = 'xiong.apiKey';
```

### API Key 存储方式

**之前（v0.8.1 及更早）:**
```typescript
// 1. 尝试从 VSCode 配置读取
const config = vscode.workspace.getConfiguration('xiong');
const apiKey = config.get<string>('apiKey');

// 2. 回退到 ~/.claude/settings.json
const settings = JSON.parse(fs.readFileSync('~/.claude/settings.json'));
const apiKey = settings.env.ANTHROPIC_AUTH_TOKEN;
```

**现在（v0.8.2+）:**
```typescript
// 直接从 secretStorage 读取
const apiKey = await context.secrets.get('xiong.apiKey');
```

### 保存 API Key

**之前:**
```typescript
// 同时保存到 VSCode 配置和 ~/.claude/settings.json
await config.update('apiKey', apiKey, vscode.ConfigurationTarget.Global);
settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
await fs.promises.writeFile('~/.claude/settings.json', JSON.stringify(settings));
```

**现在:**
```typescript
// 只保存到 secretStorage
await context.secrets.store('xiong.apiKey', apiKey);
```

## 用户迁移指南

### 对于新用户

直接在扩展的设置界面中配置 API Key 即可，无需任何额外操作。

### 对于现有用户

如果你之前使用 `~/.claude/settings.json` 存储了 API Key，需要重新在扩展中配置：

1. 打开 Dr-XIONG Claude 扩展
2. 点击"配置 API Key"按钮
3. 输入你的 API Key
4. 点击保存

API Key 将被安全地存储在 VSCode 的加密存储中。

### 迁移数据（可选）

如果你想自动迁移旧的 API Key：

```typescript
// 手动迁移脚本
const oldSettingsPath = path.join(os.homedir(), '.claude', 'settings.json');
const oldSettings = JSON.parse(fs.readFileSync(oldSettingsPath, 'utf8'));
const oldApiKey = oldSettings.env?.ANTHROPIC_AUTH_TOKEN;

if (oldApiKey) {
    await context.secrets.store('xiong.apiKey', oldApiKey);
    console.log('✓ API Key 已迁移到 SecretStorage');
}
```

## 配置文件变更

### package.json

```json
{
  "xiong.apiKey": {
    "type": "string",
    "default": "",
    "markdownDescription": "**Deprecated** - Please use the settings UI to configure your API Key.",
    "scope": "application"
  }
}
```

## 安全性提升

### SecretStorage 的优势

1. **加密存储**：VSCode 使用操作系统的密钥链/密钥库（如 macOS Keychain、Windows Credential Manager）来加密存储敏感信息
2. **跨会话持久化**：API Key 在重启 VSCode 后仍然可用
3. **机器级别隔离**：不同机器/操作系统的 SecretStorage 互不干扰
4. **标准 API**：使用 VSCode 官方推荐的方式管理敏感信息

### 与文件存储的对比

| 特性 | ~/.claude/settings.json | VSCode SecretStorage |
|------|------------------------|---------------------|
| 加密 | ❌ 明文存储 | ✅ 系统级加密 |
| 安全性 | ⚠️ 低（文件可被复制） | ✅ 高（系统保护） |
| 标准化 | ❌ 非标准 | ✅ VSCode 官方推荐 |
| 跨平台 | ⚠️ 路径可能不同 | ✅ 统一 API |
| 维护成本 | ⚠️ 需要手动管理文件系统 | ✅ VSCode 自动管理 |

## 代码变更摘要

### 修改的文件

1. **src/services/claudeConfigService.ts**
   - 移除 `fs`, `path`, `os` 依赖
   - 移除 `getSettings()`, `saveSettings()` 方法
   - 移除 `ClaudeSettings` 接口
   - 简化 `getApiKey()`, `setApiKey()` 实现
   - 添加 `secretStorage` 构造函数参数

2. **src/services/serviceRegistry.ts**
   - 传入 `context.secrets` 到 `ClaudeConfigService`

3. **package.json**
   - 更新 `xiong.apiKey` 配置说明为 "Deprecated"

### 删除的代码行数

- 删除约 **150 行代码**
- 简化了配置逻辑
- 提高了安全性

## 向后兼容性

⚠️ **不再兼容 `~/.claude/settings.json`**

如果你依赖此文件，请：
1. 手动备份该文件
2. 在扩展设置中重新配置 API Key
3. 删除 `~/.claude/settings.json`（可选）

## 相关文档

- [VSCode Extension API: SecretStorage](https://code.visualstudio.com/api/extension-capabilities/initializing-extensions#the-secretstorage-api)
- [VSCode Extension Guides: Data Storage](https://code.visualstudio.com/api/extension-capabilities/initializing-extensions#the-secretstorage-api)

---

**变更日期**: 2025-01-20  
**版本**: v0.8.2  
**作者**: Dr. Xiong
