/**
 * GLM API 客户端 - 用于图片识别
 *
 * 功能：
 * - 调用 GLM-4V 等视觉模型进行图片识别
 * - 复用用户的 API Key 和 Base URL 配置
 * - 支持流式和非流式响应
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IClaudeConfigService } from '../claudeConfigService';

export const IGLMClient = createDecorator<IGLMClient>('glmClient');

// ============== 类型定义 ==============

/**
 * GLM 消息角色
 */
export type GLMMessageRole = 'user' | 'assistant';

/**
 * 文本内容块
 */
export interface GLMTextBlock {
    type: 'text';
    text: string;
}

/**
 * 图片内容块
 */
export interface GLMImageBlock {
    type: 'image_url';
    image_url: {
        url: string; // base64 格式: "data:image/jpeg;base64,..."
    };
}

/**
 * 内容块联合类型
 */
export type GLMContentBlock = GLMTextBlock | GLMImageBlock;

/**
 * GLM 消息
 */
export interface GLMMessage {
    role: GLMMessageRole;
    content: string | GLMContentBlock[];
}

/**
 * GLM 请求参数
 */
export interface GLMRequest {
    /** 模型名称 */
    model: string;
    /** 消息列表 */
    messages: GLMMessage[];
    /** 最大输出 tokens */
    max_tokens?: number;
    /** 温度 */
    temperature?: number;
    /** 是否流式 */
    stream?: boolean;
    /** 停止序列 */
    stop?: string[];
}

/**
 * GLM 响应（非流式）
 */
export interface GLMResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * GLM 流式事件
 */
export type GLMStreamEvent =
    | { id: string; object: string; created: number; model: string; choices: Array<{ delta: { role?: string; content?: string }; finish_reason: string | null }> }
    | { error: { message: string; type: string; code: string } };

/**
 * GLM 客户端接口
 */
export interface IGLMClient {
    readonly _serviceBrand: undefined;

    /**
     * 发送消息（非流式）
     */
    sendMessage(request: GLMRequest): Promise<GLMResponse>;

    /**
     * 发送消息（流式）
     * @param request 请求参数
     * @param signal 可选的中断信号
     */
    streamMessage(request: GLMRequest, signal?: AbortSignal): AsyncIterable<GLMStreamEvent>;
}

// ============== 实现 ==============

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
    maxTokens: 4096,
    temperature: 0.7,
    timeout: 60000,  // 1 分钟
};

/**
 * GLM Client 实现
 */
export class GLMClient implements IGLMClient {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IClaudeConfigService private readonly configService: IClaudeConfigService
    ) {}

    async sendMessage(request: GLMRequest): Promise<GLMResponse> {
        const baseUrl = await this.configService.getGlmBaseUrl();
        const apiKey = await this.configService.getGlmApiKey();

        if (!baseUrl || !apiKey) {
            throw new Error('GLM 客户端未配置：请先在设置中配置 API Key 和 Base URL');
        }

        const model = request.model || await this.configService.getGlmModel();
        const url = `${baseUrl}/v1/chat/completions`;

        this.logService.info(`[GLMClient] 发送请求到: ${url}`);
        this.logService.info(`[GLMClient] 模型: ${model}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                ...request,
                model,
                max_tokens: request.max_tokens || DEFAULT_CONFIG.maxTokens,
                temperature: request.temperature ?? DEFAULT_CONFIG.temperature,
                stream: false,
            }),
            signal: AbortSignal.timeout(DEFAULT_CONFIG.timeout),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`GLM API 请求失败: ${response.status} ${errorText}`);
        }

        const data = await response.json() as GLMResponse;
        this.logService.info(`[GLMClient] 响应成功，tokens: ${data.usage.total_tokens}`);

        return data;
    }

    async *streamMessage(request: GLMRequest, signal?: AbortSignal): AsyncIterable<GLMStreamEvent> {
        const baseUrl = await this.configService.getGlmBaseUrl();
        const apiKey = await this.configService.getGlmApiKey();

        if (!baseUrl || !apiKey) {
            throw new Error('GLM 客户端未配置：请先在设置中配置 API Key 和 Base URL');
        }

        const model = request.model || await this.configService.getGlmModel();
        const url = `${baseUrl}/v1/chat/completions`;

        this.logService.info(`[GLMClient] 发送流式请求到: ${url}, 模型: ${model}`);

        // 创建超时控制器
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_CONFIG.timeout);

        // 监听外部中断信号
        if (signal?.aborted) {
            controller.abort();
        }
        const onExternalAbort = () => controller.abort();
        signal?.addEventListener('abort', onExternalAbort);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    ...request,
                    model,
                    max_tokens: request.max_tokens || DEFAULT_CONFIG.maxTokens,
                    temperature: request.temperature ?? DEFAULT_CONFIG.temperature,
                    stream: true,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`GLM API 请求失败: ${response.status} ${errorText}`);
            }

            if (!response.body) {
                throw new Error('响应没有 body');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            this.logService.info(`[GLMClient] 开始读取 SSE 流...`);

            while (true) {
                // 检查是否被中断
                if (signal?.aborted) {
                    this.logService.info(`[GLMClient] 收到中断信号，停止读取`);
                    reader.cancel();
                    return;
                }

                const { done, value } = await reader.read();

                if (done) {
                    this.logService.info(`[GLMClient] SSE 流结束`);
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // 解析 SSE 事件
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();

                        if (data === '[DONE]') {
                            this.logService.info(`[GLMClient] 收到 [DONE] 标记`);
                            return;
                        }

                        try {
                            const event = JSON.parse(data) as GLMStreamEvent;
                            yield event;
                        } catch (error) {
                            this.logService.warn(`[GLMClient] 解析 SSE 事件失败: ${data.slice(0, 100)}`);
                        }
                    }
                }
            }
        } finally {
            clearTimeout(timeoutId);
            signal?.removeEventListener('abort', onExternalAbort);
        }
    }
}
