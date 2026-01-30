/**
 * Permission Types - 本地权限类型定义
 * 替代 @anthropic-ai/claude-agent-sdk 中的类型
 */

/**
 * 权限模式
 * - default: 默认模式，需要确认
 * - acceptEdits: 自动接受编辑
 * - bypassPermissions: 跳过权限检查
 * - plan: 计划模式
 */
export type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

/**
 * 权限更新
 */
export interface PermissionUpdate {
    /** 工具名称 */
    tool?: string;
    /** 权限类型 */
    type?: string;
    /** 是否允许 */
    allowed?: boolean;
    /** 其他数据 */
    [key: string]: unknown;
}

/**
 * 允许权限结果
 */
export interface PermissionResultAllow {
    behavior: 'allow';
    updatedInput?: Record<string, unknown>;
    updatedPermissions?: PermissionUpdate[];
}

/**
 * 拒绝权限结果
 */
export interface PermissionResultDeny {
    behavior: 'deny';
    message?: string;
    interrupt?: boolean;
}

/**
 * 权限结果
 */
export type PermissionResult = PermissionResultAllow | PermissionResultDeny;

/**
 * SDK 用户消息内容块
 */
export interface SDKUserMessageContent {
    type: 'text' | 'image' | 'tool_result';
    text?: string;
    source?: {
        type: 'base64';
        media_type: string;
        data: string;
    };
    tool_use_id?: string;
    content?: string | SDKUserMessageContent[];
    is_error?: boolean;
    /** 快照 ID（用于撤回操作） */
    snapshotId?: string;
    /** 是否可撤回 */
    canRevert?: boolean;
}

/**
 * SDK 用户消息
 */
export interface SDKUserMessage {
    role: 'user';
    content: string | SDKUserMessageContent[];
}
/**
 * SDK 助手消息内容块
 */
export interface SDKAssistantContentBlock {
    type: 'text' | 'tool_use' | 'thinking';
    text?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
    thinking?: string;
}

/**
 * SDK 助手消息
 */
export interface SDKAssistantMessage {
    role: 'assistant';
    content: string | SDKAssistantContentBlock[];
}

/**
 * SDK 消息（用户或助手）
 */
export type SDKMessage = SDKUserMessage | SDKAssistantMessage;