# 配置保存问题排查指南 (SecretStorage 版本)

> **注意**：从 v0.8.2 开始，API Key 使用 VSCode SecretStorage 加密存储，不再使用 `~/.claude/settings.json` 文件。

## 问题现象

用户在设置页面输入 API Key 并点击"保存"按钮后，配置无法保存成功。

## 存储架构

### v0.8.2 之后的存储方式

```
API Key     → VSCode SecretStorage (加密存储在系统密钥链)
Base URL    → VSCode 配置 (workspace.getConfiguration)
Model Name  → VSCode 配置 (workspace.getConfiguration)
```

### 安全性提升

- ✅ API Key 使用操作系统密钥链加密存储
- ✅ 不同操作系统使用不同的安全存储机制：
  - macOS: Keychain
  - Windows: Credential Manager
  - Linux: libsecret (GNOME Keyring / KWallet)
- ✅ 不再明文存储在配置文件中

## 可能的原因和解决方案

### 1. SecretStorage 不可用

**症状**：
- 点击保存后提示 SecretStorage 错误
- 控制台显示 "secretStorage is not available"

**解决方案**：

#### 检查 VSCode 版本
```bash
# 查看 VSCode 版本
code --version
```

要求：VSCode >= 1.53.0

#### 检查环境支持
- **macOS**：系统自带 Keychain，无需额外配置
- **Windows**：系统自带 Credential Manager，无需额外配置
- **Linux**：需要安装 libsecret
  ```bash
  # Ubuntu/Debian
  sudo apt-get install libsecret-1-0

  # Fedora/RHEL
  sudo dnf install libsecret
  ```

### 2. API Key 格式错误

**症状**：
- 保存成功但无法使用
- 提示"API Key 无效"

**正确的 API Key 格式**：
```
sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**要求**：
- 长度：51-54 字符
- 前缀：`sk-ant-api03-`
- 仅包含字母、数字和连字符

### 3. WebView 缓存问题

**症状**：
- 配置已保存但前端显示不更新
- 需要刷新页面才能看到

**解决方案**：
1. 按 `Ctrl+Shift+P` (Mac: `Cmd+Shift+P`)
2. 输入 "Developer: Reload Webview"
3. 重新加载 WebView

## 诊断步骤

### 步骤 1：验证 SecretStorage 配置

**方法 1：通过设置页面**
1. 打开扩展设置页面
2. 查看"当前密钥"是否显示脱敏的 API Key（如 `sk-x****2F2w`）
3. 如果显示，说明 SecretStorage 工作正常

**方法 2：通过开发者工具**
```javascript
// 在 VSCode 开发者工具 Console 中运行
vscode.commands.executeCommand('workbench.action.showDeveloperTools')
```

### 步骤 2：检查 VSCode 设置

打开 VSCode 设置（JSON模式）：
```bash
# macOS
code ~/Library/Application\ Support/Code/User/settings.json

# Windows
code %APPDATA%\Code\User\settings.json

