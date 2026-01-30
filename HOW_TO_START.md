# 🎯 现在启动扩展

## 方式 1：使用 VSCode 调试面板（推荐）

### 步骤：

1. **打开调试面板**
   - 点击 VSCode 左侧的 **运行和调试** 图标（或按 `Cmd+Shift+D`）
   - 在顶部下拉菜单中选择 **"Run Extension (No Build)"** ⭐

2. **点击启动按钮**
   - 点击绿色的 ▶️ 按钮
   - 或者按 `F5` 键

3. **等待新窗口打开**
   - 会自动打开一个新的 VSCode 窗口
   - 窗口标题会显示 "Extension Development Host"

4. **在新窗口中测试**
   - 点击左侧活动栏的 Claude 图标
   - 打开聊天面板
   - 开始测试！

### ⚠️ 重要提示

**如果看到错误：**
- 检查 "Run Extension (No Build)" 是否在下拉菜单中
- 如果没有，重新加载 VSCode（`Cmd+Shift+P` → "Reload Window"）

**如果扩展没有加载：**
- 打开新窗口的 "Help" → "Toggle Developer Tools"
- 查看 Console 是否有错误信息

---

## 方式 2：使用命令面板

1. 按 `Cmd+Shift+P` 打开命令面板
2. 输入 "Debug: Select and Start Debugging"
3. 选择 "Run Extension (No Build)"

---

## 方式 3：快速测试（跳过构建）

由于已经构建好了（`dist/extension.cjs` 存在），可以直接启动：

### 在终端执行：
```bash
# 启动监视模式（已运行）
npm run watch

# 然后在 VSCode 中：
# 1. 按 F5
# 2. 选择 "Run Extension (No Build)"
```

---

## 🧪 启动后如何测试

### 1. 检查扩展是否加载
在新窗口中：
- 查看左侧活动栏是否有 Claude 图标
- 点击图标，应该能打开聊天面板

### 2. 测试基本对话
在聊天面板输入：
```
你好
```
应该能收到回复。

### 3. 测试新功能：bash_terminal

输入以下任一命令：

```
在终端执行 echo Hello
```
```
用终端查看当前目录
```
```
在终端运行 ls -la
```

**预期结果：**
- ✅ VSCode 终端面板自动打开
- ✅ 命令在终端中执行
- ✅ 可以看到输出
- ✅ 可以 Ctrl+C 中断

---

## 🐛 调试技巧

### 查看扩展日志
1. 在新窗口中，点击底部的 "Output" 标签
2. 在右侧下拉菜单中选择：
   - "Log Service" - 扩展日志
   - "Extension Host" - VSCode 扩展主机日志

### 打开开发者工具
- 按 `Cmd+Option+I`（Mac）或 `Ctrl+Shift+I`（Windows/Linux）
- 查看 Console 中的错误和日志

### 重新加载扩展
在新窗口中：
1. 按 `Cmd+R` 重新加载窗口
2. 或者在原窗口按 `Cmd+Shift+R` 重新启动调试

---

## 📋 检查清单

启动前确认：
- [ ] `dist/extension.cjs` 文件存在（已构建 ✅）
- [ ] `dist/media/` 目录存在（前端资源 ✅）
- [ ] npm run watch 正在运行（可选，用于开发）

启动后检查：
- [ ] 新窗口打开
- [ ] 左侧有 Claude 图标
- [ ] 聊天面板可以打开
- [ ] 可以发送消息
- [ ] bash_terminal 工具可用

---

## 💡 三种启动模式对比

| 模式 | 构建速度 | 适用场景 |
|------|---------|---------|
| **Run Extension (No Build)** ⭐ | 最快 | 快速测试，代码已构建 |
| Run Extension | 中等 | 首次启动，自动构建 |
| Run Extension (HMR) | 慢 | 前端开发，支持热更新 |

**推荐：现在使用 "Run Extension (No Build)"**

---

## ❓ 常见问题

### Q: 调试面板是空的？
**A:**
1. 确保在 VSCode 中打开了项目文件夹
2. 重新加载窗口（`Cmd+Shift+P` → "Reload Window"）
3. 检查 `.vscode/launch.json` 文件是否存在

### Q: 没有看到 "Run Extension (No Build)" 选项？
**A:**
1. 已添加到 launch.json
2. 重新加载 VSCode 窗口
3. 或者直接使用 "Run Extension"

### Q: 点击 F5 没反应？
**A:**
1. 确保编辑器焦点在代码文件上
2. 尝试从调试面板手动点击 ▶️
3. 查看 VSCode 底部状态栏是否有错误提示

### Q: 新窗口打开了但扩展没加载？
**A:**
1. 查看 Output 面板的错误信息
2. 确认 `dist/extension.cjs` 存在且是最新的
3. 尝试重新构建：`npm run build`

---

## 🎉 准备好了！

现在按 **F5** 或从调试面板选择 **"Run Extension (No Build)"** 开始测试吧！

祝测试顺利！🚀
