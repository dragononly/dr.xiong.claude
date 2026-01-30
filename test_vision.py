#!/usr/bin/env python3
"""
图片识别功能测试脚本

直接调用 Claude API 测试视觉能力
"""

import base64
import json
import os
import sys
from pathlib import Path

# 配置
CONFIG_PATH = Path.home() / '.claude' / 'config.json'
TEST_IMAGE = '/tmp/test_vision.png'
API_URL = 'https://api.anthropic.com/v1/messages'


def load_config():
    """加载配置文件"""
    if not CONFIG_PATH.exists():
        print(f"❌ 配置文件不存在: {CONFIG_PATH}")
        sys.exit(1)
    
    with open(CONFIG_PATH) as f:
        config = json.load(f)
    
    # 尝试从不同位置获取 API Key
    api_key = config.get('apiKey') or config.get('primaryApiKey')
    if not api_key or api_key == 'any':
        print("❌ 未配置有效的 API Key")
        print("请编辑配置文件设置正确的 apiKey")
        sys.exit(1)
    
    base_url = config.get('apiBaseUrl', 'https://api.anthropic.com')
    return api_key, base_url


def encode_image(image_path):
    """将图片编码为 base64"""
    if not Path(image_path).exists():
        print(f"❌ 测试图片不存在: {image_path}")
        print("请先运行 ./create-test-image.sh 创建测试图片")
        sys.exit(1)
    
    with open(image_path, 'rb') as f:
        return base64.b64encode(f.read()).decode('utf-8')


def test_vision_api():
    """测试视觉 API"""
    print("=" * 60)
    print("Claude 图片识别功能测试")
    print("=" * 60)
    print()
    
    # 1. 加载配置
    print("📋 加载配置...")
    api_key, base_url = load_config()
    print(f"✅ API URL: {base_url}")
    print(f"✅ API Key: {api_key[:20]}...{api_key[-10:]}")
    print()
    
    # 2. 编码图片
    print("📸 编码测试图片...")
    image_base64 = encode_image(TEST_IMAGE)
    print(f"✅ 图片路径: {TEST_IMAGE}")
    print(f"✅ Base64 长度: {len(image_base64)} 字符")
    print()
    
    # 3. 构建请求
    request_data = {
        "model": "claude-sonnet-4-5-20250929",
        "max_tokens": 1024,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": "请详细描述这张图片的内容，包括颜色、形状、文字等所有细节。"
                    },
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/png",
                            "data": image_base64
                        }
                    }
                ]
            }
        ]
    }
    
    print("📤 发送请求到 Claude API...")
    print(f"模型: {request_data['model']}")
    print(f"Max Tokens: {request_data['max_tokens']}")
    print()
    
    # 4. 发送请求
    try:
        import urllib.request
        import urllib.error
        
        req = urllib.request.Request(
            f"{base_url}/v1/messages",
            data=json.dumps(request_data).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}',
                'anthropic-version': '2023-06-01'
            }
        )
        
        with urllib.request.urlopen(req, timeout=30) as response:
            response_data = json.loads(response.read().decode('utf-8'))
            
    except urllib.error.HTTPError as e:
        print(f"❌ HTTP 错误: {e.code}")
        print(f"响应: {e.read().decode('utf-8')}")
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"❌ 网络错误: {e.reason}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 请求失败: {e}")
        sys.exit(1)
    
    # 5. 解析响应
    print("✅ API 请求成功!\n")
    print("=" * 60)
    print("Claude 的回复")
    print("=" * 60)
    print()
    
    # 提取文本内容
    text_content = []
    if 'content' in response_data:
        for block in response_data['content']:
            if block.get('type') == 'text':
                text_content.append(block['text'])
    
    print('\n'.join(text_content))
    print()
    
    # 6. 统计信息
    print("=" * 60)
    print("测试结果统计")
    print("=" * 60)
    usage = response_data.get('usage', {})
    print(f"📊 输入 Tokens: {usage.get('input_tokens', 'N/A')}")
    print(f"📊 输出 Tokens: {usage.get('output_tokens', 'N/A')}")
    print(f"📊 总计 Tokens: {usage.get('input_tokens', 0) + usage.get('output_tokens', 0)}")
    print(f"🛑 停止原因: {response_data.get('stop_reason', 'N/A')}")
    print()
    
    # 7. 评估结果
    print("=" * 60)
    print("测试结论")
    print("=" * 60)
    
    response_text = '\n'.join(text_content).lower()
    
    # 检查关键词
    keywords = {
        '绿色': 'green',
        '红色': 'red',
        '蓝色': 'blue',
        '圆': 'circle',
        '矩形': 'rectangle',
        '文字': 'text',
        'test': 'test'
    }
    
    found_keywords = []
    for cn, en in keywords.items():
        if cn in response_text or en in response_text:
            found_keywords.append(cn)
    
    if found_keywords:
        print(f"✅ 测试成功！Claude 能够识别图片内容")
        print(f"   识别到的元素: {', '.join(found_keywords)}")
        return 0
    else:
        print("⚠️  测试结果不确定")
        print("   模型响应中没有明显的图片元素描述")
        print("   请手动检查上方的 Claude 回复")
        return 1


if __name__ == '__main__':
    try:
        exit_code = test_vision_api()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n⚠️  测试被中断")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 未捕获的错误: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