# Linux
code ~/.config/Code/User/settings.json
```

查找 `xiong` 配置（注意：**API Key 不在这里**）：
```json
{
  "xiong.baseUrl": "http://aiapi3.moono.vip:3010",
  "xiong.selectedModel": "claude-sonnet-4-5-20250929"
}
```

### 步骤 3：查看控制台日志

1. 在 WebView 中按 `F12` 打开开发者工具
2. 查看 Console 标签
3. 点击"保存"按钮
4. 观察日志输出

**正常日志**：
```
[Settings] 开始保存 API Key...
[Settings] Connection 获取成功，调用 setApiKey...
[ClaudeConfigService] ✓ API Key 已保存到 VSCode SecretStorage
[Settings] API Key 保存成功，刷新配置显示...
```

**错误日志示例**：
```
[ClaudeConfigService] ✗ 保存 API Key 失败: Error: SecretStorage is not available
```

### 步骤 4：测试 API Key 有效性

在设置页面点击"刷新"按钮查看账户余额：
- ✅ 能正常显示余额 → API Key 有效
- ❌ 显示错误 → API Key 无效或网络问题

## 临时解决方案：手动配置

如果图形界面保存一直失败，可以手动编辑 VSCode 配置：

### 方案 A：使用 VSCode 命令面板

1. 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
2. 输入 "Preferences: Open Settings (JSON)"
3. 添加以下配置（**注意：不包含 API Key**）：

```json
{
  "xiong.baseUrl": "http://aiapi3.moono.vip:3010",
  "xiong.selectedModel": "claude-sonnet-4-5-20250929"
}
```

4. 保存文件
5. **重要**：API Key 必须通过扩展设置页面配置（使用 SecretStorage）

### 方案 B：使用设置 UI

1. 打开扩展设置页面
2. 在 "API Key" 输入框中粘贴完整的 API Key
3. 点击"保存"按钮
4. 等待保存成功提示

## 验证配置成功

配置成功后，你应该能看到：

1. ✅ 设置页面显示当前密钥（脱敏）
2. ✅ 点击"刷新"能正常显示账户余额
3. ✅ 返回聊天页面能正常发送消息
4. ✅ 不再提示"API Key 未配置"

## 获取帮助

如果以上方法都无法解决问题：

1. 收集诊断信息：
   - VSCode 版本（`code --version`）
   - 操作系统版本
   - 控制台（F12）的错误日志
   - SecretStorage 可用性测试结果

2. 提交 Issue：
   - 在 GitHub 上提交 Issue
   - 附上诊断信息（**切记隐藏 API Key**）
   - 描述你的操作步骤

## 常见错误消息

### "SecretStorage is not available"
→ VSCode 版本过低或环境不支持 SecretStorage，参考解决方案 #1

### "Invalid API Key format"
→ API Key 格式错误，参考解决方案 #2

### "Network error"
→ 网络连接问题，检查：
  - Base URL 是否正确
  - 网络连接是否正常
  - 代理设置是否正确

### "保存成功但无法使用"
→ 可能原因：
  - API Key 过期
  - API Key 余额不足
  - Base URL 配置错误
  - 网络防火墙阻止

## 从旧版本迁移

### 如果你之前使用了 ~/.claude/settings.json

旧版本的配置文件（~/.claude/settings.json）仍然存在，但扩展不再读取它。

**迁移步骤**：
1. 打开 `~/.claude/settings.json` 文件
2. 复制 `ANTHROPIC_AUTH_TOKEN` 的值（你的 API Key）
3. 在扩展设置页面粘贴 API Key 并保存
4. 保存成功后，可以删除 `~/.claude/settings.json` 文件

**注意事项**：
- ⚠️ 不要手动删除 `~/.claude/settings.json` 之前，确保新配置已经成功保存
- ⚠️ 旧配置文件中的其他配置（如 Base URL）需要重新配置

## 安全性说明

### 为什么使用 SecretStorage？

1. **加密存储**：API Key 使用系统密钥链加密，比明文文件更安全
2. **访问控制**：系统密钥链有严格的访问权限控制
3. **跨应用安全**：即使其他应用读取配置文件，也无法获取 API Key

### SecretStorage 的限制

1. **不共享**：不同扩展的 SecretStorage 互相隔离
2. **不导出**：无法直接导出 SecretStorage 的内容（安全设计）
3. **依赖系统**：需要操作系统支持密钥链功能

## Linux 用户特别说明

### 安装 libsecret

某些 Linux 发行版需要额外安装 libsecret：

```bash
# Ubuntu/Debian
sudo apt-get install libsecret-1-0 gnome-keyring

# Fedora/RHEL
sudo dnf install libsecret libgnome-keyring

# Arch Linux
sudo pacman -S libsecret gnome-keyring
```

### 验证 libsecret 安装

```bash
# 检查 libsecret 是否已安装
ldconfig -p | grep libsecret
```

如果命令有输出，说明 libsecret 已正确安装。
