/**
 * ClaudeAgentService - Claude Agent 核心编排服务
 *
 * 职责：
 * 1. 管理多个 Claude 会话（channels）
 * 2. 接收和分发来自 Transport 的消息
 * 3. 启动和控制 Claude 会话（launchClaude, interruptClaude）
 * 4. 路由请求到对应的 handlers
 * 5. RPC 请求-响应管理
 *
 * 依赖：
 * - IClaudeSdkService: SDK 调用
 * - IClaudeSessionService: 会话历史
 * - ILogService: 日志
 * - 其他基础服务
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IWorkspaceService } from '../workspaceService';
import { IFileSystemService } from '../fileSystemService';
import { INotificationService } from '../notificationService';
import { ITerminalService } from '../terminalService';
import { ISSHService } from '../sshService';
import { ITabsAndEditorsService } from '../tabsAndEditorsService';
import { IClaudeSdkService } from './ClaudeSdkService';
import { IClaudeSessionService } from './ClaudeSessionService';
import { AsyncStream, ITransport } from './transport';
import { HandlerContext } from './handlers/types';
import { IWebViewService } from '../webViewService';
import { IClaudeConfigService } from '../claudeConfigService';

// 消息类型导入
import type {
    WebViewToExtensionMessage,
    ExtensionToWebViewMessage,
    RequestMessage,
    ResponseMessage,
    ExtensionRequest,
    ToolPermissionRequest,
    ToolPermissionResponse,
} from '../../shared/messages';

// SDK 类型导入
import type {
    SDKMessage,
    SDKUserMessage,
    Query,
    PermissionResult,
    PermissionUpdate,
    CanUseTool,
    PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';

// Handlers 导入
import {
    handleInit,
    handleGetClaudeState,
    handleGetMcpServers,
    handleGetAssetUris,
    handleOpenFile,
    handleGetCurrentSelection,
    handleShowNotification,
    handleNewConversationTab,
    handleRenameTab,
    handleOpenDiff,
    handleListSessions,
    handleGetSession,
    handleExec,
    handleListFiles,
    handleStatPath,
    handleOpenContent,
    handleOpenURL,
    handleOpenConfigFile,
    handleWriteFile,
    handleGetClaudeConfig,
    handleSetApiKey,
    handleSetBaseUrl,
    handleGetSubscription,
    handleGetUsage,
    // handleOpenClaudeInTerminal,
    // handleGetAuthStatus,
    // handleLogin,
    // handleSubmitOAuthCode,
} from './handlers/handlers';

// SSH Handlers 导入
import {
    handleSSHConnect,
    handleSSHCommand,
    handleSSHDisconnect,
    handleSSHGetOutput,
    handleSSHListSessions,
} from './handlers/sshHandlers';

/**
 * 模型名称映射表
 *
 * 将 UI 中的简短模型 ID 映射为 Anthropic API 兼容的完整模型 ID
 */
const MODEL_NAME_MAPPING: Record<string, string> = {
    // UI 模型 ID -> Anthropic API 完整模型 ID
    'claude-opus-4-5': 'claude-opus-4-5-20251101',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
};

export const IClaudeAgentService = createDecorator<IClaudeAgentService>('claudeAgentService');

// ============================================================================
// 类型定义
// ============================================================================

/**
 * Channel 对象：管理单个 Claude 会话
 */
export interface Channel {
    in: AsyncStream<SDKUserMessage>;  // 输入流：向 SDK 发送用户消息
    query: Query;                     // Query 对象：从 SDK 接收响应
}

/**
 * 请求处理器
 */
interface RequestHandler {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
}

/**
 * Claude Agent 服务接口
 */
export interface IClaudeAgentService {
    readonly _serviceBrand: undefined;

    /**
     * 设置 Transport
     */
    setTransport(transport: ITransport): void;

    /**
     * 启动消息循环
     */
    start(): void;

    /**
     * 接收来自客户端的消息
     */
    fromClient(message: WebViewToExtensionMessage): Promise<void>;

