# Xiong 配置说明

## 配置文件位置

Xiong 使用独立的配置文件，**不会与 Claude Code 产生冲突**：

- **配置目录**: `~/.xiong/`
- **配置文件**: `~/.xiong/settings.json`

## 配置优先级

1. **VSCode 用户设置** (最高优先级)
   - `xiong.apiKey`
   - `xiong.baseUrl`
   - `xiong.selectedModel`

2. **独立配置文件** `~/.xiong/settings.json` (后备)
   - 当 VSCode 设置不可用时使用
   - 作为持久化存储

## 配置项说明

### API Key (`apiKey`)
- Anthropic API 密钥
- 自动去除首尾空格
- 示例: `sk-ant-xxxxx`

### Base URL (`baseUrl`)
- 自定义 API 地址（用于代理）
- 自动去除首尾空格和尾部斜杠
- 示例: `http://aiapi3.moono.vip:3010`
- 输入 `http://example.com/` 会自动变成 `http://example.com`

### Selected Model (`selectedModel`)
- 使用的 AI 模型
- 默认值: `claude-sonnet-4-5-20250929`
- 示例: `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20250929`

## 配置文件格式示例

```json
{
  "apiKey": "sk-ant-xxxxx",
  "baseUrl": "http://aiapi3.moono.vip:3010",
  "selectedModel": "claude-sonnet-4-5-20250929"
}
```

## 与 Claude Code 的区别

| 特性 | Claude Code | Xiong |
|------|-------------|---------|
| 配置目录 | `~/.claude/` | `~/.xiong/` |
| 环境变量 | `ANTHROPIC_AUTH_TOKEN` | `apiKey` |
| 结构 | `{ env: { ... } }` | `{ apiKey, baseUrl, ... }` |
| 冲突风险 | - | ✅ 无冲突 |

## 注意事项

1. **VSCode 配置作用域**: `apiKey` 和 `baseUrl` 的作用域是 `application`，这意味着它们不能通过 VSCode API 动态更新到用户设置。Xiong 会自动回退到 `~/.xiong/settings.json` 保存。

2. **自动清理**: 
   - URL 尾部的斜杠会自动去除
   - 所有输入会自动去除首尾空格

3. **兼容性**: Xiong 不读取 `~/.claude/settings.json`，避免与 Claude Code 产生任何冲突。
