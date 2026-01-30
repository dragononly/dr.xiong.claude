# Dr-XIONG Claude v0.8.0 发布说明

## 🎉 重大更新：GLM 图片识别功能

### 📦 版本信息

- **版本号**: 0.8.0
- **发布日期**: 2025-01-19
- **包大小**: 2.2 MB
- **VSIX 文件**: `claude-dr-xiong-0.8.0.vsix`

---

## ✨ 新功能

### 1. 🔍 GLM 图片识别（核心功能）

现在您可以在对话中直接发送图片，系统会自动使用 GLM 视觉模型识别图片内容！

#### 使用场景

| 场景 | 说明 | 示例 |
|------|------|------|
| **代码截图识别** | 粘贴代码截图，自动识别并解释 | 截图 → "请解释这段代码" |
| **错误信息诊断** | 发送错误截图，自动识别错误类型 | 错误截图 → "这个错误怎么解决？" |
| **UI 设计讨论** | 发送设计图，分析布局和元素 | 设计稿 → "请分析这个界面" |
| **文档图表解析** | 发送文档或图表，提取关键信息 | 图表 → "请总结这个图表的数据" |

#### 技术特性

- ✅ **自动识别**：发送图片时自动调用 GLM-4.6V-FlashX 模型
- ✅ **配置复用**：使用您现有的 API Key 和 Base URL（无需额外配置）
- ✅ **格式支持**：JPEG, PNG, GIF, WebP
- ✅ **智能转换**：图片描述自动转换为文本，发送给 Claude AI
- ✅ **灵活控制**：可在设置中启用/禁用或自定义模型

#### 使用方法

1. **拖拽图片**：直接拖拽图片到聊天框
2. **粘贴图片**：截图后 Ctrl/Cmd+V 粘贴
3. **选择文件**：点击附件按钮选择图片文件
4. **发送消息**：图片会自动识别，描述内容会发送给 Claude

---

## 🔧 配置项

### 新增配置

```json
{
  "xiong.glmModel": "glm-4.6v-flashx",
  "xiong.glmBaseUrl": "",
  "xiong.glmApiKey": "",
  "xiong.enableImagePreprocessing": true
}
```

**说明**：
- `glmModel`：GLM 模型名称（默认 `glm-4.6v-flashx`）
- `glmBaseUrl`：GLM API 地址（默认为空，复用 `xiong.baseUrl`）
- `glmApiKey`：GLM API Key（默认为空，复用 `xiong.apiKey`）
- `enableImagePreprocessing`：是否启用图片预处理（默认 `true`）

### 配置修复

- 修复配置命名空间：`claudix.*` → `xiong.*`
- 旧配置自动兼容，建议手动更新到新命名空间

---

## 🏗️ 技术改进

### 新增服务

1. **GLMClient**（8.3 KB）
   - GLM API 客户端
   - 支持流式和非流式响应
   - 复用用户配置

2. **ImagePreprocessingService**（5.8 KB）
   - 图片预处理服务
   - 自动调用 GLM 识别
   - 格式化识别结果

### 架构优化

- **AgentCoordinator 增强**：集成图片预处理流程
- **ClaudeConfigService 扩展**：添加 GLM 配置管理
- **服务注册表更新**：注册新的图片识别服务

---

## 📊 变更统计

### 代码变更

- **新增文件**: 3 个（GLMClient, ImagePreprocessingService, 文档）
- **修改文件**: 6 个（配置服务、代理协调器等）
- **新增代码**: ~1,500 行
- **新增文档**: 3 个

### 文件大小

- VSIX 包: **2.2 MB**（与之前版本相近）
- 扩展主体: 190 KB
- WebView 资源: 3.4 MB

---

## 🚀 升级指南

### 从 0.7.20 升级到 0.8.0

1. **下载新版本**
   ```bash
   # 下载 claude-dr-xiong-0.8.0.vsix
   ```

2. **安装扩展**
   - 方式 1：VSCode → 扩展 → ... → 从 VSIX 安装
   - 方式 2：命令行 `code --install-extension claude-dr-xiong-0.8.0.vsix`

3. **配置检查**
   - ✅ 无需额外配置，图片识别自动使用现有 API
   - 🔧 可选：自定义 GLM 模型或禁用图片识别

### 配置迁移

**自动迁移**：
- 所有 `claudix.*` 配置已自动迁移到 `xiong.*`

**手动检查**（可选）：
```json
// 旧配置（仍然兼容）
"claudix.apiKey": "..."

// 新配置（推荐）
"xiong.apiKey": "..."
```

---

## 🐛 Bug 修复

- 修复配置命名空间不一致问题
- 修复 GLM API 调用时的类型错误
- 优化图片识别失败时的降级处理

---

## 📚 文档更新

- 新增：`docs/GLM_IMAGE_RECOGNITION.md` - 功能详细文档
- 新增：`CHANGELOG.md` - 变更日志
- 更新：`.claude-summary.md` - 工作日志

---

## ⚠️ 注意事项

1. **API 使用**
   - 图片识别会调用 GLM API，产生额外费用
   - GLM-4.6V-FlashX 价格较低，适合频繁使用
   - 可通过设置禁用图片识别以节省成本

2. **隐私保护**
   - 图片数据会发送到 GLM API 进行识别
   - 识别结果会发送给 Claude API 进行进一步处理
   - 请勿发送包含敏感信息的图片

3. **兼容性**
   - 旧版本配置仍然兼容
   - 建议更新到新的配置命名空间

---

## 🔮 未来计划

### 短期（v0.8.x）
- [ ] 添加图片识别结果缓存
- [ ] 支持多张图片批量识别
- [ ] 优化大图片的处理性能

### 中期（v0.9.x）
- [ ] 支持自定义图片识别提示词
- [ ] 添加更多 GLM 模型选项
- [ ] 实现 OCR 增强功能

### 长期（v1.0.x）
- [ ] 支持其他视觉模型（GPT-4V, Claude Vision）
- [ ] 添加图片编辑功能
- [ ] 实现图片搜索和索引

---

## 💬 反馈与支持

- **GitHub**: https://github.com/Haleclipse/Claudix
- **Issues**: https://github.com/Haleclipse/Claudix/issues
- **文档**: `docs/GLM_IMAGE_RECOGNITION.md`

---

## 📜 许可证

本扩展采用 AGPL-3.0 许可证。

---

**感谢使用 Dr-XIONG Claude！**

如有问题或建议，欢迎提交 Issue 或 PR。
