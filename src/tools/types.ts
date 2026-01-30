/**
 * 工具系统类型定义
 *
 * 定义通用的工具接口，支持：
 * - 文件操作工具
 * - 终端命令工具
 * - 搜索工具
 * - 网络工具
 * - MCP 工具
 */

import type { ILogService } from '../services/logService';

/**
 * JSON Schema 类型（简化版）
 */
export interface JSONSchema {
    type: 'object' | 'string' | 'number' | 'boolean' | 'array';
    properties?: Record<string, JSONSchema & { description?: string }>;
    required?: string[];
    items?: JSONSchema;
    enum?: string[];
    description?: string;
    default?: any;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
    /** 当前工作目录 */
    cwd: string;
    /** 取消信号 */
    abortSignal?: AbortSignal;
    /** 日志服务 */
    logService: ILogService;
    /** 会话 ID（可选，用于跟踪） */
    sessionId?: string;
    /** 额外元数据 */
    metadata?: Record<string, any>;
}

/**
 * 工具执行结果
 */
export interface ToolResult<T = any> {
    /** 是否成功 */
    success: boolean;
    /** 返回数据 */
    data?: T;
    /** 错误信息 */
    error?: string;
    /** 错误详情 */
    errorDetails?: {
        code?: string;
        stack?: string;
        suggestion?: string;
    };
    /** 执行元数据 */
    metadata?: {
        /** 执行耗时（毫秒） */
        duration?: number;
        /** 是否被截断 */
        truncated?: boolean;
        /** 其他信息 */
        [key: string]: any;
    };
}

/**
 * 通用工具接口
 *
 * @template TInput 输入参数类型
 * @template TOutput 输出数据类型
 */
export interface ITool<TInput = any, TOutput = any> {
    /** 工具名称（唯一标识） */
    readonly name: string;

    /** 工具描述（用于模型理解） */
    readonly description: string;

    /** 输入参数 JSON Schema */
    readonly inputSchema: JSONSchema;

    /**
     * 执行工具
     *
     * @param input 输入参数
     * @param context 执行上下文
     * @returns 执行结果
     */
    execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;

    /**
     * 验证输入参数（可选）
     *
     * @param input 输入参数
     * @returns 验证错误信息，无错误返回 undefined
     */
    validate?(input: TInput): string | undefined;
}

/**
 * 工具定义（用于发送给模型）
 */
export interface ToolDefinition {
    /** 工具名称 */
    name: string;
    /** 工具描述 */
    description: string;
    /** 输入参数 Schema */
    input_schema: JSONSchema;
}

/**
 * 工具调用请求（模型返回）
 */
export interface ToolUseRequest {
    /** 工具调用 ID */
    id: string;
    /** 工具名称 */
    name: string;
    /** 输入参数 */
    input: Record<string, any>;
}

/**
 * 工具调用结果（返回给模型）
 */
export interface ToolUseResponse {
    /** 对应的工具调用 ID */
    tool_use_id: string;
    /** 结果类型 */
    type: 'tool_result';
    /** 结果内容 */
    content: string | ContentBlock[];
    /** 是否为错误 */
    is_error?: boolean;
    /** 快照 ID（用于撤回操作） */
    snapshotId?: string;
    /** 是否可撤回 */
    canRevert?: boolean;
}

/**
 * 内容块（支持多种类型）
 */
export interface ContentBlock {
    type: 'text' | 'image';
    text?: string;
    source?: {
        type: 'base64';
        media_type: string;
        data: string;
    };
}

/**
 * 创建成功结果的辅助函数
 */
export function successResult<T>(data: T, metadata?: ToolResult['metadata']): ToolResult<T> {
    return {
        success: true,
        data,
        metadata,
    };
}

/**
 * 创建失败结果的辅助函数
 */
export function errorResult(
    error: string,
    details?: ToolResult['errorDetails']
): ToolResult<never> {
    return {
        success: false,
        error,
        errorDetails: details,
    };
}

/**
 * 从错误对象创建失败结果
 */
export function errorResultFromError(err: unknown, prefix?: string): ToolResult<never> {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    return {
        success: false,
        error: prefix ? `${prefix}: ${message}` : message,
        errorDetails: {
            stack,
        },
    };
}
