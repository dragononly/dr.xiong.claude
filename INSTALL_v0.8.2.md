# 快速安装指南 - Dr. XIONG Claude v0.8.2

## 📦 安装方法

### 方法 1：从 VSIX 文件安装（推荐）

1. **下载扩展包**
   - 文件名：`claude-dr-xiong-0.8.2.vsix`
   - 大小：2.2 MB

2. **在 VSCode 中安装**
   
   **方式 A：拖拽安装**
   - 将 `claude-dr-xiong-0.8.2.vsix` 文件拖拽到 VSCode 窗口
   - 点击"安装"按钮
   
   **方式 B：命令安装**
   - 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
   - 输入 "Extensions: Install from VSIX..."
   - 选择 `claude-dr-xiong-0.8.2.vsix` 文件

3. **重新加载 VSCode**
   - 安装完成后会提示重新加载
   - 点击"重新加载"按钮

### 方法 2：从 VSCode Marketplace 安装

```
搜索：Dr-XIONG Claude
发布者：drxiong
版本：0.8.2
```

## ⚙️ 首次配置

### 步骤 1：打开设置

- 点击聊天界面右上角的设置图标 ⚙️
- 或按 `Cmd+Shift+P` → 输入 `xiong.openSettings`

### 步骤 2：配置 API Key

1. 在 "API Key" 字段中填入您的 API Key
2. 格式：`sk-ant-api03-xxxxxxxx...`
3. 点击"保存"按钮

### 步骤 3：（可选）配置 Base URL

如果使用代理服务，在 "API 地址" 字段填入：
- 示例：`http://aiapi3.moono.vip:3010`
- 如果使用官方 API，留空即可

### 步骤 4：验证配置

1. 查看"当前密钥"是否显示脱敏的 API Key
2. 点击"刷新"按钮查看账户余额
3. 返回聊天页面，发送测试消息

## 🎯 获取 API Key

### 官方 API
- 访问：https://console.anthropic.com/
- 注册账号并创建 API Key
- 格式：`sk-ant-api03-...`

### 代理服务
- 从您的代理服务商获取
- 同时获取 API Key 和 Base URL

## 🔧 诊断工具

如果遇到问题，运行诊断脚本：

```bash
# 在项目目录中运行
bash scripts/diagnose.sh
```

或查看故障排查指南：`docs/TROUBLESHOOTING.md`

## ✅ 验证安装成功

安装成功后，你应该能看到：

1. ✅ 侧边栏出现 "Dr-XIONG Claude" 图标
2. ✅ 点击图标打开聊天界面
3. ✅ 配置 API Key 后可以正常聊天
4. ✅ 不再提示"API Key 未配置"

## 🆕 v0.8.2 新特性

- ✨ 改进 API Key 未配置的用户提示
- ✨ 增强配置保存的错误处理
- ✨ 设置页面添加详细帮助说明
- ✨ 创建诊断工具和故障排查指南
- ✨ 改进配置验证和反馈

## 📚 更多信息

- **完整文档**：README_CN.md
- **故障排查**：docs/TROUBLESHOOTING.md
- **版本更新**：RELEASE_v0.8.2.md
- **问题反馈**：GitHub Issues

## 🎉 开始使用

配置完成后，您可以：

- 💬 与 Claude AI 助手对话
- 📝 分析和编辑代码
- 🔍 搜索代码库
- 🖼️ 识别图片内容（GLM）
- 📋 管理本地任务
- 🤖 自动执行任务

祝您使用愉快！🚀
