#!/bin/bash

# 图片识别测试脚本
# 创建一个简单的测试图片并转换为base64

echo "=== 创建测试图片 ==="

# 创建一个简单的PNG图片（使用ImageMagick）
convert -size 200x200 xc:white \
  -fill '#4CAF50' -draw 'rectangle 10,10 190,190' \
  -fill white -pointsize 24 -annotate +100+100 'TEST' \
  -fill '#FF5722' -draw 'circle 50,50 50,80' \
  -fill '#2196F3' -draw 'circle 150,150 150,180' \
  -fill white -draw 'line 50,50 150,150' \
  /tmp/test_vision.png 2>/dev/null

if [ ! -f /tmp/test_vision.png ]; then
    echo "❌ 无法创建测试图片，请确认已安装 ImageMagick"
    echo "   安装方法: brew install imagemagick"
    exit 1
fi

echo "✅ 测试图片已创建: /tmp/test_vision.png"

# 转换为base64
echo ""
echo "=== 转换为 Base64 ==="
BASE64_DATA=$(base64 -i /tmp/test_vision.png)
echo "✅ Base64 长度: ${#BASE64_DATA} 字符"

# 保存base64数据
echo "$BASE64_DATA" > /tmp/test_vision_base64.txt
echo "✅ Base64 数据已保存到: /tmp/test_vision_base64.txt"

# 显示图片信息
echo ""
echo "=== 图片信息 ==="
file /tmp/test_vision.png
ls -lh /tmp/test_vision.png

echo ""
echo "=== 测试说明 ==="
echo "现在你可以使用以下方式测试图片识别："
echo ""
echo "1. 在VSCode扩展中粘贴图片 /tmp/test_vision.png"
echo "2. 询问模型: '请描述这张图片的内容'"
echo ""
echo "图片内容说明:"
echo "  - 背景: 200x200 像素"
echo "  - 绿色大矩形框 (边框到边缘)"
echo "  - 中间白色文字 'TEST'"
echo "  - 左上角红色圆形"
echo "  - 右下角蓝色圆形"
echo "  - 白色线条连接两个圆"
echo ""
echo "如果模型能准确描述这些元素，说明图片识别功能正常工作。"
