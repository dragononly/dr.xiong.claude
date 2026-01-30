/**
 * AgentCoordinator - 代理协调器
 *
 * 职责：
 * 1. 管理用户与 AI 的对话
 * 2. 协调工具调用
 * 3. 处理工具调用循环
 * 4. 管理会话状态
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IClaudeConfigService } from '../claudeConfigService';
import {
    IClaudeApiClient,
    Message,
    MessageRequest,
    MessageResponse,
    ContentBlock,
    ToolUseBlock,
    ToolResultBlock,
    StreamEvent,
    ContentBlockDelta,
    TextBlock,
    ImageBlock,
} from '../ai/ClaudeApiClient';
import {
    IToolRegistry,
    ToolUseRequest,
    ToolContext,
    ToolDefinition,
} from '../../tools';
import { generateSystemPrompt, getClaudeImpersonationConfig } from '../ai/SystemPrompts';
import { IImagePreprocessingService, ImageRecognitionResult } from '../ImagePreprocessingService';

export const IAgentCoordinator = createDecorator<IAgentCoordinator>('agentCoordinator');

// ============== 类型定义 ==============

/**
 * 代理配置
 */
export interface AgentConfig {
    /** 模型名称 */
    model?: string;
    /** 工作目录 */
    cwd: string;
    /** 是否模拟 Claude 身份（用于 GLM 等模型） */
    impersonateClaude?: boolean;
    /** 最大工具调用循环次数 */
    maxToolLoops?: number;
    /** 系统提示词（可选，默认使用 SystemPrompts 生成） */
    systemPrompt?: string;
}

/**
 * 对话轮次
 */
export interface ConversationTurn {
    /** 用户消息 */
    userMessage: string;
    /** 助手响应 */
    assistantResponse: string;
    /** 工具调用记录 */
    toolCalls?: Array<{
        name: string;
        input: any;
        output: string;
        isError: boolean;
    }>;
    /** 时间戳 */
    timestamp: number;
}

/**
 * 会话状态
 */
export interface SessionState {
    /** 会话 ID */
    id: string;
    /** 消息历史 */
    messages: Message[];
    /** 对话轮次 */
    turns: ConversationTurn[];
    /** 创建时间 */
    createdAt: number;
    /** 最后活动时间 */
    lastActiveAt: number;
    /** 配置 */
    config: AgentConfig;
}

/**
 * 工具确认回调
 * 返回 true 表示允许执行，false 表示用户拒绝
 */
export type ToolConfirmCallback = (toolName: string, toolId: string, input: any) => Promise<boolean>;

/**
 * 流式消息选项
 */
export interface StreamMessageOptions {
    /** 中断信号 */
    signal?: AbortSignal;
    /** 工具确认回调，如果返回 false 则拒绝执行该工具 */
    toolConfirmCallback?: ToolConfirmCallback;
}

/**
 * 流式事件
 */
export type AgentStreamEvent =
    | { type: 'text'; text: string }
    | { type: 'tool_start'; id: string; name: string; input: any }
    | { type: 'tool_end'; id: string; name: string; output: string; isError: boolean; snapshotId?: string; canRevert?: boolean }
    | { type: 'tool_rejected'; id: string; name: string; reason: string }
    | { type: 'thinking'; text: string }
    | { type: 'done'; response: string; usage?: { inputTokens: number; outputTokens: number } }
    | { type: 'error'; error: string };

/**
 * 代理协调器接口
 */
export interface IAgentCoordinator {
    readonly _serviceBrand: undefined;

    /**
     * 创建新会话
     */
    createSession(config: AgentConfig): SessionState;

    /**
     * 发送消息（非流式）
     */
    sendMessage(session: SessionState, userMessage: string): Promise<string>;

    /**
     * 发送消息（流式）
     * @param session 会话状态
     * @param userMessage 用户消息
     * @param options 可选的流式消息选项（包含中断信号和工具确认回调）
     */
    streamMessage(session: SessionState, userMessage: string, options?: StreamMessageOptions): AsyncIterable<AgentStreamEvent>;

    /**
     * 获取工具定义（用于发送给模型）
     */
    getToolDefinitions(): ToolDefinition[];
}

// ============== 实现 ==============

/**
 * 默认最大工具调用循环次数
 * 设置较大的值以支持非常复杂的多步骤任务
 */
const DEFAULT_MAX_TOOL_LOOPS = 1000;

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * AgentCoordinator 实现
 */
