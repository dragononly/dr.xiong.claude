#!/bin/bash

echo "========================================"
echo "Dr. XIONG Claude 配置诊断工具"
echo "========================================"
echo ""

# 检查 ~/.claude/settings.json
echo "1. 检查 ~/.claude/settings.json"
SETTINGS_FILE="$HOME/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ]; then
    echo "   ✓ 文件存在: $SETTINGS_FILE"
    echo "   权限: $(ls -la "$SETTINGS_FILE" | awk '{print $1, $3, $4}')"
    
    # 提取 API Key（脱敏）
    API_KEY=$(grep -o '"ANTHROPIC_AUTH_TOKEN": "[^"]*"' "$SETTINGS_FILE" | cut -d'"' -f4)
    if [ -n "$API_KEY" ]; then
        KEY_LENGTH=${#API_KEY}
        MASKED_KEY="${API_KEY:0:4}****${API_KEY: -4}"
        echo "   ✓ API Key: $MASKED_KEY (长度: $KEY_LENGTH)"
    else
        echo "   ✗ 未找到 API Key"
    fi
    
    # 提取 Base URL
    BASE_URL=$(grep -o '"ANTHROPIC_BASE_URL": "[^"]*"' "$SETTINGS_FILE" | cut -d'"' -f4)
    if [ -n "$BASE_URL" ]; then
        echo "   ✓ Base URL: $BASE_URL"
    else
        echo "   - 未配置 Base URL（使用默认）"
    fi
else
    echo "   ✗ 文件不存在"
fi

echo ""

# 检查 VSCode 设置
echo "2. 检查 VSCode 用户设置"
case "$(uname -s)" in
    Darwin)
        VSCODE_SETTINGS="$HOME/Library/Application Support/Code/User/settings.json"
        ;;
    Linux)
        VSCODE_SETTINGS="$HOME/.config/Code/User/settings.json"
        ;;
    MINGW*|MSYS*|CYGWIN*)
        VSCODE_SETTINGS="$APPDATA/Code/User/settings.json"
        ;;
    *)
        VSCODE_SETTINGS="未知系统"
        ;;
esac

if [ -f "$VSCODE_SETTINGS" ]; then
    echo "   ✓ 文件存在: $VSCODE_SETTINGS"
    
    # 检查是否有 xiong 配置
    if grep -q '"xiong' "$VSCODE_SETTINGS"; then
        echo "   ✓ 找到 xiong 配置"
        grep -o '"xiong\.apiKey": "[^"]*"' "$VSCODE_SETTINGS" > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            echo "   ✓ xiong.apiKey 已配置"
        else
            echo "   ✗ xiong.apiKey 未配置"
        fi
    else
        echo "   - 未找到 xiong 配置"
    fi
else
    echo "   ✗ 文件不存在: $VSCODE_SETTINGS"
fi

echo ""
echo "========================================"
echo "建议"
echo "========================================"
echo ""
echo "如果配置保存失败，请尝试："
echo "1. 手动编辑 VSCode 设置（推荐）"
echo "   - 打开 VSCode 设置（Cmd+,）"
echo "   - 搜索 'xiong.apiKey'"
echo "   - 填入你的 API Key"
echo ""
echo "2. 手动编辑 ~/.claude/settings.json"
echo "   - 运行: code ~/.claude/settings.json"
echo "   - 添加: {\"env\": {\"ANTHROPIC_AUTH_TOKEN\": \"你的API Key\"}}"
echo ""
echo "3. 查看详细故障排查"
echo "   - 打开文件: docs/TROUBLESHOOTING.md"
echo ""
echo "========================================"
