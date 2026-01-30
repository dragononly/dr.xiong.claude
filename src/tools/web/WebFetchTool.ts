/**
 * WebFetchTool - 网页内容获取工具
 *
 * 功能：
 * - 获取网页内容
 * - 支持提取主要文本
 * - 支持 JSON 响应
 */

import {
    ITool,
    ToolContext,
    ToolResult,
    JSONSchema,
    successResult,
    errorResult,
    errorResultFromError,
} from '../types';

/**
 * Web Fetch 输入参数
 */
export interface WebFetchInput {
    /** 要获取的 URL */
    url: string;
    /** 是否只提取主要文本（默认 true） */
    extract_text?: boolean;
    /** 请求方法（默认 GET） */
    method?: 'GET' | 'POST';
    /** 请求头 */
    headers?: Record<string, string>;
    /** 请求体（POST 时使用） */
    body?: string;
    /** 超时时间（毫秒，默认 30000） */
    timeout?: number;
}

/**
 * Web Fetch 输出
 */
export interface WebFetchOutput {
    /** 响应状态码 */
    status: number;
    /** 响应内容 */
    content: string;
    /** 内容类型 */
    contentType: string;
    /** 是否被截断 */
    truncated: boolean;
    /** 原始长度 */
    originalLength: number;
}

/**
 * 最大内容长度（100KB）
 */
const MAX_CONTENT_LENGTH = 100 * 1024;

/**
 * 默认超时时间（30秒）
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * WebFetchTool 实现
 */
export class WebFetchTool implements ITool<WebFetchInput, WebFetchOutput> {
    readonly name = 'web_fetch';

    readonly description = `Fetch content from a URL. Supports extracting main text content from HTML pages. Useful for reading documentation, API responses, or web page content.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The URL to fetch content from.',
            },
            extract_text: {
                type: 'boolean',
                description: 'Whether to extract main text from HTML. Defaults to true.',
            },
            method: {
                type: 'string',
                enum: ['GET', 'POST'],
                description: 'HTTP method. Defaults to GET.',
            },
            headers: {
                type: 'object',
                description: 'Additional HTTP headers.',
            },
            body: {
                type: 'string',
                description: 'Request body for POST requests.',
            },
            timeout: {
                type: 'number',
                description: 'Timeout in milliseconds. Defaults to 30000.',
            },
        },
        required: ['url'],
    };

    validate(input: WebFetchInput): string | undefined {
        if (!input.url || typeof input.url !== 'string') {
            return 'url 是必需参数';
        }

        try {
            new URL(input.url);
        } catch {
            return 'url 格式无效';
        }

        if (input.method && !['GET', 'POST'].includes(input.method)) {
            return 'method 必须是 GET 或 POST';
        }

        return undefined;
    }

    async execute(input: WebFetchInput, context: ToolContext): Promise<ToolResult<WebFetchOutput>> {
        const startTime = Date.now();
        const {
            url,
            extract_text = true,
            method = 'GET',
            headers = {},
            body,
            timeout = DEFAULT_TIMEOUT,
        } = input;
        const { logService } = context;

        try {
            logService.info(`[WebFetchTool] 获取: ${url}`);

            // 构建请求
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const requestInit: RequestInit = {
                method,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
                    ...headers,
                },
                signal: controller.signal,
            };

            if (method === 'POST' && body) {
                requestInit.body = body;
            }

            const response = await fetch(url, requestInit);
            clearTimeout(timeoutId);

            const contentType = response.headers.get('content-type') || 'text/plain';
            let content = await response.text();
            const originalLength = content.length;

            // 提取文本（如果是 HTML）
            if (extract_text && contentType.includes('text/html')) {
                content = this.extractMainText(content);
            }

            // 截断过长内容
            let truncated = false;
            if (content.length > MAX_CONTENT_LENGTH) {
                content = content.slice(0, MAX_CONTENT_LENGTH) + '\n\n[内容已截断...]';
                truncated = true;
            }

            const duration = Date.now() - startTime;
            logService.info(`[WebFetchTool] 完成，状态: ${response.status}，长度: ${content.length}，耗时: ${duration}ms`);

            return successResult({
                status: response.status,
                content,
                contentType,
                truncated,
                originalLength,
            }, { duration, truncated });

        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return errorResult(`请求超时 (${timeout}ms)`);
            }
            return errorResultFromError(error, '获取网页失败');
        }
    }

    /**
     * 从 HTML 中提取主要文本
     */
    private extractMainText(html: string): string {
        // 移除 script 和 style 标签
        let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');

        // 移除 HTML 注释
        text = text.replace(/<!--[\s\S]*?-->/g, '');

        // 移除所有标签，保留文本
        text = text.replace(/<[^>]+>/g, ' ');

        // 解码 HTML 实体
        text = this.decodeHtmlEntities(text);

        // 清理空白
        text = text
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n\n')
            .trim();

        return text;
    }

    /**
     * 解码 HTML 实体
     */
    private decodeHtmlEntities(text: string): string {
        const entities: Record<string, string> = {
            '&amp;': '&',
            '&lt;': '<',
            '&gt;': '>',
            '&quot;': '"',
            '&#39;': "'",
            '&nbsp;': ' ',
            '&copy;': '©',
            '&reg;': '®',
            '&trade;': '™',
        };

        return text.replace(/&[a-z]+;|&#\d+;/gi, (match) => {
            if (entities[match]) {
                return entities[match];
            }
            // 处理数字实体
            const numMatch = match.match(/&#(\d+);/);
            if (numMatch) {
                return String.fromCharCode(parseInt(numMatch[1], 10));
            }
            return match;
        });
    }
}
