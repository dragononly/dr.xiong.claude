/**
 * ClaudeApiClient - Claude API 客户端
 *
 * 直接调用 Anthropic Messages API（兼容 NewAPI）
 *
 * 功能：
 * - 发送消息请求
 * - 支持流式响应
 * - 支持工具调用
 * - 自动重试
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import type { ToolDefinition } from '../../tools/types';

export const IClaudeApiClient = createDecorator<IClaudeApiClient>('claudeApiClient');

// ============== 类型定义 ==============

/**
 * 消息角色
 */
export type MessageRole = 'user' | 'assistant';

/**
 * 文本内容块
 */
export interface TextBlock {
    type: 'text';
    text: string;
}

/**
 * 工具使用内容块
 */
export interface ToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, any>;
}

/**
 * 工具结果内容块
 */
export interface ToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string | ContentBlock[];
    is_error?: boolean;
}

/**
 * 图片内容块
 */
export interface ImageBlock {
    type: 'image';
    source: {
        type: 'base64';
        media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
        data: string;
    };
}

/**
 * 内容块联合类型
 */
export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock | ImageBlock;

/**
 * 消息
 */
export interface Message {
    role: MessageRole;
    content: string | ContentBlock[];
}

/**
 * 消息请求参数
 */
export interface MessageRequest {
    /** 模型名称 */
    model: string;
    /** 消息列表 */
    messages: Message[];
    /** 系统提示词 */
    system?: string;
    /** 可用工具 */
    tools?: ToolDefinition[];
    /** 最大输出 tokens */
    max_tokens?: number;
    /** 温度 */
    temperature?: number;
    /** 是否流式 */
    stream?: boolean;
    /** 停止序列 */
    stop_sequences?: string[];
    /** 元数据 */
    metadata?: Record<string, any>;
}

/**
 * 使用量统计
 */
export interface Usage {
    input_tokens: number;
    output_tokens: number;
}

/**
 * 消息响应
 */
export interface MessageResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: ContentBlock[];
    model: string;
    stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
    stop_sequence?: string;
    usage: Usage;
}

/**
 * 流式事件类型
 */
export type StreamEvent =
    | { type: 'message_start'; message: Partial<MessageResponse> }
    | { type: 'content_block_start'; index: number; content_block: Partial<ContentBlock> }
    | { type: 'content_block_delta'; index: number; delta: ContentBlockDelta }
    | { type: 'content_block_stop'; index: number }
    | { type: 'message_delta'; delta: { stop_reason?: string; stop_sequence?: string }; usage?: Usage }
    | { type: 'message_stop' }
    | { type: 'error'; error: { type: string; message: string } };

/**
 * 内容块增量
 */
export type ContentBlockDelta =
    | { type: 'text_delta'; text: string }
    | { type: 'input_json_delta'; partial_json: string };

/**
 * API 客户端配置
 */
export interface ClaudeApiConfig {
    /** API Base URL */
    baseUrl: string;
    /** API Key */
    apiKey: string;
    /** 默认模型 */
    defaultModel?: string;
    /** 默认最大 tokens */
    defaultMaxTokens?: number;
    /** 请求超时（毫秒） */
    timeout?: number;
    /** 最大重试次数 */
    maxRetries?: number;
}

/**
 * Claude API 客户端接口
 */
export interface IClaudeApiClient {
    readonly _serviceBrand: undefined;

    /**
     * 配置客户端
     */
    configure(config: ClaudeApiConfig): void;

    /**
     * 重置配置（当 API Key 或 Base URL 变化时调用）
     */
    resetConfig(): void;

    /**
     * 发送消息（非流式）
     */
    sendMessage(request: MessageRequest): Promise<MessageResponse>;

    /**
     * 发送消息（流式）
     * @param request 请求参数
     * @param signal 可选的中断信号
     */
    streamMessage(request: MessageRequest, signal?: AbortSignal): AsyncIterable<StreamEvent>;

    /**
     * 检查是否已配置
     */
    isConfigured(): boolean;
}

// ============== 实现 ==============

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Partial<ClaudeApiConfig> = {
    defaultModel: 'claude-opus-4-5-20251101',
    defaultMaxTokens: 8192,
    timeout: 300000,  // 5 分钟
    maxRetries: 2,
};

/**
 * ClaudeApiClient 实现
 */
export class ClaudeApiClient implements IClaudeApiClient {
    readonly _serviceBrand: undefined;

