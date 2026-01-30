/**
 * VSCode Extension Entry Point
 */

import * as vscode from 'vscode';
import { InstantiationServiceBuilder } from './di/instantiationServiceBuilder';
import { registerServices, ILogService, IClaudeAgentService, IWebViewService, IToolRegistry, IClaudeConfigService } from './services/serviceRegistry';
import { VSCodeTransport } from './services/claude/transport/VSCodeTransport';
import { WorkspaceInitService } from './services/WorkspaceInitService';
import { initializeBuiltinTools } from './services/toolInitializer';
import { registerDiagnoseApiKeyStorageCommand } from './commands/diagnoseApiKeyStorage';

/**
 * Extension Activation
 */
export function activate(context: vscode.ExtensionContext) {
	// 1. Create service builder
	const builder = new InstantiationServiceBuilder();

	// 2. Register all services
	registerServices(builder, context);

	// 3. Seal the builder and create DI container
	const instantiationService = builder.seal();

	// 4. Log activation and initialize tools
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('');
		logService.info('╔════════════════════════════════════════╗');
		logService.info('║         Claude Chat 扩展已激活           ║');
		logService.info('╚════════════════════════════════════════╝');
		logService.info('');

		// 初始化工作区配置文件
		const workspaceInitService = new WorkspaceInitService(logService);
		workspaceInitService.initialize();

		// 初始化内置工具
		const toolRegistry = accessor.get(IToolRegistry);
		initializeBuiltinTools(toolRegistry, logService);
	});

	// 5. Connect services
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		const webViewService = accessor.get(IWebViewService);
		const claudeAgentService = accessor.get(IClaudeAgentService);
		const claudeConfigService = accessor.get(IClaudeConfigService);
		const subscriptions = context.subscriptions;

		// 注册诊断命令
		registerDiagnoseApiKeyStorageCommand(context, claudeConfigService);
		logService.info('✓ API Key 存储诊断命令已注册');

		// 检查 API Key 是否配置（首次使用提示）
		import('./services/claudeConfigService').then(async ({ ClaudeConfigService }) => {
			const configService = new ClaudeConfigService();
			const apiKey = await configService.getApiKey();
			if (!apiKey) {
				logService.warn('[Extension] API Key 未配置，将在用户首次使用时提示');
			} else {
				logService.info('[Extension] ✓ API Key 已配置');
			}
		});

		// Register WebView View Provider
		const webviewProvider = vscode.window.registerWebviewViewProvider(
			'xiong.chatView',
			webViewService,
			{
				webviewOptions: {
					retainContextWhenHidden: true
				}
			}
		);

		// Connect WebView messages to Claude Agent Service
		webViewService.setMessageHandler((message) => {
			claudeAgentService.fromClient(message);
		});

		// Create VSCode Transport
		const transport = instantiationService.createInstance(VSCodeTransport);

		// Set transport on Claude Agent Service
		claudeAgentService.setTransport(transport);

		// Start message loop
		claudeAgentService.start();

		// 监听工作区变化事件
		const workspaceChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
			logService.info('[Extension] 工作区文件夹变化，通知 WebView');
			claudeAgentService.notifyWorkspaceChanged();
		});
		context.subscriptions.push(workspaceChangeDisposable);

		// Register disposables
		context.subscriptions.push(webviewProvider);
		context.subscriptions.push(
			vscode.commands.registerCommand('xiong.openSettings', async () => {
				await instantiationService.invokeFunction(accessorInner => {
					const webViewServiceInner = accessorInner.get(IWebViewService);
					const logServiceInner = accessorInner.get(ILogService);
					try {
						// Settings 页为单实例，不传 instanceId，使用 page 作为 key
						webViewServiceInner.openEditorPage('settings', 'Claudix Settings');
					} catch (error) {
						logServiceInner.error('[Command] 打开 Settings 页面失败', error);
					}
				});
			})
		);

		context.subscriptions.push(
			vscode.commands.registerCommand('xiong.openChatInEditor', async () => {
				await instantiationService.invokeFunction(accessorInner => {
					const webViewServiceInner = accessorInner.get(IWebViewService);
					const logServiceInner = accessorInner.get(ILogService);
					try {
						// 在编辑器区域打开聊天页面
						webViewServiceInner.openEditorPage('chat', 'Claude Chat');
					} catch (error) {
						logServiceInner.error('[Command] 打开 Chat 页面失败', error);
					}
				});
			})
		);

		logService.info('✓ Claude Agent Service 已连接 Transport');
		logService.info('✓ WebView Service 已注册为 View Provider');
		logService.info('✓ Settings 命令已注册');
		logService.info('✓ Open Chat in Editor 命令已注册');
	});

	// 6. Register commands
	const showChatCommand = vscode.commands.registerCommand('xiong.showChat', () => {
		vscode.commands.executeCommand('xiong.chatView.focus');
	});

	context.subscriptions.push(showChatCommand);

	// 7. Log completion
	instantiationService.invokeFunction(accessor => {
		const logService = accessor.get(ILogService);
		logService.info('✓ Claude Chat 视图已注册');
		logService.info('');
	});

	// Return extension API (if needed to expose to other extensions)
	return {
		getInstantiationService: () => instantiationService
	};
}

/**
 * Extension Deactivation
 */
export function deactivate() {
	// Clean up resources
}
