/**
 * API Key 存储诊断命令
 *
 * 用于诊断 SecretStorage、GlobalState 和文件存储问题
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IClaudeConfigService } from '../services/claudeConfigService';

// GlobalState 备用存储 key
const FALLBACK_API_KEY = 'xiong.apiKey.fallback';
const STORAGE_MODE_KEY = 'xiong.storageMode';

// 文件存储配置
const CONFIG_DIR = path.join(os.homedir(), '.claudix');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * 注册诊断命令
 */
export function registerDiagnoseApiKeyStorageCommand(
    context: vscode.ExtensionContext,
    claudeConfigService: IClaudeConfigService
): void {
    const disposable = vscode.commands.registerCommand(
        'xiong.diagnoseApiKeyStorage',
        async () => {
            await diagnoseApiKeyStorage(context, claudeConfigService);
        }
    );

    context.subscriptions.push(disposable);
}

/**
 * 执行诊断
 */
async function diagnoseApiKeyStorage(
    context: vscode.ExtensionContext,
    claudeConfigService: IClaudeConfigService
): Promise<void> {
    const results: string[] = [];
    const outputChannel = vscode.window.createOutputChannel('Dr. XIONG 诊断');

    outputChannel.show();
    outputChannel.appendLine('╔════════════════════════════════════════╗');
    outputChannel.appendLine('║     API Key 存储诊断报告                 ║');
    outputChannel.appendLine('╚════════════════════════════════════════╝');
    outputChannel.appendLine('');

    // 测试 1：SecretStorage 可用性
    outputChannel.appendLine('📋 测试 1：SecretStorage 可用性');
    outputChannel.appendLine('─────────────────────────────────────');
    let secretStorageAvailable = false;
    try {
        const TEST_KEY = 'xiong.diagnostic.test';
        const TEST_VALUE = 'test-value-' + Date.now();

        // 写入测试
        await context.secrets.store(TEST_KEY, TEST_VALUE);
        outputChannel.appendLine('  ✓ 写入测试通过');

        // 读取测试
        const readValue = await context.secrets.get(TEST_KEY);
        if (readValue === TEST_VALUE) {
            outputChannel.appendLine('  ✓ 读取测试通过');
            results.push('✓ SecretStorage 正常工作');
            secretStorageAvailable = true;
        } else {
            outputChannel.appendLine(`  ✗ 读取值不匹配: 期望 "${TEST_VALUE}", 实际 "${readValue}"`);
            results.push('✗ SecretStorage 读取异常');
        }

        // 删除测试
        await context.secrets.delete(TEST_KEY);
        outputChannel.appendLine('  ✓ 删除测试通过');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`  ✗ SecretStorage 测试失败: ${errorMsg}`);
        results.push(`✗ SecretStorage 不可用: ${errorMsg}`);
    }
    outputChannel.appendLine('');

    // 测试 1.5：备用存储 (GlobalState) 可用性
    outputChannel.appendLine('📋 测试 1.5：备用存储 (GlobalState) 可用性');
    outputChannel.appendLine('─────────────────────────────────────');
    try {
        const TEST_KEY = 'xiong.diagnostic.globalState.test';
        const TEST_VALUE = 'test-value-' + Date.now();

        await context.globalState.update(TEST_KEY, TEST_VALUE);
        outputChannel.appendLine('  ✓ GlobalState 写入测试通过');

        const readValue = context.globalState.get<string>(TEST_KEY);
        if (readValue === TEST_VALUE) {
            outputChannel.appendLine('  ✓ GlobalState 读取测试通过');
            results.push('✓ 备用存储 (GlobalState) 正常工作');
        } else {
            outputChannel.appendLine(`  ✗ GlobalState 读取值不匹配: 期望 "${TEST_VALUE}", 实际 "${readValue}"`);
            results.push('✗ 备用存储 (GlobalState) 读取异常');
        }

        // 清理
        await context.globalState.update(TEST_KEY, undefined);
        outputChannel.appendLine('  ✓ GlobalState 删除测试通过');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`  ✗ GlobalState 测试失败: ${errorMsg}`);
        results.push(`✗ 备用存储 (GlobalState) 不可用: ${errorMsg}`);
    }
    outputChannel.appendLine('');

    // 测试 2：当前存储模式
    outputChannel.appendLine('📋 测试 2：当前存储模式');
    outputChannel.appendLine('─────────────────────────────────────');
    const storageMode = context.globalState.get<string>(STORAGE_MODE_KEY) || 'secret';
    const hasFallbackKey = !!context.globalState.get<string>(FALLBACK_API_KEY);

    // 检查文件存储
    let hasFileConfig = false;
    let fileApiKeyExists = false;
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            hasFileConfig = true;
            const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const config = JSON.parse(content);
            fileApiKeyExists = !!config.apiKey;
        }
    } catch (error) {
        // 文件读取失败
    }

    outputChannel.appendLine(`  存储模式: ${storageMode === 'fallback' || storageMode === 'globalState' ? '备用存储 (GlobalState)' : storageMode === 'file' ? '文件存储' : 'SecretStorage'}`);
    outputChannel.appendLine(`  GlobalState 中有 API Key: ${hasFallbackKey ? '是' : '否'}`);
    outputChannel.appendLine(`  配置文件存在: ${hasFileConfig ? '是' : '否'} (${CONFIG_FILE})`);
    outputChannel.appendLine(`  配置文件中有 API Key: ${fileApiKeyExists ? '是' : '否'}`);
    results.push(`存储模式: ${storageMode}`);
    if (hasFileConfig) results.push(`✓ 配置文件存在: ${CONFIG_FILE}`);
    outputChannel.appendLine('');

    // 测试 3：API Key 读取
    outputChannel.appendLine('📋 测试 3：当前 API Key 配置');
    outputChannel.appendLine('─────────────────────────────────────');
    try {
        const apiKey = await claudeConfigService.getApiKey();
        if (apiKey) {
            outputChannel.appendLine(`  ✓ API Key 已配置 (长度: ${apiKey.length})`);
            results.push('✓ API Key 已配置');
        } else {
            outputChannel.appendLine('  ⚠ API Key 未配置');
            results.push('⚠ API Key 未配置');
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`  ✗ 读取 API Key 失败: ${errorMsg}`);
        results.push(`✗ 读取 API Key 失败: ${errorMsg}`);
    }
    outputChannel.appendLine('');

    // 测试 4：Base URL 配置
    outputChannel.appendLine('📋 测试 4：Base URL 配置');
    outputChannel.appendLine('─────────────────────────────────────');
    try {
        const baseUrl = await claudeConfigService.getBaseUrl();
        if (baseUrl) {
            outputChannel.appendLine(`  ✓ Base URL 已配置: ${baseUrl}`);
            results.push(`✓ Base URL: ${baseUrl}`);
        } else {
            outputChannel.appendLine('  ⚠ Base URL 未配置（将使用默认值）');
            results.push('⚠ Base URL 未配置');
        }
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`  ✗ 读取 Base URL 失败: ${errorMsg}`);
        results.push(`✗ 读取 Base URL 失败: ${errorMsg}`);
    }
    outputChannel.appendLine('');

    // 测试 5：VSCode 配置写入权限
    outputChannel.appendLine('📋 测试 5：VSCode 配置写入权限');
    outputChannel.appendLine('─────────────────────────────────────');
    try {
        const config = vscode.workspace.getConfiguration('xiong');
        const testKey = 'diagnosticTest';
        await config.update(testKey, 'test-value', vscode.ConfigurationTarget.Global);
        outputChannel.appendLine('  ✓ VSCode 配置写入正常');
        results.push('✓ VSCode 配置写入正常');

        // 清理
        await config.update(testKey, undefined, vscode.ConfigurationTarget.Global);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`  ✗ VSCode 配置写入失败: ${errorMsg}`);
        results.push(`✗ VSCode 配置写入失败: ${errorMsg}`);
    }
    outputChannel.appendLine('');

    // 测试 5.5：文件存储可用性
    outputChannel.appendLine('📋 测试 5.5：文件存储可用性');
    outputChannel.appendLine('─────────────────────────────────────');
    outputChannel.appendLine(`  配置目录: ${CONFIG_DIR}`);
    outputChannel.appendLine(`  配置文件: ${CONFIG_FILE}`);
    try {
        // 确保目录存在
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
            outputChannel.appendLine('  ✓ 配置目录创建成功');
        } else {
            outputChannel.appendLine('  ✓ 配置目录已存在');
        }

        // 测试写入
        const testFile = path.join(CONFIG_DIR, 'test.json');
        fs.writeFileSync(testFile, JSON.stringify({ test: true }), { mode: 0o600 });
        outputChannel.appendLine('  ✓ 文件写入测试通过');

        // 测试读取
        const content = fs.readFileSync(testFile, 'utf-8');
        const parsed = JSON.parse(content);
        if (parsed.test === true) {
            outputChannel.appendLine('  ✓ 文件读取测试通过');
            results.push('✓ 文件存储正常工作');
        } else {
            outputChannel.appendLine('  ✗ 文件读取值不匹配');
            results.push('✗ 文件存储读取异常');
        }

        // 清理
        fs.unlinkSync(testFile);
        outputChannel.appendLine('  ✓ 文件删除测试通过');
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        outputChannel.appendLine(`  ✗ 文件存储测试失败: ${errorMsg}`);
        results.push(`✗ 文件存储不可用: ${errorMsg}`);
    }
    outputChannel.appendLine('');

    // 测试 6：系统信息
    outputChannel.appendLine('📋 测试 6：系统信息');
    outputChannel.appendLine('─────────────────────────────────────');
    outputChannel.appendLine(`  平台: ${process.platform}`);
    outputChannel.appendLine(`  VSCode 版本: ${vscode.version}`);
    outputChannel.appendLine(`  Extension Mode: ${context.extensionMode}`);
    outputChannel.appendLine(`  全局状态存储路径: ${context.globalStorageUri.fsPath}`);
    outputChannel.appendLine('');

    // 诊断总结
    outputChannel.appendLine('╔════════════════════════════════════════╗');
    outputChannel.appendLine('║            诊断总结                     ║');
    outputChannel.appendLine('╚════════════════════════════════════════╝');
    outputChannel.appendLine('');

    for (const result of results) {
        outputChannel.appendLine(`  ${result}`);
    }
    outputChannel.appendLine('');

    // 提供建议
    outputChannel.appendLine('💡 建议：');
    outputChannel.appendLine('─────────────────────────────────────');

    const hasSecretStorageError = results.some(r => r.includes('SecretStorage') && r.includes('✗'));
    const hasGlobalStateError = results.some(r => r.includes('GlobalState') && r.includes('✗'));
    const hasFileStorageError = results.some(r => r.includes('文件存储') && r.includes('✗'));
    const hasApiKeyMissing = results.some(r => r.includes('API Key') && r.includes('未配置'));
    const usingFallback = storageMode === 'fallback' || storageMode === 'globalState';
    const usingFile = storageMode === 'file';

    if (hasSecretStorageError && hasGlobalStateError && hasFileStorageError) {
        outputChannel.appendLine('• ⚠️ 严重问题：所有存储方式都不可用！');
        outputChannel.appendLine('  - 请检查 VSCode 安装是否完整');
        outputChannel.appendLine('  - 检查用户目录权限');
        outputChannel.appendLine('  - 尝试重新安装 VSCode');
        outputChannel.appendLine('  - 请报告 bug: https://github.com/Haleclipse/Claudix/issues');
    } else if (hasSecretStorageError && hasGlobalStateError) {
        outputChannel.appendLine('• SecretStorage 和 GlobalState 不可用，使用文件存储：');
        outputChannel.appendLine(`  - API Key 将保存到: ${CONFIG_FILE}`);
        outputChannel.appendLine('  - 功能正常');
    } else if (hasSecretStorageError) {
        outputChannel.appendLine('• SecretStorage 不可用，但备用存储正常：');
        outputChannel.appendLine('  - API Key 将使用 GlobalState + 文件存储');
        outputChannel.appendLine('  - 功能正常');
        outputChannel.appendLine('  - 可选：修复 SecretStorage 以获得更好的安全性：');
        outputChannel.appendLine('    - macOS: 检查 "钥匙串访问" 中 VSCode 的权限');
        outputChannel.appendLine('    - Windows: 确保 VSCode 可以访问 "凭据管理器"');
        outputChannel.appendLine('    - Linux: 检查 libsecret 和 gnome-keychain 是否安装');
    } else if (usingFallback || usingFile) {
        outputChannel.appendLine('• 当前使用备用存储（之前 SecretStorage 不可用时自动切换）');
        outputChannel.appendLine('  - SecretStorage 现在可用，可尝试重新保存 API Key 进行迁移');
    } else if (hasApiKeyMissing) {
        outputChannel.appendLine('• API Key 未配置，请：');
        outputChannel.appendLine('  1. 打开设置页面（Command/Ctrl + Shift + P → "Dr. XIONG: 打开设置"）');
        outputChannel.appendLine('  2. 输入您的 API Key');
        outputChannel.appendLine('  3. 点击"保存"按钮');
    } else {
        outputChannel.appendLine('• 所有测试通过！系统配置正常。');
        outputChannel.appendLine(`• 存储位置：`);
        outputChannel.appendLine(`  - 主存储: SecretStorage (系统密钥链)`);
        outputChannel.appendLine(`  - 备用1: GlobalState`);
        outputChannel.appendLine(`  - 备用2: ${CONFIG_FILE}`);
        outputChannel.appendLine('• 如果仍有问题，请查看完整日志并报告 bug。');
    }
    outputChannel.appendLine('');

    // 显示通知
    const successCount = results.filter(r => r.includes('✓')).length;
    const errorCount = results.filter(r => r.includes('✗')).length;
    const warningCount = results.filter(r => r.includes('⚠')).length;

    let message = `诊断完成：${successCount} 个通过, ${errorCount} 个失败, ${warningCount} 个警告`;

    await vscode.window.showInformationMessage(
        message,
        '查看详细日志',
        '报告问题'
    ).then(selection => {
        if (selection === '查看详细日志') {
            outputChannel.show();
        } else if (selection === '报告问题') {
            vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/Haleclipse/Claudix/issues')
            );
        }
    });
}