export class AgentCoordinator implements IAgentCoordinator {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IClaudeConfigService private readonly claudeConfigService: IClaudeConfigService,
        @IClaudeApiClient private readonly apiClient: IClaudeApiClient,
        @IToolRegistry private readonly toolRegistry: IToolRegistry,
        @IImagePreprocessingService private readonly imagePreprocessing: IImagePreprocessingService
    ) { }

    createSession(config: AgentConfig): SessionState {
        const sessionId = generateSessionId();

        this.logService.info(`[AgentCoordinator] 创建会话: ${sessionId}`);

        return {
            id: sessionId,
            messages: [],
            turns: [],
            createdAt: Date.now(),
            lastActiveAt: Date.now(),
            config,
        };
    }

    async sendMessage(session: SessionState, userMessage: string): Promise<string> {
        this.logService.info(`[AgentCoordinator] 发送消息: ${userMessage.slice(0, 100)}...`);

        // 收集流式响应
        let fullResponse = '';

        for await (const event of this.streamMessage(session, userMessage)) {
            if (event.type === 'text') {
                fullResponse += event.text;
            } else if (event.type === 'done') {
                return event.response;
            } else if (event.type === 'error') {
                throw new Error(event.error);
            }
        }

        return fullResponse;
    }

    async *streamMessage(session: SessionState, userMessage: string, options?: StreamMessageOptions): AsyncIterable<AgentStreamEvent> {
        const { config } = session;
        const maxLoops = config.maxToolLoops ?? DEFAULT_MAX_TOOL_LOOPS;
        const signal = options?.signal;
        const toolConfirmCallback = options?.toolConfirmCallback;

        // 检查是否已被中断
        if (signal?.aborted) {
            this.logService.info(`[AgentCoordinator] 请求已被中断，跳过处理`);
            return;
        }

        this.logService.info(`[AgentCoordinator] ====== streamMessage 开始 ======`);
        this.logService.info(`[AgentCoordinator] session.id: ${session.id}`);
        this.logService.info(`[AgentCoordinator] config.model: ${config.model || '(未设置)'}`);
        this.logService.info(`[AgentCoordinator] userMessage: ${userMessage.slice(0, 50)}...`);
        this.logService.info(`[AgentCoordinator] toolConfirmCallback: ${toolConfirmCallback ? '已设置' : '未设置'}`);

        // 1. 处理用户消息（包括图片预处理）
        const processedMessage = await this.processUserMessage(userMessage);

        // 2. 添加处理后的用户消息到会话
        session.messages.push({
            role: 'user',
            content: processedMessage,
        });

        // 3. 构建系统提示词
        const systemPrompt = this.buildSystemPrompt(config);

        // 4. 获取工具定义
        const tools = this.getToolDefinitions();
        this.logService.info(`[AgentCoordinator] 工具数量: ${tools.length}`);

        // 4. 工具调用循环
        let loopCount = 0;
        let finalResponse = '';
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        while (loopCount < maxLoops) {
            // 检查是否被中断
            if (signal?.aborted) {
                this.logService.info(`[AgentCoordinator] 收到中断信号，退出工具调用循环`);
                yield { type: 'error', error: '请求被用户中断' };
                return;
            }

            loopCount++;
            this.logService.info(`[AgentCoordinator] 工具调用循环 ${loopCount}/${maxLoops}`);

            try {
                // 5. 发送流式请求
                const request: MessageRequest = {
                    model: config.model || undefined as any,
                    messages: session.messages,
                    system: systemPrompt,
                    tools,
                    max_tokens: 32768,
                };

                this.logService.info(`[AgentCoordinator] 即将发送流式 API 请求，model=${request.model || '(undefined, 使用默认)'}`);

                // 使用流式 API 收集响应
                const contentBlocks: ContentBlock[] = [];
                let currentBlockIndex = -1;
                let currentBlockType = '';
                let currentTextContent = '';
                let currentToolUseId = '';
                let currentToolUseName = '';
                let currentToolUseInputJson = '';
                let stopReason: string | undefined;

                let streamEventCount = 0;
                this.logService.info(`[AgentCoordinator] 开始接收 SSE 流事件...`);

                for await (const event of this.apiClient.streamMessage(request, signal)) {
                    // 检查是否被中断
                    if (signal?.aborted) {
                        this.logService.info(`[AgentCoordinator] 收到中断信号，停止处理`);
                        yield { type: 'error', error: '请求被用户中断' };
                        return;
                    }

                    streamEventCount++;
                    this.logService.debug(`[AgentCoordinator] SSE 事件 #${streamEventCount}: ${event.type}`);

                    switch (event.type) {
                        case 'message_start':
                            this.logService.info(`[AgentCoordinator] message_start 收到`);
                            // 消息开始，可以获取 usage.input_tokens
                            if (event.message?.usage?.input_tokens) {
                                totalInputTokens += event.message.usage.input_tokens;
                            }
                            break;

                        case 'content_block_start':
                            currentBlockIndex = event.index;
                            const blockType = event.content_block?.type;
                            currentBlockType = blockType || '';
                            this.logService.debug(`[AgentCoordinator] content_block_start: type=${blockType}, index=${currentBlockIndex}`);

                            if (blockType === 'text') {
                                currentTextContent = '';
                            } else if (blockType === 'tool_use') {
                                currentToolUseId = (event.content_block as any)?.id || '';
                                currentToolUseName = (event.content_block as any)?.name || '';
                                currentToolUseInputJson = '';
                                this.logService.info(`[AgentCoordinator] 工具调用开始: ${currentToolUseName} (id=${currentToolUseId})`);
                            }
                            break;

                        case 'content_block_delta':
                            const delta = event.delta;
                            if (delta.type === 'text_delta') {
                                const text = delta.text;
                                currentTextContent += text;
                                // 实时流式输出文本
                                yield { type: 'text', text };
                                finalResponse += text;
                            } else if (delta.type === 'input_json_delta') {
                                currentToolUseInputJson += delta.partial_json;
                            }
                            break;

                        case 'content_block_stop':
                            this.logService.debug(`[AgentCoordinator] content_block_stop: type=${currentBlockType}`);
                            // 内容块结束，保存到 contentBlocks
                            if (currentBlockType === 'text') {
                                contentBlocks.push({
                                    type: 'text',
                                    text: currentTextContent,
                                } as TextBlock);
                            } else if (currentBlockType === 'tool_use') {
                                let parsedInput = {};
                                try {
                                    parsedInput = JSON.parse(currentToolUseInputJson || '{}');
                                } catch {
                                    this.logService.warn(`[AgentCoordinator] 解析工具输入 JSON 失败: ${currentToolUseInputJson}`);
                                }
                                contentBlocks.push({
                                    type: 'tool_use',
                                    id: currentToolUseId,
                                    name: currentToolUseName,
                                    input: parsedInput,
                                } as ToolUseBlock);
                                this.logService.info(`[AgentCoordinator] 工具调用解析完成: ${currentToolUseName}`);
                            }
                            break;

                        case 'message_delta':
                            if (event.delta?.stop_reason) {
                                stopReason = event.delta.stop_reason;
                                this.logService.info(`[AgentCoordinator] message_delta: stop_reason=${stopReason}`);
                            }
                            if (event.usage?.output_tokens) {
                                totalOutputTokens += event.usage.output_tokens;
                            }
                            break;

                        case 'message_stop':
                            this.logService.info(`[AgentCoordinator] message_stop 收到，SSE 流结束`);
                            // 消息结束
                            break;

                        case 'error':
                            this.logService.error(`[AgentCoordinator] SSE error 事件: ${event.error?.message}`);
                            throw new Error(event.error.message);
                    }
                }

                this.logService.info(`[AgentCoordinator] SSE 流循环结束，共收到 ${streamEventCount} 个事件`);

                this.logService.info(`[AgentCoordinator] 流式请求完成，stop_reason=${stopReason}`);

                // 保护性检查：如果 stopReason 未定义，记录警告并视为异常
                if (!stopReason) {
                    this.logService.warn(`[AgentCoordinator] 警告: SSE 流结束但未收到 stop_reason，可能存在网络问题`);
                    // 将 undefined 视为 end_turn 处理，避免无限循环
                    stopReason = 'end_turn';
                }

                // 6. 提取工具调用
                const toolUses = contentBlocks.filter((b): b is ToolUseBlock => b.type === 'tool_use');

                // 7. 如果没有工具调用，结束循环
                this.logService.info(`[AgentCoordinator] 检查工具调用: toolUses.length=${toolUses.length}, stopReason=${stopReason}`);

                if (toolUses.length === 0 || stopReason !== 'tool_use') {
                    this.logService.info(`[AgentCoordinator] 任务完成，stop_reason=${stopReason}`);
                    this.logService.info(`[AgentCoordinator] 最终响应长度: ${finalResponse.length} 字符`);

                    // 如果是因为达到 max_tokens 限制而停止，自动继续生成
                    if (stopReason === 'max_tokens') {
                        this.logService.info(`[AgentCoordinator] 响应因 max_tokens 限制被截断，启动自动继续机制`);

                        // 保存当前的 assistant 消息到历史
                        session.messages.push({
                            role: 'assistant',
                            content: contentBlocks,
                        });

                        // 添加一个 user 消息请求继续
                        session.messages.push({
                            role: 'user',
                            content: '请继续，从你刚才停下的地方接着输出，不要重复之前的内容。',
                        });

                        this.logService.info(`[AgentCoordinator] 已添加继续请求，将在下一轮循环继续生成`);
                        // 继续循环，让模型继续输出
                        continue;
                    }

                    // 添加助手消息到历史
                    session.messages.push({
                        role: 'assistant',
                        content: contentBlocks,
                    });

                    // 发送完成事件
                    yield {
                        type: 'done',
                        response: finalResponse,
                        usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
                    };

                    // 更新会话状态
                    session.lastActiveAt = Date.now();

                    this.logService.info(`[AgentCoordinator] ====== streamMessage 结束 ======`);
                    return;
                }

                this.logService.info(`[AgentCoordinator] 有 ${toolUses.length} 个工具调用，开始执行...`);

                // 8. 执行工具调用
                const toolResults: ToolResultBlock[] = [];
                const TOOL_TIMEOUT = 120000; // 工具执行超时：2分钟

                for (const toolUse of toolUses) {
                    // 8.1 检查是否需要用户确认
                    if (toolConfirmCallback) {
                        this.logService.info(`[AgentCoordinator] 工具 ${toolUse.name} 需要用户确认...`);
                        const confirmed = await toolConfirmCallback(toolUse.name, toolUse.id, toolUse.input);
                        if (!confirmed) {
                            this.logService.info(`[AgentCoordinator] 工具 ${toolUse.name} 被用户拒绝`);
                            yield { type: 'tool_rejected', id: toolUse.id, name: toolUse.name, reason: '用户拒绝执行' };

                            // 添加拒绝结果到工具结果列表
                            toolResults.push({
                                type: 'tool_result',
                                tool_use_id: toolUse.id,
                                content: '用户拒绝执行此操作',
                                is_error: true,
                            });
                            continue;
                        }
                        this.logService.info(`[AgentCoordinator] 工具 ${toolUse.name} 用户已确认`);
                    }

                    yield { type: 'tool_start', id: toolUse.id, name: toolUse.name, input: toolUse.input };

                    const context: ToolContext = {
                        cwd: config.cwd,
                        logService: this.logService,
                        sessionId: session.id,
                        metadata: {
                            toolUseId: toolUse.id,
                        },
                    };

                    const toolRequest: ToolUseRequest = {
                        id: toolUse.id,
                        name: toolUse.name,
                        input: toolUse.input,
                    };

                    let result;
                    try {
                        // 添加工具执行超时保护
                        const executePromise = this.toolRegistry.execute(toolRequest, context);
                        const timeoutPromise = new Promise<never>((_, reject) => {
                            setTimeout(() => reject(new Error(`工具 ${toolUse.name} 执行超时（${TOOL_TIMEOUT / 1000}秒）`)), TOOL_TIMEOUT);
                        });
                        result = await Promise.race([executePromise, timeoutPromise]);
                    } catch (toolError) {
                        this.logService.error(`[AgentCoordinator] 工具执行失败: ${toolError}`);
                        result = {
                            content: `工具执行错误: ${toolError}`,
                            is_error: true,
                        };
                    }

                    // 统一转换为字符串
                    const resultContent = typeof result.content === 'string'
                        ? result.content
                        : JSON.stringify(result.content);

                    // 发送 tool_end 事件，包含撤回相关字段
                    yield {
                        type: 'tool_end',
                        id: toolUse.id,
                        name: toolUse.name,
                        output: resultContent,
                        isError: result.is_error ?? false,
                        snapshotId: result.snapshotId,
                        canRevert: result.canRevert,
                    };

                    // 构建工具结果对象，包含撤回元数据
                    const toolResultObj: any = {
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: resultContent,
                        is_error: result.is_error,
                    };
                    // 传递撤回相关字段（如果存在）
                    if (result.snapshotId) {
                        toolResultObj.snapshotId = result.snapshotId;
                    }
                    if (result.canRevert !== undefined) {
                        toolResultObj.canRevert = result.canRevert;
                    }
                    toolResults.push(toolResultObj);

                    this.logService.info(`[AgentCoordinator] 工具 ${toolUse.name} 执行完成`);
                }

                this.logService.info(`[AgentCoordinator] 所有工具执行完成 (${toolResults.length} 个)，添加消息到历史并继续循环`);

                // 9. 添加助手消息和工具结果到历史
                session.messages.push({
                    role: 'assistant',
                    content: contentBlocks,
                });

                session.messages.push({
                    role: 'user',
                    content: toolResults,
                });

                this.logService.info(`[AgentCoordinator] 历史消息数量: ${session.messages.length}，准备下一轮 API 调用 (循环 ${loopCount + 1}/${maxLoops})`);

            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                this.logService.error(`[AgentCoordinator] 错误: ${errorMessage}`);

                yield { type: 'error', error: errorMessage };
                return;
            }
        }

        // 超过最大循环次数 - 给用户一个友好的提示
        this.logService.warn(`[AgentCoordinator] 达到最大工具调用次数 ${maxLoops}`);
        yield {
            type: 'error',
            error: `任务较为复杂，已达到单次对话的最大工具调用次数限制 (${maxLoops})。您可以发送"继续"让我接着完成剩余工作。`,
        };
    }

    getToolDefinitions(): ToolDefinition[] {
        return this.toolRegistry.getToolDefinitions();
    }

    /**
     * 构建系统提示词
     */
    private buildSystemPrompt(config: AgentConfig): string {
        if (config.systemPrompt) {
            return config.systemPrompt;
        }

        // 使用 SystemPrompts 模块生成
        const promptConfig = config.impersonateClaude
            ? getClaudeImpersonationConfig(config.cwd)
            : {
                cwd: config.cwd,
                hideIdentity: false,
                enableVSCodeContext: true,
                enableTaskManagement: true,
                enableCodingRules: true,
            };

        return generateSystemPrompt(promptConfig);
    }

    /**
     * 解析响应内容
     */
    private parseResponse(response: MessageResponse): {
        textContent: string;
        toolUses: ToolUseBlock[];
    } {
        let textContent = '';
        const toolUses: ToolUseBlock[] = [];

        for (const block of response.content) {
            if (block.type === 'text') {
                textContent += block.text;
            } else if (block.type === 'tool_use') {
                toolUses.push(block as ToolUseBlock);
            }
        }

        return { textContent, toolUses };
    }

    /**
     * 处理用户消息（包括图片预处理）
     * @param userMessage 原始用户消息（可能是字符串或包含图片的内容块数组）
     * @returns 处理后的消息内容
     */
    private async processUserMessage(userMessage: string | ContentBlock[]): Promise<string | ContentBlock[]> {
        // 如果消息是字符串，直接返回
        if (typeof userMessage === 'string') {
            return userMessage;
        }

        // 检查是否启用图片预处理
        const isEnabled = await this.claudeConfigService.isImagePreprocessingEnabled();
        if (!isEnabled) {
            this.logService.info('[AgentCoordinator] 图片预处理未启用，直接使用原始消息');
            return userMessage;
        }

        // 提取图片块
        const imageBlocks = userMessage.filter(block => block.type === 'image') as ImageBlock[];
        if (imageBlocks.length === 0) {
            this.logService.info('[AgentCoordinator] 消息中没有图片');
            return userMessage;
        }

        this.logService.info(`[AgentCoordinator] 发现 ${imageBlocks.length} 张图片，开始预处理...`);

        // 转换图片块为 AttachmentPayload 格式
        const attachments = imageBlocks.map(block => ({
            fileName: `image_${Date.now()}.png`,
            mediaType: block.source.media_type,
            data: block.source.data,
        }));

        try {
            // 调用 GLM 进行图片识别
            const results = await this.imagePreprocessing.recognizeImages(attachments);

            // 将识别结果转换为文本
            const imageDescriptions = this.imagePreprocessing.formatAsPrompt(results);

            this.logService.info(`[AgentCoordinator] 图片识别完成: ${imageDescriptions.slice(0, 100)}...`);

            // 构建新的消息内容（图片描述 + 其他内容块）
            const newBlocks: ContentBlock[] = [];
            let hasText = false;

            for (const block of userMessage) {
                if (block.type === 'image') {
                    // 跳过图片块，因为我们已经用 GLM 识别了
                    continue;
                } else if (block.type === 'text') {
                    // 在文本内容前添加图片描述
                    if (!hasText) {
                        newBlocks.push({
                            type: 'text',
                            text: imageDescriptions + (block as TextBlock).text,
                        });
                        hasText = true;
                    } else {
                        newBlocks.push(block);
                    }
                } else {
                    newBlocks.push(block);
                }
            }

            // 如果没有文本块，添加图片描述
            if (!hasText) {
                newBlocks.push({
                    type: 'text',
                    text: imageDescriptions,
                });
            }

            return newBlocks;
        } catch (error) {
            this.logService.error(`[AgentCoordinator] 图片预处理失败: ${error}`);
            // 失败时返回原始消息
            return userMessage;
        }
    }
}
