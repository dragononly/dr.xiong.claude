#!/bin/bash

# Dr-XIONG Claude 扩展启动脚本

echo "============================================================"
echo "🚀 Dr-XIONG Claude 扩展启动器"
echo "============================================================"
echo ""

# 检查构建状态
if [ ! -f "dist/extension.cjs" ]; then
    echo "📦 扩展未构建，正在构建..."
    npm run build
    if [ $? -ne 0 ]; then
        echo "❌ 构建失败！"
        exit 1
    fi
    echo "✅ 构建完成！"
    echo ""
fi

echo "选择启动方式："
echo ""
echo "1) 🔧 调试模式 (F5) - 推荐用于开发"
echo "   - 打开新的 Extension Development Host 窗口"
echo "   - 支持断点调试"
echo "   - 自动重新加载"
echo ""
echo "2) 📦 打包扩展 (生成 .vsix)"
echo "   - 创建可安装的扩展包"
echo "   - 可以分享或安装到其他 VSCode"
echo ""
echo "3) 🔄 仅重新加载当前窗口"
echo "   - 快速测试更改"
echo "   - 不打开新窗口"
echo ""
echo "4) 🚀 开发模式 (HMR)"
echo "   - WebView 热更新"
echo "   - 前端更改自动刷新"
echo ""
read -p "请选择 (1-4): " choice

case $choice in
    1)
        echo ""
        echo "🔧 启动调试模式..."
        echo "请按以下步骤操作："
        echo "  1. 在 VSCode 中按 F5"
        echo "  2. 或点击左侧 Run and Debug 面板"
        echo "  3. 选择 'Run Extension' 并点击 ▶️"
        echo ""
        echo "✨ 提示：调试时使用 Ctrl+Shift+I 打开开发者工具"
        ;;
    2)
        echo ""
        echo "📦 开始打包扩展..."
        npm run prepackage && npm run package
        if [ $? -eq 0 ]; then
            echo ""
            echo "✅ 打包完成！"
            echo "📁 .vsix 文件位置："
            ls -lh claude-dr-xiong-*.vsix
            echo ""
            echo "安装方法："
            echo "  1. 在 VSCode 中按 Cmd+Shift+P"
            echo "  2. 输入 'Install from VSIX'"
            echo "  3. 选择生成的 .vsix 文件"
        fi
        ;;
    3)
        echo ""
        echo "🔄 重新加载扩展..."
        echo "请在 VSCode 中按 Cmd+Shift+P，然后输入 'Reload Window'"
        ;;
    4)
        echo ""
        echo "🚀 启动开发模式 (HMR)..."
        echo "请按以下步骤操作："
        echo "  1. 在 VSCode 中按 F5"
        echo "  2. 或点击左侧 Run and Debug 面板"
        echo "  3. 选择 'Run Extension (HMR)' 并点击 ▶️"
        echo ""
        echo "✨ 优势：前端更改会自动刷新，无需重启扩展！"
        ;;
    *)
        echo "❌ 无效选择"
        exit 1
        ;;
esac

echo ""
echo "============================================================"
echo "📝 测试新功能：bash_terminal"
echo "============================================================"
echo ""
echo "扩展启动后，可以尝试以下对话："
echo ""
echo "  • '在终端执行 echo Hello'"
echo "  • '用终端查看当前目录的文件'"
echo "  • '在终端运行 npm install'"
echo "  • '帮我构建项目，在终端执行'"
echo ""
echo "💡 提示：使用 bash_terminal 工具的命令会"
echo "   在 VSCode 终端中执行，你可以："
echo "   - 实时查看输出"
echo "   - 随时 Ctrl+C 中断"
echo "   - 手动输入其他命令"
echo ""
echo "============================================================"
