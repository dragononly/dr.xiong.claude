# 图片识别功能测试指南

## 测试目的

验证当前 VSCode 扩展是否支持图片识别功能，以及粘贴的图片是否能正确传递给 Claude 模型。

## 前置条件

1. 已安装 VSCode 扩展
2. 已配置 Claude API（支持视觉能力的模型，如 `claude-sonnet-4-5-20250929`）
3. 测试图片已创建（运行 `create-test-image.sh` 脚本）

## 测试步骤

### 步骤 1: 准备测试图片

测试图片位于 `/tmp/test_vision.png`

图片内容说明：
- 尺寸：200x200 像素
- 背景：绿色大矩形框 (#4CAF50)
- 中心：白色文字 "TEST"
- 左上角：红色圆形 (#FF5722)
- 右下角：蓝色圆形 (#2196F3)
- 连接线：白色线条连接两个圆形

### 步骤 2: 在 VSCode 扩展中粘贴图片

**方法 A: 直接粘贴（推荐）**
1. 在 Finder 中打开 `/tmp/` 目录
2. 找到 `test_vision.png` 文件
3. 复制文件（Cmd+C）
4. 在扩展的聊天输入框中粘贴（Cmd+V）
5. 应该能看到附件出现在输入框上方

**方法 B: 拖拽上传**
1. 在 Finder 中打开 `/tmp/` 目录
2. 将 `test_vision.png` 文件直接拖拽到聊天输入框

### 步骤 3: 发送测试消息

在输入框中输入测试提示词：

```
请详细描述这张图片的内容，包括：
1. 图片中有什么颜色？
2. 有哪些形状？
3. 有没有文字？如果有，内容是什么？
4. 描述图片的整体布局
```

### 步骤 4: 观察模型响应

**预期成功结果：**

✅ 模型能够准确描述：
- 绿色的背景/边框
- 中间的白色文字 "TEST"
- 红色圆形和蓝色圆形
- 白色连接线
- 整体布局和位置关系

示例响应：
```
这张图片包含以下元素：
1. 背景：绿色的大矩形框
2. 中心位置有白色文字 "TEST"
3. 左上角有一个红色圆形
4. 右下角有一个蓝色圆形
5. 有一条白色线条从左上角的红色圆形连接到右下角的蓝色圆形
```

**失败情况：**

❌ 如果模型说：
- "我无法看到图片"
- "图片格式不支持"
- "我没有收到图片"
- 描述完全不符合实际内容

说明图片识别功能有问题。

## 技术验证

### 检查网络请求

打开浏览器开发者工具或查看扩展日志，确认发送到 API 的请求格式：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "请详细描述这张图片的内容..."
        },
        {
          "type": "image",
          "source": {
            "type": "base64",
            "media_type": "image/png",
            "data": "iVBORw0KGgoAAAANSUhEUgAA..."
          }
        }
      ]
    }
  ]
}
```

### 检查代码流程

1. **前端粘贴处理** (`ChatInputBox.vue` → `handlePaste`)
   - 检测剪贴板中的图片文件
   - 调用 `handleAddFiles`

2. **文件转换** (`attachment.ts` → `convertFileToAttachment`)
   - 将文件读取为 base64
   - 创建 `AttachmentItem` 对象

3. **消息构建** (`Session.ts` → `buildUserMessage`)
   - 将附件转换为 `ImageBlock`
   - 添加到用户消息的 `content` 数组中

4. **API 调用** (`ClaudeApiClient.ts` → `sendMessage`)
   - 发送包含图片的完整消息到 Claude API

## 常见问题排查

### 问题 1: 粘贴后没有显示附件

**可能原因：**
- 剪贴板中没有图片数据
- `handlePaste` 事件处理失败

**解决方案：**
- 检查浏览器控制台是否有错误
- 尝试使用拖拽方式上传

### 问题 2: 图片发送后模型说看不到

**可能原因：**
- API 不支持视觉功能
- 使用了不支持图片的模型
- base64 编码有问题

**解决方案：**
- 确认使用的是支持视觉的模型（如 claude-sonnet-4-5-20250929）
- 检查 API 请求格式是否正确
- 查看 `ClaudeApiClient.ts` 的日志输出

### 问题 3: 图片描述不准确

**可能原因：**
- 图片质量问题
- 模型能力限制

**解决方案：**
- 尝试使用更清晰的图片
- 使用更强大的模型（如 claude-opus-4-5）

## 测试结果记录

请在测试后记录结果：

```
测试日期：____
测试方法：[ ] 粘贴  [ ] 拖拽
模型名称：____
结果：[ ] 成功  [ ] 失败  [ ] 部分成功
模型响应：____
备注：____
```

## 代码位置参考

- 粘贴处理: `src/webview/src/components/ChatInputBox.vue:473`
- 文件转换: `src/webview/src/types/attachment.ts:68`
- 消息构建: `src/webview/src/core/Session.ts:1218`
- API 调用: `src/services/ai/ClaudeApiClient.ts:1`

## 自动化测试脚本

如果需要通过 API 直接测试（不经过扩展），可以使用：

```bash
node test-vision-api.js
```

这个脚本会：
1. 读取测试图片
2. 构建 API 请求
3. 发送到 Claude API
4. 显示模型响应
5. 评估测试结果

注意：需要在配置文件中设置正确的 API Key。
