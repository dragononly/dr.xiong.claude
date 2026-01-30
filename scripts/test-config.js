/**
 * 配置测试脚本
 * 用于验证 API Key 保存功能是否正常工作
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

console.log('====================================');
console.log('Claude 配置测试工具');
console.log('====================================\n');

// 1. 检查配置文件是否存在
console.log('1. 检查配置文件...');
if (fs.existsSync(SETTINGS_FILE)) {
  console.log('   ✓ 配置文件存在:', SETTINGS_FILE);
  
  // 读取配置
  const content = fs.readFileSync(SETTINGS_FILE, 'utf8');
  const settings = JSON.parse(content);
  
  console.log('\n2. 当前配置内容:');
  console.log('   ', JSON.stringify(settings, null, 2));
  
  // 检查 API Key
  if (settings.env && settings.env.ANTHROPIC_AUTH_TOKEN) {
    const key = settings.env.ANTHROPIC_AUTH_TOKEN;
    const maskedKey = key.length > 8 
      ? `${key.slice(0, 4)}****${key.slice(-4)}`
      : '****';
    console.log('\n3. API Key 状态:');
    console.log('   ✓ API Key 已配置');
    console.log('   脱敏显示:', maskedKey);
    console.log('   完整长度:', key.length, '字符');
  } else {
    console.log('\n3. API Key 状态:');
    console.log('   ✗ API Key 未配置');
  }
  
  // 检查 Base URL
  if (settings.env && settings.env.ANTHROPIC_BASE_URL) {
    console.log('\n4. Base URL 状态:');
    console.log('   ✓ Base URL 已配置:', settings.env.ANTHROPIC_BASE_URL);
  } else {
    console.log('\n4. Base URL 状态:');
    console.log('   - 使用默认: https://api.anthropic.com');
  }
  
} else {
  console.log('   ✗ 配置文件不存在');
  console.log('   路径:', SETTINGS_FILE);
  
  console.log('\n建议操作:');
  console.log('   1. 在 VSCode 中打开扩展设置');
  console.log('   2. 填写 API Key 并保存');
  console.log('   3. 或手动创建配置文件');
}

console.log('\n====================================');
console.log('测试完成');
console.log('====================================\n');

// 提供 VSCode 设置路径
const vscodeSettingsPath = path.join(os.homedir(), 'Library/Application Support/Code/User/settings.json');
console.log('VSCode 用户设置路径:');
console.log(' ', vscodeSettingsPath);
console.log('\n提示: 扩展会同时保存到两个位置:');
console.log('  1. VSCode 用户设置 (优先)');
console.log('  2. ~/.claude/settings.json (兼容)\n');