    private config: ClaudeApiConfig | null = null;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) { }

    configure(config: ClaudeApiConfig): void {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
        };
        this.logService.info(`[ClaudeApiClient] 已配置，Base URL: ${config.baseUrl}`);
    }

    resetConfig(): void {
        this.config = null;
        this.logService.info(`[ClaudeApiClient] 配置已重置，下次请求时将重新配置`);
    }

    isConfigured(): boolean {
        return this.config !== null && !!this.config.apiKey;
    }

    async sendMessage(request: MessageRequest): Promise<MessageResponse> {
        if (!this.config) {
            throw new Error('ClaudeApiClient 未配置');
        }

        const { baseUrl, apiKey, defaultModel, defaultMaxTokens, timeout, maxRetries } = this.config;

        const body = this.buildRequestBody(request, defaultModel!, defaultMaxTokens!);
        body.stream = false;

        // 调试日志：显示请求的详细信息
        this.logService.info(`[ClaudeApiClient] ====== API 请求调试 ======`);
        this.logService.info(`[ClaudeApiClient] 请求 URL: ${baseUrl}/v1/messages`);
        this.logService.info(`[ClaudeApiClient] request.model (传入): ${request.model}`);
        this.logService.info(`[ClaudeApiClient] defaultModel (配置): ${defaultModel}`);
        this.logService.info(`[ClaudeApiClient] body.model (最终): ${body.model}`);
        this.logService.info(`[ClaudeApiClient] 消息数: ${body.messages.length}`);

        let lastError: Error | null = null;

        for (let attempt = 0; attempt <= maxRetries!; attempt++) {
            try {
                const response = await this.fetchWithTimeout(
                    `${baseUrl}/v1/messages`,
                    {
                        method: 'POST',
                        headers: this.getHeaders(apiKey),
                        body: JSON.stringify(body),
                    },
                    timeout!
                );

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API 请求失败: ${response.status} ${errorText}`);
                }

                const data = await response.json() as MessageResponse;
                this.logService.info(`[ClaudeApiClient] 响应成功，stop_reason: ${data.stop_reason}`);

                return data;

            } catch (error) {
                lastError = error as Error;
                this.logService.warn(`[ClaudeApiClient] 请求失败 (尝试 ${attempt + 1}/${maxRetries! + 1}): ${lastError.message}`);

                if (attempt < maxRetries!) {
                    // 等待后重试
                    await this.sleep(1000 * (attempt + 1));
                }
            }
        }

        throw lastError || new Error('请求失败');
    }

    async *streamMessage(request: MessageRequest, signal?: AbortSignal): AsyncIterable<StreamEvent> {
        if (!this.config) {
            throw new Error('ClaudeApiClient 未配置');
        }

        // 检查是否已经被中断
        if (signal?.aborted) {
            this.logService.info('[ClaudeApiClient] 请求已被中断，跳过发送');
            return;
        }

        const { baseUrl, apiKey, defaultModel, defaultMaxTokens, timeout } = this.config;

        const body = this.buildRequestBody(request, defaultModel!, defaultMaxTokens!);
        body.stream = true;

        this.logService.info(`[ClaudeApiClient] 发送流式请求，模型: ${body.model}`);

        const response = await this.fetchWithTimeout(
            `${baseUrl}/v1/messages`,
            {
                method: 'POST',
                headers: this.getHeaders(apiKey),
                body: JSON.stringify(body),
            },
            timeout!,
            signal  // 传递中断信号
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API 请求失败: ${response.status} ${errorText}`);
        }

        if (!response.body) {
            throw new Error('响应没有 body');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let eventCount = 0;

        // 流读取超时（单次 read 操作的超时时间，60秒）
        const READ_TIMEOUT = 60000;

        this.logService.info(`[ClaudeApiClient] 开始读取 SSE 流...`);

        try {
            while (true) {
                // 检查是否被中断
                if (signal?.aborted) {
                    this.logService.info(`[ClaudeApiClient] 收到中断信号，停止读取 SSE 流，已收到 ${eventCount} 个事件`);
                    reader.cancel();
                    return;
                }

                // 添加超时保护：防止 read() 无限等待
                const readPromise = reader.read();
                let timeoutId: ReturnType<typeof setTimeout> | null = null;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => reject(new Error('流读取超时：60秒内没有收到数据')), READ_TIMEOUT);
                });

                // 创建中断 Promise
                const abortPromise = signal ? new Promise<never>((_, reject) => {
                    signal.addEventListener('abort', () => reject(new Error('请求被用户中断')), { once: true });
                }) : null;

                let result;
                try {
                    const racers: Promise<any>[] = [readPromise, timeoutPromise];
                    if (abortPromise) racers.push(abortPromise);
                    result = await Promise.race(racers);
                    // 读取成功后立即清除超时定时器
                    if (timeoutId) clearTimeout(timeoutId);
                } catch (error: any) {
                    // 发生错误时也要清除超时定时器
                    if (timeoutId) clearTimeout(timeoutId);
                    if (error.message === '请求被用户中断') {
                        this.logService.info(`[ClaudeApiClient] 用户中断请求，停止读取 SSE 流，已收到 ${eventCount} 个事件`);
                        reader.cancel();
                        return;
                    }
                    // 超时时取消读取
                    this.logService.error(`[ClaudeApiClient] SSE 流读取超时，已收到 ${eventCount} 个事件`);
                    reader.cancel();
                    throw error;
                }

                if (result.done) {
                    this.logService.info(`[ClaudeApiClient] SSE 流 done=true，结束读取，共收到 ${eventCount} 个事件`);
                    break;
                }

                const value = result.value;

                buffer += decoder.decode(value, { stream: true });

                // 解析 SSE 事件
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();

                        if (data === '[DONE]') {
                            this.logService.info(`[ClaudeApiClient] 收到 [DONE] 标记，结束流，共收到 ${eventCount} 个事件`);
                            return;
                        }

                        try {
                            const event = JSON.parse(data) as StreamEvent;
                            eventCount++;
                            yield event;
                        } catch {
                            // 忽略解析错误
                            this.logService.warn(`[ClaudeApiClient] 解析 SSE 事件失败: ${data.slice(0, 100)}`);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }
    }

    /**
     * 构建请求体
     */
    private buildRequestBody(
        request: MessageRequest,
        defaultModel: string,
        defaultMaxTokens: number
    ): any {
        const body: any = {
            model: request.model || defaultModel,
            messages: request.messages,
            max_tokens: request.max_tokens || defaultMaxTokens,
        };

        if (request.system) {
            body.system = request.system;
        }

        if (request.tools && request.tools.length > 0) {
            body.tools = request.tools;
        }

        if (request.temperature !== undefined) {
            body.temperature = request.temperature;
        }

        if (request.stop_sequences) {
            body.stop_sequences = request.stop_sequences;
        }

        if (request.metadata) {
            body.metadata = request.metadata;
        }

        return body;
    }

    /**
     * 获取请求头
     * 根据 baseUrl 自动选择认证方式：
     * - Anthropic 官方 API: 使用 x-api-key 头
     * - 代理服务 (如 NewAPI): 使用 Authorization: Bearer 格式
     */
    private getHeaders(apiKey: string): Record<string, string> {
        const baseUrl = this.config?.baseUrl || '';
        const isAnthropicOfficial = baseUrl.includes('api.anthropic.com');

        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };

        // 调试日志
        this.logService.info(`[ClaudeApiClient] getHeaders - baseUrl: ${baseUrl}`);
        this.logService.info(`[ClaudeApiClient] getHeaders - isAnthropicOfficial: ${isAnthropicOfficial}`);
        this.logService.info(`[ClaudeApiClient] getHeaders - apiKey长度: ${apiKey?.length || 0}`);

        if (isAnthropicOfficial) {
            // Anthropic 官方 API 使用 x-api-key
            headers['x-api-key'] = apiKey;
            this.logService.info(`[ClaudeApiClient] 使用 x-api-key 认证方式`);
        } else {
            // 代理服务使用 Bearer token
            headers['Authorization'] = `Bearer ${apiKey}`;
            this.logService.info(`[ClaudeApiClient] 使用 Bearer token 认证方式`);
        }

        return headers;
    }

    /**
     * 带超时的 fetch
     * @param url 请求 URL
     * @param options fetch 选项
     * @param timeout 超时时间
     * @param externalSignal 外部中断信号（可选）
     */
    private async fetchWithTimeout(
        url: string,
        options: RequestInit,
        timeout: number,
        externalSignal?: AbortSignal
    ): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        // 如果外部信号已经中断，直接中断
        if (externalSignal?.aborted) {
            controller.abort();
        }

        // 监听外部中断信号
        const onExternalAbort = () => controller.abort();
        externalSignal?.addEventListener('abort', onExternalAbort);

        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
            });
            return response;
        } finally {
            clearTimeout(timeoutId);
            externalSignal?.removeEventListener('abort', onExternalAbort);
        }
    }

    /**
     * 延迟
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
