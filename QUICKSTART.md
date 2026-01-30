# 🚀 快速启动指南

## 方式 1：调试模式（推荐）

### 步骤：
1. 在 VSCode 中按 **F5** 键
2. 会自动打开一个新的 "Extension Development Host" 窗口
3. 在新窗口中测试扩展功能

### 优点：
- ✅ 支持断点调试
- ✅ 可以查看 console.log 输出
- ✅ 修改代码后自动重新编译
- ✅ 最适合开发测试

---

## 方式 2：使用启动脚本

在终端中运行：
```bash
./start.sh
```

然后选择你想要的启动方式（1-4）。

---

## 方式 3：手动打包安装

### 步骤：
1. 打包扩展：
```bash
npm run package
```

2. 安装：
   - 在 VSCode 中按 `Cmd+Shift+P`
   - 输入 "Install from VSIX"
   - 选择生成的 `claude-dr-xiong-*.vsix` 文件

---

## 🧪 测试新功能

扩展启动后，在聊天面板中尝试以下对话：

### 1️⃣ 测试 bash_terminal（新功能）

```
你：在终端执行 echo "Hello Terminal"
AI：我来在 VSCode 终端中执行这个命令。

[调用 bash_terminal 工具]
✅ 命令已在 VSCode 终端中执行，请查看终端面板。
```

### 2️⃣ 查看文件

```
你：用终端查看 src 目录的文件
AI：我会在终端中执行 ls 命令。

bash_terminal(command="ls -la src", terminalName="File Browser")
✅ 已在终端中列出文件
```

### 3️⃣ 可能卡住的命令

```
你：帮我运行 npm install
AI：我会在终端执行，这样如果卡住你可以 Ctrl+C。

bash_terminal(command="npm install", terminalName="NPM Install")
✅ 安装命令已在终端执行
💡 如果卡住可以按 Ctrl+C 中断
```

### 4️⃣ 调试构建

```
你：在终端执行构建，我想看到详细输出
AI：好的，我会在终端执行构建命令。

bash_terminal(command="npm run build", terminalName="Build")
✅ 构建命令已发送到终端
📺 查看终端面板了解构建进度
```

---

## 🔍 对比：bash_exec vs bash_terminal

### bash_exec（后台执行）
```
你：执行 ls -la
AI：bash_exec(command="ls -la")
✅ 快速返回结果
📝 适合：简单、快速的命令
```

### bash_terminal（可见终端）⭐ 新增
```
你：在终端执行 npm install
AI：bash_terminal(command="npm install", terminalName="NPM")
✅ 在 VSCode 终端中执行
💡 你可以：
   - 实时查看输出
   - 随时 Ctrl+C 中断
   - 手动输入其他命令
📝 适合：可能卡住、需要调试、需要手动干预
```

---

## 🎯 AI 如何选择工具

系统提示词已更新，AI 会智能选择：

| 场景 | 使用的工具 | 原因 |
|------|-----------|------|
| 简单命令（ls, cat, git） | `bash_exec` | 快速、自动捕获输出 |
| 自动化脚本 | `bash_exec` | 不需要用户干预 |
| 长时间运行的服务 | `bash_exec(run_in_background=true)` | 后台运行 |
| **可能卡住的命令** | **`bash_terminal`** | **可以手动中断** |
| **需要调试的命令** | **`bash_terminal`** | **可以看到详细输出** |
| **用户提到"在终端"** | **`bash_terminal`** | **符合用户期望** |

---

## 🐛 调试技巧

### 查看扩展日志
1. 按 `Cmd+Shift+P`
2. 输入 "Toggle Developer Tools"
3. 查看 Console 面板的日志

### 查看服务端日志
查看 VSCode 的 "Output" 面板：
1. 点击右侧的输出图标
2. 选择 "Log Service" 或其他服务

### 查看前端日志
1. 在 WebView 中右键
2. 选择 "Inspect Element"
3. 查看 Console

---

## 📝 测试清单

测试以下功能，确保一切正常：

### ✅ 基础功能
- [ ] 扩展正常加载
- [ ] 聊天面板可以打开
- [ ] 可以发送消息

### ✅ Bash 工具
- [ ] `bash_exec` 执行简单命令
- [ ] `bash_exec` 捕获输出
- [ ] `bash_terminal` 在终端执行
- [ ] `bash_terminal` 显示终端
- [ ] 可以手动 Ctrl+C 中断

### ✅ 新功能验证
- [ ] AI 根据场景选择合适的工具
- [ ] 用户可以明确指定使用 bash_terminal
- [ ] 终端正常显示输出
- [ ] 多个终端不会冲突

---

## 🆘 常见问题

### Q: 扩展没有加载？
**A:** 检查 `dist/extension.cjs` 是否存在，运行 `npm run build`

### Q: F5 后没有反应？
**A:** 查看是否有错误提示，确保构建成功

### Q: bash_terminal 没有打开终端？
**A:** 检查 VSCode 终端面板是否被隐藏，点击顶部 "Terminal" 菜单

### Q: AI 没有使用 bash_terminal？
**A:** 尝试明确说"在终端执行"或"我想看到输出"

---

## 🎉 开始使用

现在按 **F5** 启动扩展，开始测试新功能吧！

有任何问题，请查看：
- `docs/BASH_TERMINAL_FEATURE.md` - 功能详细说明
- `docs/BASH_TERMINAL_EXAMPLES.md` - 使用示例
- `docs/SYSTEM_PROMPT_TEMPLATE.md` - 系统提示词

享受更好的终端体验！🚀
