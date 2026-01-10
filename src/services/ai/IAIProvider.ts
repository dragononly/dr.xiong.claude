/**
 * IAIProvider - AI Provider 抽象接口
 *
 * 定义统一的 AI 服务提供者接口，支持多种 AI 后端：
 * - Claude (Anthropic)
 * - 其他未来可能的 Provider
 */

import { AsyncStream } from '../claude/transport';

/**
 * AI 消息类型
 */
export interface AIMessage {
    type: string;
    [key: string]: unknown;
}

/**
 * AI 用户消息
 */
export interface AIUserMessage {
    type: 'user';
    content: string;
    [key: string]: unknown;
}

/**
 * Provider 能力描述
 */
export interface ProviderCapabilities {
    /** 是否支持流式输出 */
    streaming: boolean;
    /** 是否支持工具调用 */
    toolUse: boolean;
    /** 是否支持思考模式 */
    thinking: boolean;
    /** 是否支持会话恢复 */
    resume: boolean;
    /** 是否支持中断 */
    interrupt: boolean;
    /** 支持的模型列表 */
    models: string[];
}

/**
 * Provider 类型枚举
 */
export type ProviderType = 'claude';

/**
 * 工具权限回调结果
 */
export interface ToolPermissionResult {
    behavior: 'allow' | 'deny' | 'ask';
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: unknown[];
}

/**
 * 工具权限回调函数类型
 */
export type CanUseToolCallback = (
    toolName: string,
    input: Record<string, unknown>,
    options: { suggestions?: unknown[] }
) => Promise<ToolPermissionResult>;

/**
 * AI Query 接口 - 表示一个正在进行的 AI 查询
 */
export interface IAIQuery extends AsyncIterable<AIMessage> {
    /** 中断查询 */
    interrupt(): Promise<void>;
    /** 设置模型 */
    setModel?(model: string): Promise<void>;
    /** 设置思考 tokens 上限 */
    setMaxThinkingTokens?(tokens: number): Promise<void>;
    /** 设置权限模式 */
    setPermissionMode?(mode: string): Promise<void>;
    /** 返回/清理 */
    return?(): void;
}

/**
 * AI Provider 查询参数
 */
export interface AIQueryParams {
    /** 输入流 */
    inputStream: AsyncStream<AIUserMessage>;
    /** 恢复会话 ID */
    resume: string | null;
    /** 工具权限回调 */
    canUseTool: CanUseToolCallback;
    /** 模型名称 */
    model: string | null;
    /** 工作目录 */
    cwd: string;
    /** 权限模式 */
    permissionMode: string;
    /** 最大思考 tokens */
    maxThinkingTokens?: number;
}

/**
 * AI Provider 接口
 */
export interface IAIProvider {
    /** Provider 类型 */
    readonly type: ProviderType;

    /** Provider 名称（显示用） */
    readonly displayName: string;

    /** 获取 Provider 能力 */
    getCapabilities(): ProviderCapabilities;

    /** 执行查询 */
    query(params: AIQueryParams): Promise<IAIQuery>;

    /** 中断查询 */
    interrupt(query: IAIQuery): Promise<void>;

    /** 检查是否可用（API Key 等） */
    isAvailable(): Promise<boolean>;

    /** 获取可用模型列表 */
    getModels(): Promise<Array<{ id: string; name: string }>>;
}
