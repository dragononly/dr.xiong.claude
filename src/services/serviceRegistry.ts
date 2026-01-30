/**
 * Service Registry
 * Centralized registration of all services to the DI container
 */

import * as vscode from 'vscode';
import { SyncDescriptor } from '../di/descriptors';
import { IInstantiationServiceBuilder } from '../di/instantiationServiceBuilder';

// Import all services
import { ILogService, LogService } from './logService';
import { IConfigurationService, ConfigurationService } from './configurationService';
import { IFileSystemService, FileSystemService } from './fileSystemService';
import { IWorkspaceService, WorkspaceService } from './workspaceService';
import { ITabsAndEditorsService, TabsAndEditorsService } from './tabsAndEditorsService';
import { ITerminalService, TerminalService } from './terminalService';
import { ISSHService, SSHService } from './sshService';
import { ITelemetryService, TelemetryService, NullTelemetryService } from './telemetryService';
import { INotificationService, NotificationService } from './notificationService';
import { IDialogService, DialogService } from './dialogService';
import { IWebViewService, WebViewService } from './webViewService';

// Claude services
import { IClaudeSessionService, ClaudeSessionService } from './claude/ClaudeSessionService';
import { IClaudeAgentService, ClaudeAgentService } from './claude/ClaudeAgentService';
import { IClaudeSdkService, ClaudeSdkService } from './claude/ClaudeSdkService';
import { IClaudeConfigService, ClaudeConfigService } from './claudeConfigService';
import { LocalTodoService } from './LocalTodoService';

// AI Provider services
import { IAIProviderFactory, AIProviderFactory } from './ai/AIProviderFactory';

// New AI services
import { IClaudeApiClient, ClaudeApiClient } from './ai/ClaudeApiClient';
import { IGLMClient, GLMClient } from './ai/GLMClient';
import { IXiongGeminiService, XiongGeminiService } from './ai/XiongGeminiService';
import { IAgentCoordinator, AgentCoordinator } from './agent/AgentCoordinator';
import { IToolRegistry, ToolRegistry, getAllBuiltinTools } from '../tools';
import { IImagePreprocessingService, ImagePreprocessingService } from './ImagePreprocessingService';

/**
 * Register all services to the builder
 *
 * @param builder - Instantiation service builder
 * @param context - VSCode extension context
 */
export function registerServices(
	builder: IInstantiationServiceBuilder,
	context: vscode.ExtensionContext
): void {
	const isTestMode = context.extensionMode === vscode.ExtensionMode.Test;

	// Core services
	builder.define(ILogService, new SyncDescriptor(LogService));
	builder.define(IConfigurationService, new SyncDescriptor(ConfigurationService));
	builder.define(IFileSystemService, new SyncDescriptor(FileSystemService));

	// Workspace services
	builder.define(IWorkspaceService, new SyncDescriptor(WorkspaceService));
	builder.define(ITabsAndEditorsService, new SyncDescriptor(TabsAndEditorsService));
	builder.define(ITerminalService, new SyncDescriptor(TerminalService));
	builder.define(ISSHService, new SyncDescriptor(SSHService));

	// Extension services
	// Use Null implementation in test mode
	builder.define(ITelemetryService, isTestMode
		? new SyncDescriptor(NullTelemetryService)
		: new SyncDescriptor(TelemetryService)
	);
	builder.define(INotificationService, new SyncDescriptor(NotificationService));
	builder.define(IDialogService, new SyncDescriptor(DialogService));

	// WebView service
	builder.define(IWebViewService, new SyncDescriptor(WebViewService, [context]));

	// Claude services
	builder.define(IClaudeSessionService, new SyncDescriptor(ClaudeSessionService));
	builder.define(IClaudeConfigService, new SyncDescriptor(ClaudeConfigService));
	// Claude SDK service
	builder.define(IClaudeSdkService, new SyncDescriptor(ClaudeSdkService, [context]));

	// New AI services (self-contained, no Claude SDK dependency)
	// Must be defined before ClaudeAgentService which depends on them
	builder.define(IClaudeApiClient, new SyncDescriptor(ClaudeApiClient));
	builder.define(IGLMClient, new SyncDescriptor(GLMClient));
	builder.define(IXiongGeminiService, new SyncDescriptor(XiongGeminiService));
	builder.define(IToolRegistry, new SyncDescriptor(ToolRegistry));
	builder.define(IAgentCoordinator, new SyncDescriptor(AgentCoordinator));
	builder.define(IImagePreprocessingService, new SyncDescriptor(ImagePreprocessingService));

	// LocalTodoService - 需要手动创建实例并初始化
	const localTodoService = new LocalTodoService(context);
	localTodoService.initialize().catch(err => {
		console.error('[ServiceRegistry] Failed to initialize LocalTodoService:', err);
	});

	// ClaudeAgentService - main agent service
	builder.define(IClaudeAgentService, new SyncDescriptor(ClaudeAgentService, [localTodoService]));

	// AI Provider services
	builder.define(IAIProviderFactory, new SyncDescriptor(AIProviderFactory));
}

// Export all service interfaces for convenience
export {
	ILogService,
	IConfigurationService,
	IFileSystemService,
	IWorkspaceService,
	ITabsAndEditorsService,
	ITerminalService,
	ISSHService,
	ITelemetryService,
	INotificationService,
	IDialogService,
	IWebViewService,
	IClaudeSessionService,
	IClaudeAgentService,
	IClaudeSdkService,
	IClaudeConfigService,
	IAIProviderFactory,
	// New services
	IClaudeApiClient,
	IGLMClient,
	IXiongGeminiService,
	IToolRegistry,
	IAgentCoordinator,
	IImagePreprocessingService,
};