    /**
     * 启动 Claude 会话
     */
    launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string,
        thinkingLevel: string | null
    ): Promise<void>;

    /**
     * 中断 Claude 会话
     */
    interruptClaude(channelId: string): Promise<void>;

    /**
     * 关闭会话
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): void;

    /**
     * 关闭所有会话
     */
    closeAllChannels(): Promise<void>;

    /**
     * 凭证变更时关闭所有通道
     */
    closeAllChannelsWithCredentialChange(): Promise<void>;

    /**
     * 处理请求
     */
    processRequest(request: RequestMessage, signal: AbortSignal): Promise<unknown>;

    /**
     * 设置权限模式
     */
    setPermissionMode(channelId: string, mode: PermissionMode): Promise<void>;

    /**
     * 设置 Thinking Level
     */
    setThinkingLevel(channelId: string, level: string): Promise<void>;

    /**
     * 设置模型
     */
    setModel(channelId: string, model: string): Promise<void>;

    /**
     * 通知工作区变化
     */
    notifyWorkspaceChanged(): void;

    /**
     * 关闭
     */
    shutdown(): Promise<void>;
}

// ============================================================================
// ClaudeAgentService 实现
// ============================================================================

/**
 * Claude Agent 服务实现
 */
export class ClaudeAgentService implements IClaudeAgentService {
    readonly _serviceBrand: undefined;

    // Transport 适配器
    private transport?: ITransport;

    // 会话管理
    private channels = new Map<string, Channel>();

    // 接收来自客户端的消息流
    private fromClientStream = new AsyncStream<WebViewToExtensionMessage>();

    // 等待响应的请求
    private outstandingRequests = new Map<string, RequestHandler>();

    // 取消控制器
    private abortControllers = new Map<string, AbortController>();

    // Handler 上下文（缓存）
    private handlerContext: HandlerContext;

    // Thinking Level 配置
    private thinkingLevel: string = 'off';

