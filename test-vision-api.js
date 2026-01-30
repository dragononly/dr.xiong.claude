#!/usr/bin/env node

/**
 * 测试图片识别功能
 * 
 * 这个脚本会创建一个简单的PNG图片，然后发送给Claude API测试视觉识别能力
 */

const fs = require('fs');
const path = require('path');

// 读取配置
function loadConfig() {
  const configPath = path.join(process.env.HOME, '.claude', 'config.json');
  try {
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.error('无法读取配置文件:', error.message);
    process.exit(1);
  }
}

// 将文件转换为base64
function fileToBase64(filePath) {
  const data = fs.readFileSync(filePath);
  return data.toString('base64');
}

// 主函数
async function main() {
  console.log('=== Claude 图片识别测试 ===\n');

  // 1. 读取测试图片
  const imagePath = '/tmp/test_image.png';
  console.log(`📸 读取测试图片: ${imagePath}`);
  
  if (!fs.existsSync(imagePath)) {
    console.error('❌ 测试图片不存在，请先创建图片');
    process.exit(1);
  }

  const imageBase64 = fileToBase64(imagePath);
  const imageStats = fs.statSync(imagePath);
  console.log(`✅ 图片大小: ${(imageStats.size / 1024).toFixed(2)} KB`);
  console.log(`✅ Base64 长度: ${imageBase64.length} 字符\n`);

  // 2. 加载配置
  const config = loadConfig();
  const baseUrl = config.apiBaseUrl || 'https://api.anthropic.com';
  const apiKey = config.apiKey;

  if (!apiKey) {
    console.error('❌ 未找到 API Key');
    process.exit(1);
  }

  console.log(`🔑 API Base URL: ${baseUrl}`);
  console.log(`🔑 使用模型: claude-sonnet-4-5-20250929\n`);

  // 3. 构建请求
  const requestPayload = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请详细描述这张图片的内容，包括颜色、形状、文字等所有细节。'
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: imageBase64
            }
          }
        ]
      }
    ]
  };

  console.log('📤 发送请求到 Claude API...');
  console.log('请求内容包括:');
  console.log('  - 文本提示: 描述图片内容');
  console.log('  - 图片附件: 200x200 PNG图片\n');

  try {
    // 4. 发送请求
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ API 请求失败 (${response.status}):`);
      console.error(errorText);
      process.exit(1);
    }

    // 5. 解析响应
    const data = await response.json();
    
    console.log('✅ API 请求成功!\n');
    console.log('=== Claude 的回复 ===\n');
    
    // 提取文本内容
    if (data.content && Array.isArray(data.content)) {
      const textBlocks = data.content.filter(block => block.type === 'text');
      textBlocks.forEach(block => {
        console.log(block.text);
      });
    }

    console.log('\n=== 测试结果统计 ===');
    console.log(`📊 输入 Tokens: ${data.usage?.input_tokens || 'N/A'}`);
    console.log(`📊 输出 Tokens: ${data.usage?.output_tokens || 'N/A'}`);
    console.log(`📊 总计 Tokens: ${data.usage?.input_tokens + data.usage?.output_tokens || 'N/A'}`);
    console.log(`🛑 停止原因: ${data.stop_reason || 'N/A'}`);

    // 判断测试是否成功
    const responseText = JSON.stringify(data.content);
    const hasVisionResponse = responseText.match(/(绿色|矩形|圆|文字|TEST|红|蓝|circle|rectangle|green|red|blue)/i);
    
    console.log('\n=== 测试结论 ===');
    if (hasVisionResponse) {
      console.log('✅ 测试成功！Claude 能够识别图片内容');
      console.log('   模型在响应中提到了图片的视觉元素');
    } else {
      console.log('⚠️  测试结果不确定');
      console.log('   请检查上方的 Claude 回复是否准确描述了图片');
    }

  } catch (error) {
    console.error('❌ 请求过程中出错:', error.message);
    process.exit(1);
  }
}

// 运行测试
main().catch(error => {
  console.error('未捕获的错误:', error);
  process.exit(1);
});
