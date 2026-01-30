# GLM 图片识别功能实现

## 概述

本次更新为 Dr-XIONG Claude 扩展添加了基于 GLM 视觉模型的图片识别功能。当用户在对话中发送图片时，系统会自动使用 GLM 模型识别图片内容，并将识别结果转换为文本描述发送给 Claude AI。

## 功能特点

### 1. 自动图片预处理
- ✅ 当用户发送包含图片的消息时，自动调用 GLM 进行图片识别
- ✅ 支持多种图片格式：JPEG, PNG, GIF, WebP
- ✅ 将图片内容转换为详细的文本描述
- ✅ 识别结果包含图片的主要内容和细节

### 2. 配置复用
- ✅ 复用用户在插件设置中配置的 API Key
- ✅ 复用用户配置的 Base URL（newapi 代理）
- ✅ 无需单独配置 GLM 相关参数

### 3. 可选开关
- ✅ 用户可以在设置中启用/禁用图片预处理功能
- ✅ 默认启用，提供更好的用户体验

## 配置项

在 `package.json` 中新增的配置项：

```json
{
  "xiong.glmApiKey": {
    "type": "string",
    "default": "",
    "description": "GLM API Key for image preprocessing (复用 Claude API Key)"
  },
  "xiong.glmBaseUrl": {
    "type": "string",
    "default": "",
    "description": "GLM API Base URL (复用 Claude Base URL)"
  },
  "xiong.glmModel": {
    "type": "string",
    "default": "glm-4.6v-flashx",
    "description": "GLM 模型用于图片识别"
  },
  "xiong.enableImagePreprocessing": {
    "type": "boolean",
    "default": true,
    "description": "启用使用 GLM 自动图片预处理"
  }
}
```

## 工作流程

### 1. 用户发送图片
```
用户 → ChatInputBox.vue → 选择/粘贴图片
```

### 2. 前端处理
```typescript
// Session.ts 中的 buildUserMessage 方法
// 将图片转换为 base64 编码的 ImageBlock
{
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/png',
    data: 'iVBORw0KGgo...'
  }
}
```

### 3. 后端图片预处理
```typescript
// AgentCoordinator.ts 中的 processUserMessage 方法
// 1. 检测到 ImageBlock
// 2. 提取图片数据
// 3. 调用 ImagePreprocessingService
// 4. GLMClient 发送到 GLM API
// 5. 获取图片描述
```

### 4. 发送给 Claude
```
原始消息：[图片] + "请解释这张图"
↓
GLM 识别：[图片描述: 这是一张显示 Vue 组件代码的截图...]
↓
发送给 Claude："[图片描述]\n\n请解释这张图"
```

## 核心文件

### 新增文件

1. **`src/services/ai/GLMClient.ts`** (8.3 KB)
   - GLM API 客户端
   - 支持流式和非流式响应
   - 复用用户配置的 API Key 和 Base URL

2. **`src/services/ImagePreprocessingService.ts`** (5.8 KB)
   - 图片预处理服务
   - 调用 GLM 进行图片识别
   - 将识别结果格式化为文本

### 修改文件

1. **`src/services/claudeConfigService.ts`**
   - 修复配置命名空间：`claudix` → `xiong`
   - 添加 GLM 配置方法：
     - `getGlmApiKey()` - 复用 Claude API Key
     - `getGlmBaseUrl()` - 获取 GLM Base URL
     - `getGlmModel()` - 获取 GLM 模型名称
     - `isImagePreprocessingEnabled()` - 检查是否启用图片预处理

2. **`src/services/agent/AgentCoordinator.ts`**
   - 添加图片预处理逻辑
   - 新增 `processUserMessage()` 方法
   - 在发送消息前自动处理图片

3. **`src/services/serviceRegistry.ts`**
   - 注册 `IGLMClient` 服务
   - 注册 `IImagePreprocessingService` 服务

4. **`src/services/ai/index.ts`**
   - 导出 `IGLMClient` 和 `GLMClient`

## 技术细节

### GLM API 调用示例

```typescript
// GLMClient 发送请求
POST {baseUrl}/v1/chat/completions
Headers:
  Authorization: Bearer {apiKey}
  Content-Type: application/json

Body:
{
  "model": "glm-4.6v-flashx",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请描述这张图片..."
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/png;base64,iVBORw0KGgo..."
          }
        }
      ]
    }
  ],
  "max_tokens": 2048,
  "temperature": 0.3
}
```

### 图片识别提示词

```
请仔细观察这张图片，并提供详细的描述。包括：
1. 图片的主要内容
2. 图片中的文字内容（如果有）
3. 图片的细节和特点
4. 图片的用途或含义（如果适用）

请用中文回答。
```

## 使用示例

### 场景 1：代码截图识别

**用户操作**：
1. 截取一段代码
2. 粘贴到聊天框
3. 发送消息："请解释这段代码"

**系统处理**：
```
1. 检测到图片附件
2. 调用 GLM 识别
3. 获取描述："这是一张 TypeScript 代码截图，显示了一个 Vue 组件的实现..."
4. 将描述和用户问题一起发送给 Claude
```

### 场景 2：错误信息截图

**用户操作**：
1. 截取错误信息
2. 发送："这个错误怎么解决？"

**系统处理**：
```
1. GLM 识别错误类型和堆栈信息
2. Claude 基于识别结果提供解决方案
```

## 优势

### 1. 用户体验优化
- ✅ 无需手动描述图片内容
- ✅ 自动识别，提高对话效率
- ✅ 支持拖拽、粘贴等多种方式

### 2. 配置简单
- ✅ 复用现有 API 配置
- ✅ 无需额外设置
- ✅ 默认启用，开箱即用

### 3. 成本节约
- ✅ GLM 模型价格较低
- ✅ 仅在发送图片时调用
- ✅ 可通过设置禁用功能

## 测试建议

### 1. 基本功能测试
- [ ] 发送单张图片
- [ ] 发送多张图片
- [ ] 同时发送图片和文本
- [ ] 发送不同格式图片（PNG, JPEG, GIF, WebP）

### 2. 配置测试
- [ ] 修改 GLM 模型名称
- [ ] 禁用图片预处理功能
- [ ] 使用不同的 Base URL

### 3. 边界情况测试
- [ ] 发送超大图片
- [ ] 发送损坏的图片文件
- [ ] GLM API 调用失败时的降级处理

## 未来改进

### 可能的增强功能
1. **缓存机制**：缓存相同图片的识别结果，避免重复调用
2. **批量处理**：一次识别多张图片，减少 API 调用次数
3. **自定义提示词**：允许用户自定义图片识别提示词
4. **OCR 增强**：针对文字密集型图片优化识别效果
5. **模型选择**：支持多个 GLM 模型（如 glm-4v-plus）

### 性能优化
1. **图片压缩**：自动压缩大图片，减少传输时间
2. **并行处理**：多张图片并行识别
3. **流式响应**：实时显示识别进度

## 总结

本次更新成功实现了基于 GLM 的图片识别功能，通过复用用户配置、简化操作流程，为用户提供了更便捷的图片交互体验。功能完整、配置灵活、易于使用。

---

**实现日期**: 2025-01-19
**版本**: v0.7.20
**作者**: Dr. Xiong & Claude