    // 每个 channel 的权限模式（用于 YOLO 模式判断）
    private channelPermissionModes = new Map<string, string>();

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IWorkspaceService private readonly workspaceService: IWorkspaceService,
        @IFileSystemService private readonly fileSystemService: IFileSystemService,
        @INotificationService private readonly notificationService: INotificationService,
        @ITerminalService private readonly terminalService: ITerminalService,
        @ISSHService private readonly sshService: ISSHService,
        @ITabsAndEditorsService private readonly tabsAndEditorsService: ITabsAndEditorsService,
        @IClaudeSdkService private readonly sdkService: IClaudeSdkService,
        @IClaudeSessionService private readonly sessionService: IClaudeSessionService,
        @IWebViewService private readonly webViewService: IWebViewService,
        @IClaudeConfigService private readonly claudeConfigService: IClaudeConfigService
    ) {
        // 构建 Handler 上下文
        this.handlerContext = {
            logService: this.logService,
            configService: this.configService,
            workspaceService: this.workspaceService,
            fileSystemService: this.fileSystemService,
            notificationService: this.notificationService,
            terminalService: this.terminalService,
            sshService: this.sshService,
            tabsAndEditorsService: this.tabsAndEditorsService,
            sessionService: this.sessionService,
            sdkService: this.sdkService,
            agentService: this,  // 自身引用
            webViewService: this.webViewService,
            claudeConfigService: this.claudeConfigService,
        };
    }

    /**
     * 设置 Transport
     */
    setTransport(transport: ITransport): void {
        this.transport = transport;

        // 监听来自客户端的消息，推入队列
        transport.onMessage(async (message) => {
            await this.fromClient(message);
        });

        this.logService.info('[ClaudeAgentService] Transport 已连接');
    }

    /**
     * 启动消息循环
     */
    start(): void {
        // 启动消息循环
        this.readFromClient();

        this.logService.info('[ClaudeAgentService] 消息循环已启动');
    }

    /**
     * 接收来自客户端的消息
     */
    async fromClient(message: WebViewToExtensionMessage): Promise<void> {
        this.fromClientStream.enqueue(message);
    }

    /**
     * 从客户端读取并分发消息
     */
    private async readFromClient(): Promise<void> {
        try {
            for await (const message of this.fromClientStream) {
                switch (message.type) {
                    case "launch_claude":
                        await this.launchClaude(
                            message.channelId,
                            message.resume || null,
                            message.cwd || this.getCwd(),
                            message.model || null,
                            message.permissionMode || "acceptEdits",
                            message.thinkingLevel || null
                        );
                        break;

                    case "close_channel":
                        this.closeChannel(message.channelId, false);
                        break;

                    case "interrupt_claude":
                        await this.interruptClaude(message.channelId);
                        break;

                    case "io_message":
                        this.transportMessage(
                            message.channelId,
                            message.message,
                            message.done
                        );
                        break;

                    case "request":
                        this.handleRequest(message);
                        break;

                    case "response":
                        this.handleResponse(message);
                        break;

                    case "cancel_request":
                        this.handleCancellation(message.targetRequestId);
                        break;

                    default:
                        this.logService.error(`Unknown message type: ${(message as { type: string }).type}`);
                }
            }
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] Error in readFromClient: ${error}`);
        }
    }

    /**
     * 启动 Claude 会话
     */
    async launchClaude(
        channelId: string,
        resume: string | null,
        cwd: string,
        model: string | null,
        permissionMode: string,
        thinkingLevel: string | null
    ): Promise<void> {
        // 保存 thinkingLevel
        if (thinkingLevel) {
            this.thinkingLevel = thinkingLevel;
        }

        // 计算 maxThinkingTokens
        const maxThinkingTokens = this.getMaxThinkingTokens(this.thinkingLevel);

        const providerName = 'Claude';

        this.logService.info('');
        this.logService.info('╔════════════════════════════════════════╗');
        this.logService.info(`║  启动 ${providerName} 会话                       ║`);
        this.logService.info('╚════════════════════════════════════════╝');
        this.logService.info(`  Channel ID: ${channelId}`);
        this.logService.info(`  Resume: ${resume || 'null'}`);
        this.logService.info(`  CWD: ${cwd}`);
        this.logService.info(`  Model: ${model || 'null'}`);
        this.logService.info(`  Permission: ${permissionMode}`);
        this.logService.info(`  Thinking Level: ${this.thinkingLevel}`);
        this.logService.info(`  Max Thinking Tokens: ${maxThinkingTokens}`);
        this.logService.info('');

        // 检查是否已存在
        if (this.channels.has(channelId)) {
            this.logService.error(`❌ Channel 已存在: ${channelId}`);
            throw new Error(`Channel already exists: ${channelId}`);
        }

        try {
            // 1. 创建输入流
            this.logService.info('📝 步骤 1: 创建输入流');
            const inputStream = new AsyncStream<SDKUserMessage>();
            this.logService.info('  ✓ 输入流创建完成');

            // 记录 channel 的权限模式
            this.channelPermissionModes.set(channelId, permissionMode);

            // 2. 启动 Claude 会话
            this.logService.info('');
            this.logService.info(`📝 步骤 2: 调用 spawn${providerName}()`);

            const query = await this.spawnClaude(
                inputStream,
                resume,
                async (toolName, input, options) => {
                    // 工具权限回调
                    this.logService.info(`🔧 工具权限请求: ${toolName}`);

                    // 获取当前 channel 的权限模式（可能已被用户切换）
                    const currentMode = this.channelPermissionModes.get(channelId) || permissionMode;

                    // YOLO 模式：Agent 模式下自动允许所有工具调用
                    if (currentMode === 'acceptEdits') {
                        this.logService.info(`  ✓ YOLO 模式：自动允许 ${toolName}`);
                        return {
                            behavior: 'allow' as const,
                            updatedInput: input,
                            updatedPermissions: options.suggestions || []
                        };
                    }

                    // 其他模式：通过 RPC 请求 WebView 确认
                    return this.requestToolPermission(
                        channelId,
                        toolName,
                        input,
                        options.suggestions || []
                    );
                },
                model,
                cwd,
                permissionMode,
                maxThinkingTokens
            );
            this.logService.info(`  ✓ spawn${providerName}() 完成，Query 对象已创建`);

            // 3. 存储到 channels Map
            this.logService.info('');
            this.logService.info('📝 步骤 3: 注册 Channel');
            this.channels.set(channelId, {
                in: inputStream,
                query: query
            });
            this.logService.info(`  ✓ Channel 已注册，当前 ${this.channels.size} 个活跃会话`);

            // 4. 启动监听任务：将 SDK 输出转发给客户端
            this.logService.info('');
            this.logService.info('📝 步骤 4: 启动消息转发循环');
            (async () => {
                try {
                    this.logService.info(`  → 开始监听 Query 输出...`);
                    let messageCount = 0;

                    for await (const message of query) {
                        messageCount++;
                        this.logService.info(`  ← 收到消息 #${messageCount}: ${(message as any).type}`);

                        this.transport!.send({
                            type: "io_message",
                            channelId,
                            message: message as SDKMessage,
                            done: false
                        });
                    }

                    // 正常结束
                    this.logService.info(`  ✓ Query 输出完成，共 ${messageCount} 条消息`);
                    this.closeChannel(channelId, true);
                } catch (error) {
                    // 出错
                    this.logService.error(`  ❌ Query 输出错误: ${error}`);
                    if (error instanceof Error) {
                        this.logService.error(`     Stack: ${error.stack}`);
                    }

                    // 无论什么错误，都关闭 Channel
                    // 因为 Query 的异步迭代器已经失效，无法继续使用
                    this.closeChannel(channelId, true, String(error));
                }
            })();

            this.logService.info('');
            this.logService.info(`✓ ${providerName} 会话启动成功`);
            this.logService.info('════════════════════════════════════════');
            this.logService.info('');
        } catch (error) {
            this.logService.error('');
            this.logService.error(`❌❌❌ ${providerName} 会话启动失败 ❌❌❌`);
            this.logService.error(`Channel: ${channelId}`);
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('════════════════════════════════════════');
            this.logService.error('');

            this.closeChannel(channelId, true, String(error));
            throw error;
        }
    }

    /**
     * 中断 Claude 会话
     */
    async interruptClaude(channelId: string): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[ClaudeAgentService] Channel 不存在: ${channelId}`);
            return;
        }

        try {
            await this.sdkService.interrupt(channel.query as Query);
            this.logService.info(`[ClaudeAgentService] 已中断 Channel: ${channelId}`);
        } catch (error) {
            this.logService.error(`[ClaudeAgentService] 中断失败:`, error);
        }
    }

    /**
     * 关闭会话
     */
    closeChannel(channelId: string, sendNotification: boolean, error?: string): void {
        this.logService.info(`[ClaudeAgentService] 关闭 Channel: ${channelId}`);

        // 1. 发送关闭通知
        if (sendNotification && this.transport) {
            this.transport.send({
                type: "close_channel",
                channelId,
                error
            });
        }

        // 2. 清理 channel
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.in.done();
            try {
                channel.query.return?.();
            } catch (e) {
                this.logService.warn(`Error cleaning up channel: ${e}`);
            }
            this.channels.delete(channelId);
        }

        // 3. 清理权限模式记录
        this.channelPermissionModes.delete(channelId);

        this.logService.info(`  ✓ Channel 已关闭，剩余 ${this.channels.size} 个活跃会话`);
    }

    /**
     * 启动 Claude SDK
     *
     * @param inputStream 输入流，用于发送用户消息
     * @param resume 恢复会话 ID
     * @param canUseTool 工具权限回调
     * @param model 模型名称
     * @param cwd 工作目录
     * @param permissionMode 权限模式
     * @param maxThinkingTokens 最大思考 tokens
     * @returns SDK Query 对象
     */
    protected async spawnClaude(
        inputStream: AsyncStream<SDKUserMessage>,
        resume: string | null,
        canUseTool: CanUseTool,
        model: string | null,
        cwd: string,
        permissionMode: string,
        maxThinkingTokens: number
    ): Promise<Query> {
        return this.sdkService.query({
            inputStream,
            resume,
            canUseTool,
            model,
            cwd,
            permissionMode,
            maxThinkingTokens
        });
    }


    /**
     * 关闭所有会话
     */
    async closeAllChannels(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, false)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * 凭证变更时关闭所有通道
     */
    async closeAllChannelsWithCredentialChange(): Promise<void> {
        const promises = Array.from(this.channels.keys()).map(channelId =>
            this.closeChannel(channelId, true)
        );
        await Promise.all(promises);
        this.channels.clear();
    }

    /**
     * 传输消息到 Channel
     */
    private transportMessage(
        channelId: string,
        message: SDKMessage | SDKUserMessage,
        done: boolean
    ): void {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`Channel not found: ${channelId}`);
        }

        // 用户消息加入输入流
        if (message.type === "user") {
            channel.in.enqueue(message as SDKUserMessage);
        }

        // 如果标记为结束，关闭输入流
        if (done) {
            channel.in.done();
        }
    }

    /**
     * 处理来自客户端的请求
     */
    private async handleRequest(message: RequestMessage): Promise<void> {
        const abortController = new AbortController();
        this.abortControllers.set(message.requestId, abortController);

        try {
            const response = await this.processRequest(message, abortController.signal);
            this.transport!.send({
                type: "response",
                requestId: message.requestId,
                response
            });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.transport!.send({
                type: "response",
                requestId: message.requestId,
                response: {
                    type: "error",
                    error: errorMsg
                }
            });
        } finally {
            this.abortControllers.delete(message.requestId);
        }
    }

    /**
     * 处理请求
     */
    async processRequest(message: RequestMessage, signal: AbortSignal): Promise<unknown> {
        const request = message.request;
        const channelId = message.channelId;

        if (!request || typeof request !== 'object' || !('type' in request)) {
            throw new Error('Invalid request format');
        }

        this.logService.info(`[ClaudeAgentService] 处理请求: ${request.type}`);

        // 路由表：将请求类型映射到 handler
        switch (request.type) {
            // 初始化和状态
            case "init":
                return handleInit(request, this.handlerContext);

            case "get_claude_state":
                return handleGetClaudeState(request, this.handlerContext);

            case "get_mcp_servers":
                return handleGetMcpServers(request, this.handlerContext, channelId);

            case "get_asset_uris":
                return handleGetAssetUris(request, this.handlerContext);

            // 编辑器操作
            case "open_file":
                return handleOpenFile(request, this.handlerContext);

            case "get_current_selection":
                return handleGetCurrentSelection(this.handlerContext);

            case "open_diff":
                return handleOpenDiff(request, this.handlerContext, signal);

            case "open_content":
                return handleOpenContent(request, this.handlerContext, signal);

            // UI 操作
            case "show_notification":
                return handleShowNotification(request, this.handlerContext);

            case "new_conversation_tab":
                return handleNewConversationTab(request, this.handlerContext);

            case "rename_tab":
                return handleRenameTab(request, this.handlerContext);

            case "open_url":
                return handleOpenURL(request, this.handlerContext);

            // 设置
            case "set_permission_mode": {
                if (!channelId) {
                    throw new Error('channelId is required for set_permission_mode');
                }
                const permReq = request as any;
                await this.setPermissionMode(channelId, permReq.mode);
                return {
                    type: "set_permission_mode_response",
                    success: true
                };
            }

            case "set_model": {
                if (!channelId) {
                    throw new Error('channelId is required for set_model');
                }
                const modelReq = request as any;
                const targetModel = modelReq.model?.value ?? "";
                if (!targetModel) {
                    throw new Error("Invalid model selection");
                }
                await this.setModel(channelId, targetModel);
                return {
                    type: "set_model_response",
                    success: true
                };
            }

            case "set_thinking_level": {
                if (!channelId) {
                    throw new Error('channelId is required for set_thinking_level');
                }
                const thinkReq = request as any;
                await this.setThinkingLevel(channelId, thinkReq.thinkingLevel);
                return {
                    type: "set_thinking_level_response"
                };
            }

            case "open_config_file":
                return handleOpenConfigFile(request, this.handlerContext);

            // 会话管理
            case "list_sessions_request":
                return handleListSessions(request, this.handlerContext);

            case "get_session_request":
                return handleGetSession(request, this.handlerContext);

        // 文件操作
        case "list_files_request":
            return handleListFiles(request, this.handlerContext);

        case "stat_path_request":
            return handleStatPath(request as any, this.handlerContext);

        case "write_file":
            return handleWriteFile(request as any, this.handlerContext);

            // 进程操作
            case "exec":
                return handleExec(request, this.handlerContext);

            // SSH 操作
            case "ssh_connect":
                return handleSSHConnect(request as any, this.handlerContext);

            case "ssh_command":
                return handleSSHCommand(request as any, this.handlerContext);

            case "ssh_disconnect":
                return handleSSHDisconnect(request as any, this.handlerContext);

            case "ssh_get_output":
                return handleSSHGetOutput(request as any, this.handlerContext);

            case "ssh_list_sessions":
                return handleSSHListSessions(request as any, this.handlerContext);

            // Claude 配置管理
            case "get_claude_config":
                return handleGetClaudeConfig(request as any, this.handlerContext);

            case "set_api_key":
                return handleSetApiKey(request as any, this.handlerContext);

            case "set_base_url":
                return handleSetBaseUrl(request as any, this.handlerContext);

            case "get_subscription":
                return handleGetSubscription(request as any, this.handlerContext);

            case "get_usage":
                return handleGetUsage(request as any, this.handlerContext);

            // case "open_claude_in_terminal":
            //     return handleOpenClaudeInTerminal(request, this.handlerContext);

            // 认证
            // case "get_auth_status":
            //     return handleGetAuthStatus(request, this.handlerContext);

            // case "login":
            //     return handleLogin(request, this.handlerContext);

            // case "submit_oauth_code":
            //     return handleSubmitOAuthCode(request, this.handlerContext);

            default:
                throw new Error(`Unknown request type: ${request.type}`);
        }
    }

    /**
     * 处理响应
     */
    private handleResponse(message: ResponseMessage): void {
        const handler = this.outstandingRequests.get(message.requestId);
        if (handler) {
            const response = message.response;
            if (typeof response === 'object' && response !== null && 'type' in response && response.type === "error") {
                handler.reject(new Error((response as { error: string }).error));
            } else {
                handler.resolve(response);
            }
            this.outstandingRequests.delete(message.requestId);
        } else {
            this.logService.warn(`[ClaudeAgentService] 没有找到请求处理器: ${message.requestId}`);
        }
    }

    /**
     * 处理取消
     */
    private handleCancellation(requestId: string): void {
        const abortController = this.abortControllers.get(requestId);
        if (abortController) {
            abortController.abort();
            this.abortControllers.delete(requestId);
        }
    }

    /**
     * 发送请求到客户端
     */
    protected sendRequest<TRequest extends ExtensionRequest, TResponse>(
        channelId: string,
        request: TRequest
    ): Promise<TResponse> {
        const requestId = this.generateId();

        return new Promise<TResponse>((resolve, reject) => {
            // 注册 Promise handlers
            this.outstandingRequests.set(requestId, { resolve, reject });

            // 发送请求
            this.transport!.send({
                type: "request",
                channelId,
                requestId,
                request
            } as RequestMessage);
        }).finally(() => {
            // 清理
            this.outstandingRequests.delete(requestId);
        });
    }

    /**
     * 请求工具权限
     */
    protected async requestToolPermission(
        channelId: string,
        toolName: string,
        inputs: Record<string, unknown>,
        suggestions: PermissionUpdate[]
    ): Promise<PermissionResult> {
        const request: ToolPermissionRequest = {
            type: "tool_permission_request",
            toolName,
            inputs,
            suggestions
        };

        const response = await this.sendRequest<ToolPermissionRequest, ToolPermissionResponse>(
            channelId,
            request
        );

        return response.result;
    }

    /**
     * 关闭服务
     */
    async shutdown(): Promise<void> {
        await this.closeAllChannels();
        this.fromClientStream.done();
    }

    /**
     * 通知工作区变化
     */
    notifyWorkspaceChanged(): void {
        if (!this.transport) {
            return;
        }

        const defaultCwd = this.workspaceService.getDefaultCwd();
        const workspaceFolders = this.workspaceService.getWorkspaceFolderInfos();

        this.logService.info(`[ClaudeAgentService] 工作区变化: ${defaultCwd}`);

        // 发送工作区变化通知到 WebView
        this.transport.send({
            type: "request",
            requestId: this.generateId(),
            request: {
                type: "workspace_changed",
                defaultCwd,
                workspaceFolders
            }
        });
    }

    // ========================================================================
    // 工具方法
    // ========================================================================

    /**
     * 生成唯一 ID
     */
    private generateId(): string {
        return Math.random().toString(36).substring(2, 15);
    }

    /**
     * 获取当前工作目录
     */
    private getCwd(): string {
        return this.workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    }

    /**
     * 获取 maxThinkingTokens（根据 thinking level）
     */
    private getMaxThinkingTokens(level: string): number {
        return level === 'off' ? 0 : 31999;
    }

    /**
     * 设置 thinking level
     */
    async setThinkingLevel(channelId: string, level: string): Promise<void> {
        this.thinkingLevel = level;

        // 更新正在运行的 channel
        const channel = this.channels.get(channelId);
        if (channel?.query) {
            const maxTokens = this.getMaxThinkingTokens(level);
            await channel.query.setMaxThinkingTokens(maxTokens);
            this.logService.info(`[setThinkingLevel] Updated channel ${channelId} to ${level} (${maxTokens} tokens)`);
        }
    }

    /**
     * 设置权限模式
     */
    async setPermissionMode(channelId: string, mode: PermissionMode): Promise<void> {
        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setPermissionMode] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        // 更新本地权限模式记录（用于 YOLO 模式判断）
        this.channelPermissionModes.set(channelId, mode);

        await channel.query.setPermissionMode(mode);
        this.logService.info(`[setPermissionMode] Set channel ${channelId} to mode: ${mode}`);
    }

    /**
     * 设置模型
     */
    async setModel(channelId: string, model: string): Promise<void> {
        this.logService.info(`[setModel] 收到模型切换请求: channelId=${channelId}, model=${model}`);

        const channel = this.channels.get(channelId);
        if (!channel) {
            this.logService.warn(`[setModel] Channel ${channelId} not found`);
            throw new Error(`Channel ${channelId} not found`);
        }

        // 模型名称映射：将 UI 模型 ID 转换为 API 兼容格式
        const mappedModel = MODEL_NAME_MAPPING[model] || model;
        if (MODEL_NAME_MAPPING[model]) {
            this.logService.info(`[setModel] 模型名称映射: ${model} -> ${mappedModel}`);
        }

        // 设置模型到 channel
        this.logService.info(`[setModel] 调用 channel.query.setModel(${mappedModel})`);
        await channel.query.setModel(mappedModel);

        // 保存到配置（保存原始模型 ID，以便 UI 显示）
        await this.configService.updateValue('claudix.selectedModel', model);

        this.logService.info(`[setModel] 模型切换完成: channel=${channelId}, model=${model}`);
    }
}
