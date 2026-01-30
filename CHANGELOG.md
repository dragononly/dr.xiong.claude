# Changelog

All notable changes to the "Dr-XIONG Claude" extension will be documented in this file.

## [0.8.29] - 2025-01-21

### ✨ New Features

#### 🤖 GPT 模型支持
- **新增 GPT 模型选项**：在模型选择下拉菜单中添加了 GPT 模型组
  - `gpt-5.2-codex` - GPT 5.2 Codex
  - `gpt-5.1-codex-mini` - GPT 5.1 Codex Mini
- **模型分组显示**：模型选择器现在按 "Claude" 和 "GPT" 分组显示，更清晰直观

### 🔧 Improvements

- 优化模型选择器 UI，添加分组标题样式
- 更新模型标签映射表，支持新添加的 GPT 模型

### 📝 Configuration

用户可以在模型下拉菜单中选择以下模型：

**Claude 模型组**：
- Claude Opus 4.5
- Claude Sonnet 4.5
- Claude Haiku 4.5

**GPT 模型组**：
- GPT 5.2 Codex
- GPT 5.1 Codex Mini

---

## [0.8.0] - 2025-01-19

### 🎉 New Features

#### ✨ GLM 图片识别功能
- **自动图片识别**：在对话中发送图片时，自动使用 GLM 视觉模型识别图片内容
- **智能描述转换**：将图片识别结果转换为详细的文本描述，发送给 Claude AI
- **配置复用**：复用用户在插件设置中配置的 API Key 和 Base URL（支持 newapi 代理）
- **多格式支持**：支持 JPEG、PNG、GIF、WebP 等多种图片格式
- **灵活配置**：
  - 新增配置项 `xiong.glmModel`：自定义 GLM 模型（默认 `glm-4.6v-flashx`）
  - 新增配置项 `xiong.enableImagePreprocessing`：启用/禁用图片预处理（默认启用）

#### 📝 使用场景
1. **代码截图识别**：粘贴代码截图，自动识别代码内容并提供解释
2. **错误信息截图**：发送错误截图，自动识别错误类型和堆栈信息
3. **界面设计讨论**：发送 UI 设计图，自动识别设计元素和布局
4. **文档图表解析**：发送文档或图表，自动提取关键信息

### 🔧 Improvements

- **修复配置命名空间**：统一配置命名空间为 `xiong`（之前部分配置使用了 `claudix`）
- **优化图片处理流程**：在发送给 Claude 前自动预处理图片，提升对话效率
- **增强降级机制**：GLM API 调用失败时自动降级，不影响正常对话

### 🏗️ Technical Changes

**新增服务**：
- `GLMClient`：GLM API 客户端，支持流式和非流式响应
- `ImagePreprocessingService`：图片预处理服务，自动调用 GLM 识别图片

**更新服务**：
- `ClaudeConfigService`：添加 GLM 配置管理方法
- `AgentCoordinator`：集成图片预处理逻辑

**配置项变更**：
- 修复：`claudix.*` → `xiong.*`
- 新增：`xiong.glmModel`、`xiong.glmBaseUrl`、`xiong.glmApiKey`
- 新增：`xiong.enableImagePreprocessing`

### 📚 Documentation

- 新增功能文档：`docs/GLM_IMAGE_RECOGNITION.md`
- 更新项目架构文档
- 更新使用说明

### 🐛 Bug Fixes

- 修复配置读取问题：确保所有配置项使用正确的命名空间

### ⚙️ Configuration

```json
{
  "xiong.glmModel": "glm-4.6v-flashx",
  "xiong.glmBaseUrl": "",
  "xiong.glmApiKey": "",
  "xiong.enableImagePreprocessing": true
}
```

**注意**：
- `glmApiKey` 和 `glmBaseUrl` 默认为空，系统会自动复用 `xiong.apiKey` 和 `xiong.baseUrl`
- 如需使用独立的 GLM API 配置，可以单独设置这两个选项

---

## [0.7.20] - Previous Release

### Features
- 自建工具系统（不依赖 Claude SDK）
- 新增 8 种内置工具（文件操作、命令执行、搜索等）
- 新增 ClaudeApiClient 直接调用 Claude API
- 新增 AgentCoordinator 代理协调器
- 系统提示词支持 Claude 身份模拟
- 添加屏蔽关键字列表

---

## Upgrade Guide

### From 0.7.20 to 0.8.0

**无需额外配置**：图片识别功能会自动使用您现有的 API 配置。

**可选配置**：
1. 如果需要使用独立的 GLM API，可以在设置中配置 `xiong.glmBaseUrl`
2. 如果需要使用不同的 GLM 模型，可以修改 `xiong.glmModel`
3. 如果不需要图片识别功能，可以设置 `xiong.enableImagePreprocessing` 为 `false`

**配置迁移**：
- 所有 `claudix.*` 配置已自动迁移到 `xiong.*`
- 旧配置仍然兼容，但建议更新到新的命名空间

---

For full release notes, visit: https://github.com/Haleclipse/Claudix/releases

## [0.8.1] - 2025-01-19

### 🐛 Bug Fixes

- **关键修复**：修复图片识别功能未生效的问题
  - 问题：用户消息中的图片块被错误地转换为纯文本，导致图片信息丢失
  - 修复：保留完整的内容块数组，包括图片块
  - 影响：现在图片识别功能可以正常工作

### 🔧 Technical Details

**问题根源**：
```typescript
// 之前的代码（错误）
const content = messageContent.map((c: any) => c.text || '').join('');
// ❌ 只保留文本，丢失图片

// 修复后的代码（正确）
const content = messageContent;
// ✅ 保留完整内容块，包括图片
```

### 📝 Testing

测试场景：
- ✅ 粘贴代码截图 → 自动识别
- ✅ 发送错误截图 → 自动诊断
- ✅ 拖拽图片文件 → 正常处理

### ⚠️ 重要说明

如果您已安装 v0.8.0，**强烈建议升级到 v0.8.1** 以获得图片识别功能！

