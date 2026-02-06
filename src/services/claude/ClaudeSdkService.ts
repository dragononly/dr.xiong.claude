/**
 * ClaudeSdkService - Claude Agent SDK 薄封装
 *
 * 职责：
 * 1. 封装 @anthropic-ai/claude-agent-sdk 的 query() 调用
 * 2. 构建 SDK Options 对象
 * 3. 处理参数转换和环境配置
 * 4. 提供 interrupt() 方法中断查询
 *
 * 依赖：
 * - ILogService: 日志服务
 * - IConfigurationService: 配置服务
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspacePathResolver } from '../workspacePathResolver';
import { ToolParamsValidator } from './utils/ToolParamsValidator';
import {
    generateIdentityPrompt,
    generateVSCodeContextPrompt,
    generateTaskManagementPrompt,
    generateCodingRulesPrompt,
    generateChainOfThoughtPrompt,
    generateUserInstructionPriorityPrompt,
} from '../ai/SystemPrompts';

/**
 * 模型名称映射表
 *
 * 将 UI 中的简短模型 ID 映射为 Anthropic API 兼容的完整模型 ID
 */
const MODEL_NAME_MAPPING: Record<string, string> = {
    // UI 模型 ID -> Anthropic API 完整模型 ID
    'claude-opus-4-5': 'claude-opus-4-5-20251101',
    'claude-opus-4.6': 'claude-opus-4.6',
    'claude-sonnet-4-5': 'claude-sonnet-4-5-20250929',
    'claude-haiku-4-5': 'claude-haiku-4-5-20251001',
    // Gemini 等其他模型直接使用原模型 ID，无需映射
};

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { AsyncStream } from './transport';

// SDK 类型导入
import type {
    Options,
    Query,
    CanUseTool,
    PermissionMode,
    SDKUserMessage,
    HookCallbackMatcher,
} from '@anthropic-ai/claude-agent-sdk';

export const IClaudeSdkService = createDecorator<IClaudeSdkService>('claudeSdkService');

/**
 * SDK 查询参数
 */
export interface SdkQueryParams {
    inputStream: AsyncStream<SDKUserMessage>;
    resume: string | null;
    canUseTool: CanUseTool;
    model: string | null;  // ← 接受 null，内部转换
    cwd: string;
    permissionMode: PermissionMode | string;  // ← 接受字符串
    maxThinkingTokens?: number;  // ← Thinking tokens 上限
}

/**
 * SDK 服务接口
 */
export interface IClaudeSdkService {
    readonly _serviceBrand: undefined;

    /**
     * 调用 Claude SDK 进行查询
     */
    query(params: SdkQueryParams): Promise<Query>;

    /**
     * 中断正在进行的查询
     */
    interrupt(query: Query): Promise<void>;
}

/**
 * 生成优化后的系统提示词（使用 SystemPrompts 模块）
 */
function getVSCodeAppendPrompt(cwd: string): string {
    // 组合各部分优化后的提示词
    const parts = [
        generateIdentityPrompt({ displayName: 'Claude', company: 'Anthropic', impersonateClaude: true }),
        generateVSCodeContextPrompt(cwd),
        generateTaskManagementPrompt(),
        generateCodingRulesPrompt(),
        generateUserInstructionPriorityPrompt(),
        generateChainOfThoughtPrompt(),
    ];

    return parts.join('\n');
}

/**
 * ClaudeSdkService 实现
 */
export class ClaudeSdkService implements IClaudeSdkService {
    readonly _serviceBrand: undefined;

    constructor(
        private readonly context: vscode.ExtensionContext,
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {
        this.logService.info('[ClaudeSdkService] 已初始化');
    }

    /**
     * 调用 Claude SDK 进行查询
     */
    async query(params: SdkQueryParams): Promise<Query> {
        const { inputStream, resume, canUseTool, model, cwd, permissionMode, maxThinkingTokens } = params;

        this.logService.info('========================================');
        this.logService.info('ClaudeSdkService.query() 开始调用');
        this.logService.info('========================================');
        this.logService.info(`📋 输入参数:`);
        this.logService.info(`  - model: ${model}`);
        this.logService.info(`  - cwd: ${cwd}`);
        this.logService.info(`  - permissionMode: ${permissionMode}`);
        this.logService.info(`  - resume: ${resume}`);
        this.logService.info(`  - maxThinkingTokens: ${maxThinkingTokens ?? 'undefined'}`);

        // 参数转换
        // 模型名称映射：将 UI 模型 ID 转换为 Anthropic API 兼容格式
        let modelParam: string;
        if (model === null) {
            modelParam = "default";
        } else if (MODEL_NAME_MAPPING[model]) {
            // 使用映射表转换模型名称
            modelParam = MODEL_NAME_MAPPING[model];
            this.logService.info(`  📌 模型名称映射: ${model} -> ${modelParam}`);
        } else {
            // 未知模型保持原样
            modelParam = model;
            this.logService.info(`  📌 使用原始模型名称: ${modelParam}`);
        }
        const permissionModeParam = permissionMode as PermissionMode;
        const cwdParam = cwd;

        this.logService.info(`🔄 参数转换:`);
        this.logService.info(`  - modelParam: ${modelParam} (原始: ${model})`);
        this.logService.info(`  - permissionModeParam: ${permissionModeParam}`);
        this.logService.info(`  - cwdParam: ${cwdParam}`);

        // 构建 SDK Options
        const options: Options = {
            // 基本参数
            cwd: cwdParam,
            resume: resume || undefined,
            model: modelParam,
            permissionMode: permissionModeParam,
            maxThinkingTokens: maxThinkingTokens,

            // CanUseTool 回调
            canUseTool,

            // 日志回调 - 捕获 SDK 进程的所有标准错误输出
            stderr: (data: string) => {
                const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
                const lines = data.trim().split('\n');

                for (const line of lines) {
                    if (!line.trim()) continue;

                    // 检测错误级别
                    const lowerLine = line.toLowerCase();
                    let level = 'INFO';

                    if (lowerLine.includes('error') || lowerLine.includes('failed') || lowerLine.includes('exception')) {
                        level = 'ERROR';
                    } else if (lowerLine.includes('warn') || lowerLine.includes('warning')) {
                        level = 'WARN';
                    } else if (lowerLine.includes('exit') || lowerLine.includes('terminated')) {
                        level = 'EXIT';
                    }

                    this.logService.info(`[${timestamp}] [SDK ${level}] ${line}`);
                }
            },

            // 环境变量
            env: this.getEnvironmentVariables(),

            // 系统提示追加（包含动态工作目录）
            systemPrompt: {
                type: 'preset',
                preset: 'claude_code',
                append: getVSCodeAppendPrompt(cwdParam)
            },

            // Hooks
            hooks: {
                // SessionStart: 会话开始时记录 session_id 和 source
                // source 可能是: 'startup' | 'resume' | 'clear' | 'compact'
                SessionStart: [{
                    matcher: "*",
                    hooks: [async (input) => {
                        const sessionInput = input as {
                            session_id?: string;
                            cwd?: string;
                            source?: 'startup' | 'resume' | 'clear' | 'compact';
                        };
                        const newSessionId = sessionInput.session_id || 'unknown';
                        const source = sessionInput.source || 'unknown';

                        this.logService.info(`[Hook] SessionStart`);
                        this.logService.info(`[Hook] Session ID: ${newSessionId}`);
                        this.logService.info(`[Hook] Source: ${source}`);
                        this.logService.info(`[Hook] CWD: ${sessionInput.cwd || cwdParam}`);

                        // 记录当前 session 状态
                        (this as any)._currentSessionId = newSessionId;
                        (this as any)._sessionStartTime = Date.now();
                        (this as any)._isResumedSession = (source === 'resume');
                        (this as any)._sessionSource = source;

                        // 如果是 resume，记录日志提醒
                        if (source === 'resume') {
                            this.logService.warn(`[Hook] 检测到 Session Resume - 历史消息将被重放`);
                            this.logService.warn(`[Hook] 将启用积极参数修复模式`);
                        }

                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[],
                // PreToolUse: 工具执行前 - 验证必需参数并尝试修复
                // SDK PreToolUseHookInput 结构为:
                // { hook_event_name: 'PreToolUse', tool_name: string, tool_input: unknown, tool_use_id: string, cwd: string, ... }
                // 注意：tool_input 直接包含工具参数，如 { file_path: string, content: string }
                // 有时模型会返回 raw_arguments 而不是正确解析的参数
                PreToolUse: [{
                    matcher: "Write",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: Write`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);
                        this.logService.info(`[Hook] 输入类型: ${typeof input}`);
                        this.logService.info(`[Hook] 输入键: ${input ? Object.keys(input as object).join(', ') : 'null'}`);

                        // SDK 的 hook 输入格式可能有多种情况：
                        // 1. { tool_input: { file_path, content } } - 嵌套格式
                        // 2. { file_path, content } - 直接格式
                        // 3. { tool_name, tool_input: {...}, cwd, ... } - 完整事件格式
                        const hookInput = input as Record<string, unknown>;

                        // 获取当前工作目录
                        const currentCwd = (hookInput.cwd as string) || cwdParam;
                        const pathResolver = new WorkspacePathResolver(currentCwd);

                        // 智能提取参数：尝试多种可能的结构
                        let params: { file_path?: string; content?: string; raw_arguments?: string } = {};

                        // 情况1: tool_input 嵌套格式
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                            this.logService.info(`[Hook] 从 tool_input 提取参数`);
                        }
                        // 情况2: 直接格式 (参数直接在 input 上)
                        else if (hookInput.file_path !== undefined || hookInput.content !== undefined) {
                            params = {
                                file_path: hookInput.file_path as string,
                                content: hookInput.content as string,
                                raw_arguments: hookInput.raw_arguments as string
                            };
                            this.logService.info(`[Hook] 从顶层提取参数`);
                        }

                        this.logService.info(`[Hook] 提取的参数: ${JSON.stringify(params)}`);

                        // 标记是否进行了参数修复
                        let wasFixed = false;

                        // 尝试从 raw_arguments 解析参数（如果存在）
                        if (params.raw_arguments && (!params.file_path || params.content === undefined)) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.file_path && !params.file_path) {
                                    params.file_path = parsed.file_path;
                                    wasFixed = true;
                                }
                                if (parsed.content !== undefined && params.content === undefined) {
                                    params.content = parsed.content;
                                    wasFixed = true;
                                }
                                this.logService.info(`[Hook] raw_arguments 解析成功: file_path=${parsed.file_path}`);
                            } catch (e) {
                                this.logService.warn(`[Hook] raw_arguments 解析失败: ${e}`);
                            }
                        }

                        // 自动修复路径：将相对路径转换为绝对路径
                        if (params.file_path) {
                            const fixResult = pathResolver.fixToolPath(params.file_path, 'Write');
                            if (fixResult.wasFixed) {
                                this.logService.info(`[Hook] Write 路径已修复: ${params.file_path} -> ${fixResult.fixedPath}`);
                                this.logService.info(`[Hook] 修复说明: ${fixResult.fixDescription}`);
                                params.file_path = fixResult.fixedPath;
                                wasFixed = true;
                            }
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(currentCwd);
                        const result = validator.validate('Write', params);

                        // 检查是否是 resumed session（需要积极修复）
                        const isResumedSession = (this as any)._isResumedSession === true;

                        if (!result.valid) {
                            // 尝试积极修复：为缺失的参数提供默认值
                            const canFix = this.tryFixWriteParams(params, result.missingParams, currentCwd, isResumedSession);

                            if (canFix.fixed) {
                                this.logService.warn(`[Hook] Write 参数积极修复成功`);
                                this.logService.warn(`[Hook] 修复详情: ${canFix.fixDescription}`);
                                wasFixed = true;
                                params = canFix.params;
                            } else {
                                // 无法修复，使用 permissionDecision: 'deny' 来阻止工具执行
                                this.logService.error(`[Hook] Write 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                                this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                                return {
                                    continue: true,  // 必须为 true，否则 SDK 会抛出内部错误
                                    hookSpecificOutput: {
                                        hookEventName: 'PreToolUse' as const,
                                        permissionDecision: 'deny',
                                        permissionDecisionReason: result.errorMessage || `Write 工具调用失败：缺少必需参数 ${result.missingParams.join(' 和 ')}。请确保提供 file_path（绝对路径，如 ${currentCwd}/example.ts）和 content 参数。`
                                    }
                                };
                            }
                        }

                        // 如果进行了修复，返回 updatedInput 让 SDK 使用修复后的参数
                        if (wasFixed) {
                            this.logService.info(`[Hook] Write 参数已修复，返回 updatedInput`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    updatedInput: {
                                        file_path: params.file_path,
                                        content: params.content
                                    }
                                }
                            };
                        }

                        this.logService.info(`[Hook] Write 参数验证通过`);
                        return { continue: true };
                    }]
                }, {
                    matcher: "Edit",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: Edit`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);

                        const hookInput = input as {
                            cwd?: string;
                            tool_input?: {
                                file_path?: string;
                                old_string?: string;
                                new_string?: string;
                                raw_arguments?: string;
                            } | unknown;
                        };

                        const currentCwd = hookInput.cwd || cwdParam;
                        const pathResolver = new WorkspacePathResolver(currentCwd);

                        let params: { file_path?: string; old_string?: string; new_string?: string; raw_arguments?: string } = {};
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                        }

                        // 标记是否进行了参数修复
                        let wasFixed = false;

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && (!params.file_path || params.old_string === undefined || params.new_string === undefined)) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.file_path && !params.file_path) {
                                    params.file_path = parsed.file_path;
                                    wasFixed = true;
                                }
                                if (parsed.old_string !== undefined && params.old_string === undefined) {
                                    params.old_string = parsed.old_string;
                                    wasFixed = true;
                                }
                                if (parsed.new_string !== undefined && params.new_string === undefined) {
                                    params.new_string = parsed.new_string;
                                    wasFixed = true;
                                }
                                this.logService.info(`[Hook] raw_arguments 解析成功: file_path=${parsed.file_path}`);
                            } catch (e) {
                                this.logService.warn(`[Hook] raw_arguments 解析失败: ${e}`);
                            }
                        }

                        // 自动修复路径：将相对路径转换为绝对路径
                        if (params.file_path) {
                            const fixResult = pathResolver.fixToolPath(params.file_path, 'Edit');
                            if (fixResult.wasFixed) {
                                this.logService.info(`[Hook] Edit 路径已修复: ${params.file_path} -> ${fixResult.fixedPath}`);
                                this.logService.info(`[Hook] 修复说明: ${fixResult.fixDescription}`);
                                params.file_path = fixResult.fixedPath;
                                wasFixed = true;
                            }
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(currentCwd);
                        const result = validator.validate('Edit', params);

                        // 检查是否是 resumed session（需要积极修复）
                        const isResumedSession = (this as any)._isResumedSession === true;

                        if (!result.valid) {
                            // 尝试积极修复
                            const canFix = this.tryFixEditParams(params, result.missingParams, currentCwd, isResumedSession);

                            if (canFix.fixed) {
                                this.logService.warn(`[Hook] Edit 参数积极修复成功`);
                                this.logService.warn(`[Hook] 修复详情: ${canFix.fixDescription}`);
                                wasFixed = true;
                                params = canFix.params;
                            } else {
                                this.logService.error(`[Hook] Edit 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                                this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                                return {
                                    continue: true,
                                    hookSpecificOutput: {
                                        hookEventName: 'PreToolUse' as const,
                                        permissionDecision: 'deny',
                                        permissionDecisionReason: result.errorMessage || `Edit 工具调用失败：缺少必需参数 ${result.missingParams.join(' 和 ')}。请确保提供 file_path（绝对路径）、old_string 和 new_string 参数。`
                                    }
                                };
                            }
                        }

                        // 如果进行了修复，返回 updatedInput 让 SDK 使用修复后的参数
                        if (wasFixed) {
                            this.logService.info(`[Hook] Edit 参数已修复，返回 updatedInput`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    updatedInput: {
                                        file_path: params.file_path,
                                        old_string: params.old_string,
                                        new_string: params.new_string
                                    }
                                }
                            };
                        }

                        this.logService.info(`[Hook] Edit 参数验证通过`);
                        return { continue: true };
                    }]
                }, {
                    matcher: "Read",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: Read`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);

                        const hookInput = input as {
                            cwd?: string;
                            tool_input?: {
                                file_path?: string;
                                raw_arguments?: string;
                            } | unknown;
                        };

                        const currentCwd = hookInput.cwd || cwdParam;
                        const pathResolver = new WorkspacePathResolver(currentCwd);

                        let params: { file_path?: string; raw_arguments?: string } = {};
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                        }

                        // 标记是否进行了参数修复
                        let wasFixed = false;

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && !params.file_path) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.file_path) {
                                    params.file_path = parsed.file_path;
                                    wasFixed = true;
                                }
                                this.logService.info(`[Hook] raw_arguments 解析成功: file_path=${parsed.file_path}`);
                            } catch (e) {
                                this.logService.warn(`[Hook] raw_arguments 解析失败: ${e}`);
                            }
                        }

                        // 自动修复路径：将相对路径转换为绝对路径
                        if (params.file_path) {
                            const fixResult = pathResolver.fixToolPath(params.file_path, 'Read');
                            if (fixResult.wasFixed) {
                                this.logService.info(`[Hook] Read 路径已修复: ${params.file_path} -> ${fixResult.fixedPath}`);
                                this.logService.info(`[Hook] 修复说明: ${fixResult.fixDescription}`);
                                params.file_path = fixResult.fixedPath;
                                wasFixed = true;
                            }
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(currentCwd);
                        const result = validator.validate('Read', params);

                        if (!result.valid) {
                            this.logService.error(`[Hook] Read 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                            this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    permissionDecision: 'deny',
                                    permissionDecisionReason: result.errorMessage || `Read 工具调用失败：缺少必需参数 ${result.missingParams.join(' 和 ')}。请确保提供 file_path（绝对路径）参数。`
                                }
                            };
                        }

                        // 如果进行了修复，返回 updatedInput 让 SDK 使用修复后的参数
                        if (wasFixed) {
                            this.logService.info(`[Hook] Read 参数已修复，返回 updatedInput`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    updatedInput: {
                                        file_path: params.file_path
                                    }
                                }
                            };
                        }

                        this.logService.info(`[Hook] Read 参数验证通过`);
                        return { continue: true };
                    }]
                }, {
                    matcher: "Glob",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: Glob`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);

                        const hookInput = input as {
                            cwd?: string;
                            tool_input?: {
                                pattern?: string;
                                path?: string;
                                raw_arguments?: string;
                            } | unknown;
                        };

                        const currentCwd = hookInput.cwd || cwdParam;
                        const pathResolver = new WorkspacePathResolver(currentCwd);

                        let params: { pattern?: string; path?: string; raw_arguments?: string } = {};
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                        }

                        // 标记是否进行了参数修复
                        let wasFixed = false;

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && !params.pattern) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.pattern && !params.pattern) {
                                    params.pattern = parsed.pattern;
                                    wasFixed = true;
                                }
                                if (parsed.path && !params.path) {
                                    params.path = parsed.path;
                                    wasFixed = true;
                                }
                                this.logService.info(`[Hook] raw_arguments 解析成功: pattern=${parsed.pattern}, path=${parsed.path}`);
                            } catch (e) {
                                this.logService.warn(`[Hook] raw_arguments 解析失败: ${e}`);
                            }
                        }

                        // 自动修复 path 参数：将相对路径转换为绝对路径
                        if (params.path) {
                            const fixResult = pathResolver.fixToolPath(params.path, 'Glob');
                            if (fixResult.wasFixed) {
                                this.logService.info(`[Hook] Glob path 已修复: ${params.path} -> ${fixResult.fixedPath}`);
                                this.logService.info(`[Hook] 修复说明: ${fixResult.fixDescription}`);
                                params.path = fixResult.fixedPath;
                                wasFixed = true;
                            }
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(currentCwd);
                        const result = validator.validate('Glob', params);

                        if (!result.valid) {
                            this.logService.error(`[Hook] Glob 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                            this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    permissionDecision: 'deny',
                                    permissionDecisionReason: result.errorMessage || `Glob 工具调用失败：缺少必需参数 ${result.missingParams.join(' 和 ')}。请确保提供 pattern 参数。`
                                }
                            };
                        }

                        // 如果进行了修复，返回 updatedInput 让 SDK 使用修复后的参数
                        if (wasFixed) {
                            this.logService.info(`[Hook] Glob 参数已修复，返回 updatedInput`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    updatedInput: {
                                        pattern: params.pattern,
                                        path: params.path
                                    }
                                }
                            };
                        }

                        this.logService.info(`[Hook] Glob 参数验证通过`);
                        return { continue: true };
                    }]
                }, {
                    matcher: "Grep",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: Grep`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);

                        const hookInput = input as {
                            cwd?: string;
                            tool_input?: {
                                pattern?: string;
                                path?: string;
                                raw_arguments?: string;
                            } | unknown;
                        };

                        const currentCwd = hookInput.cwd || cwdParam;
                        const pathResolver = new WorkspacePathResolver(currentCwd);

                        let params: { pattern?: string; path?: string; raw_arguments?: string } = {};
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                        }

                        // 标记是否进行了参数修复
                        let wasFixed = false;

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && !params.pattern) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.pattern && !params.pattern) {
                                    params.pattern = parsed.pattern;
                                    wasFixed = true;
                                }
                                if (parsed.path && !params.path) {
                                    params.path = parsed.path;
                                    wasFixed = true;
                                }
                                this.logService.info(`[Hook] raw_arguments 解析成功: pattern=${parsed.pattern}, path=${parsed.path}`);
                            } catch (e) {
                                this.logService.warn(`[Hook] raw_arguments 解析失败: ${e}`);
                            }
                        }

                        // 自动修复 path 参数：将相对路径转换为绝对路径
                        if (params.path) {
                            const fixResult = pathResolver.fixToolPath(params.path, 'Grep');
                            if (fixResult.wasFixed) {
                                this.logService.info(`[Hook] Grep path 已修复: ${params.path} -> ${fixResult.fixedPath}`);
                                this.logService.info(`[Hook] 修复说明: ${fixResult.fixDescription}`);
                                params.path = fixResult.fixedPath;
                                wasFixed = true;
                            }
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(currentCwd);
                        const result = validator.validate('Grep', params);

                        if (!result.valid) {
                            this.logService.error(`[Hook] Grep 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                            this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    permissionDecision: 'deny',
                                    permissionDecisionReason: result.errorMessage || `Grep 工具调用失败：缺少必需参数 ${result.missingParams.join(' 和 ')}。请确保提供 pattern 参数。`
                                }
                            };
                        }

                        // 如果进行了修复，返回 updatedInput 让 SDK 使用修复后的参数
                        if (wasFixed) {
                            this.logService.info(`[Hook] Grep 参数已修复，返回 updatedInput`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    updatedInput: {
                                        pattern: params.pattern,
                                        path: params.path
                                    }
                                }
                            };
                        }

                        this.logService.info(`[Hook] Grep 参数验证通过`);
                        return { continue: true };
                    }]
                }, {
                    matcher: "Task",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: Task`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);

                        const hookInput = input as {
                            tool_input?: { description?: string; prompt?: string; subagent_type?: string } | unknown;
                        };

                        let params: { description?: string; prompt?: string; subagent_type?: string } = {};
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as { description?: string; prompt?: string; subagent_type?: string };
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(cwdParam);
                        const result = validator.validate('Task', params);

                        if (!result.valid) {
                            this.logService.error(`[Hook] Task 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                            this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    permissionDecision: 'deny',
                                    permissionDecisionReason: result.errorMessage || `Task 工具调用失败：缺少必需参数 ${result.missingParams.join(' 和 ')}。请确保提供 description、prompt 和 subagent_type 参数。`
                                }
                            };
                        }

                        this.logService.info(`[Hook] Task 参数验证通过`);
                        return { continue: true };
                    }]
                }, {
                    matcher: "TodoWrite",
                    hooks: [async (input, toolUseID, options) => {
                        this.logService.info(`[Hook] PreToolUse: TodoWrite`);
                        this.logService.info(`[Hook] 完整输入: ${JSON.stringify(input, null, 2)}`);

                        const hookInput = input as Record<string, unknown>;

                        // 智能提取参数
                        let params: { todos?: unknown[] } = {};

                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                            this.logService.info(`[Hook] 从 tool_input 提取参数`);
                        } else if (hookInput.todos !== undefined) {
                            params = { todos: hookInput.todos as unknown[] };
                            this.logService.info(`[Hook] 从顶层提取参数`);
                        }

                        // 使用统一验证器进行验证
                        const validator = new ToolParamsValidator(cwdParam);
                        const result = validator.validate('TodoWrite', params);

                        if (!result.valid) {
                            this.logService.error(`[Hook] TodoWrite 工具缺少必需参数: ${result.missingParams.join(', ')}`);
                            this.logService.error(`[Hook] 错误详情: ${result.errorMessage}`);
                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PreToolUse' as const,
                                    permissionDecision: 'deny',
                                    permissionDecisionReason: result.errorMessage || `TodoWrite 工具调用失败：缺少必需参数 todos。请提供待办事项数组，格式：TodoWrite(todos=[{"content": "任务", "status": "pending", "activeForm": "执行任务"}])`
                                }
                            };
                        }

                        this.logService.info(`[Hook] TodoWrite 参数验证通过`);
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[],
                // PostToolUse: 工具执行后
                PostToolUse: [{
                    matcher: "Edit|Write|MultiEdit",
                    hooks: [async (input, toolUseID, options) => {
                        if ('tool_name' in input) {
                            this.logService.info(`[Hook] PostToolUse: ${input.tool_name}`);
                        }
                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[],
                // PostToolUseFailure: 工具执行失败后 - 提供错误恢复指导
                PostToolUseFailure: [{
                    matcher: "Write|Edit|Read|Glob|Grep",
                    hooks: [async (input, toolUseID, options) => {
                        const failureInput = input as {
                            hook_event_name: 'PostToolUseFailure';
                            tool_name: string;
                            tool_input: unknown;
                            tool_use_id: string;
                            error: string;
                            cwd: string;
                            session_id?: string;
                            transcript_path?: string;
                        };

                        const currentSessionId = failureInput.session_id || 'unknown';
                        const previousSessionId = (this as any)._currentSessionId || 'unknown';
                        const sessionChanged = previousSessionId !== 'unknown' && currentSessionId !== previousSessionId;

                        this.logService.error(`[Hook] PostToolUseFailure: ${failureInput.tool_name}`);
                        this.logService.error(`[Hook] Session ID: ${currentSessionId} (之前: ${previousSessionId})`);
                        this.logService.error(`[Hook] Session 变化: ${sessionChanged ? '是' : '否'}`);
                        this.logService.error(`[Hook] Transcript: ${failureInput.transcript_path || 'unknown'}`);
                        this.logService.error(`[Hook] 错误信息: ${failureInput.error}`);
                        this.logService.error(`[Hook] 工具输入: ${JSON.stringify(failureInput.tool_input, null, 2)}`);

                        // 检测是否是参数缺失错误
                        const isInputValidationError = failureInput.error.includes('InputValidationError') ||
                            failureInput.error.includes('required parameter') ||
                            failureInput.error.includes('missing');

                        const currentCwd = failureInput.cwd || cwdParam;

                        // 如果 session 发生变化，提供更强的上下文重置指导
                        if (sessionChanged) {
                            this.logService.warn(`[Hook] 检测到 Session 变化！可能是账号切换或认证问题`);

                            const sessionResetContext = `
【重要提示】检测到会话状态变化，请注意以下信息：

当前工作环境：
- 工作目录: ${currentCwd}
- Session ID: ${currentSessionId}

所有文件操作必须使用绝对路径，格式如下：
- Write: Write(file_path="${currentCwd}/path/to/file.ts", content="内容")
- Edit: Edit(file_path="${currentCwd}/path/to/file.ts", old_string="旧内容", new_string="新内容")
- Read: Read(file_path="${currentCwd}/path/to/file.ts")

请使用正确的绝对路径重新执行操作。`;

                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PostToolUseFailure' as const,
                                    additionalContext: sessionResetContext
                                }
                            };
                        }

                        if (isInputValidationError) {
                            let additionalContext = '';

                            // 根据工具类型提供具体的修复指导
                            switch (failureInput.tool_name) {
                                case 'Write':
                                    additionalContext = `

【重要修复指导】Write 工具调用失败，请按以下格式重新调用：

正确格式：
Write(file_path="${currentCwd}/your/file/path.ts", content="文件内容")

必需参数：
1. file_path: 必须是绝对路径，以 "${currentCwd}/" 开头
2. content: 文件内容，不能省略

错误示例（不要这样做）：
- Write() ❌ 缺少所有参数
- Write(content="...") ❌ 缺少 file_path
- Write(file_path="relative/path.ts") ❌ 使用了相对路径

确的绝对路径和完整参数重新调用 Write 工具。`;
                                    break;

                                case 'Edit':
                                    additionalContext = `

【重要修复指导】Edit 工具调用失败，请按以下格式重新调用：

正确格式：
Edit(file_path="${currentCwd}/your/file/path.ts", old_string="要替换的内容", new_string="新内容")

必需参数：
1. file_path: 必须是绝对路径
2. old_string: 要替换的原始字符串
3. new_string: 替换后的新字符串

请使用正确的参数重新调用 Edit 工具。`;
                                    break;

                                case 'Read':
                                    additionalContext = `

【重要修复指导】Read 工具调用失败，请按以下格式重新调用：

正确格式：
Read(file_path="${currentCwd}/your/file/path.ts")

必需参数：
1. file_path: 必须是绝对路径

请使用正确的绝对路径重新调用 Read 工具。`;
                                    break;

                                default:
                                    additionalContext = `

【重要修复指导】${failureInput.tool_name} 工具调用失败。
当前工作目录: ${currentCwd}
请确保所有路径参数使用绝对路径，并提供所有必需参数。`;
                            }

                            return {
                                continue: true,
                                hookSpecificOutput: {
                                    hookEventName: 'PostToolUseFailure' as const,
                                    additionalContext
                                }
                            };
                        }

                        return { continue: true };
                    }]
                }] as HookCallbackMatcher[]
            },

            // CLI 可执行文件路径
            pathToClaudeCodeExecutable: this.getClaudeExecutablePath(),

            // 额外参数
            extraArgs: {} as Record<string, string | null>,

            // 设置源
            // 'user': ~/.claude/settings.json (API 密钥)
            // 'project': .claude/settings.json (项目设置, CLAUDE.md)
            // 'local': .claude/settings.local.json (本地设置)
            settingSources: ['user', 'project', 'local'],

            includePartialMessages: true,
        };

        // 调用 SDK
        this.logService.info('');
        this.logService.info('🚀 准备调用 Claude Agent SDK');
        this.logService.info('----------------------------------------');

        // 获取 CLI 路径（避免 TypeScript 类型推断问题）
        const cliPath = this.getClaudeExecutablePath();

        // 记录 CLI 路径
        this.logService.info(`📂 CLI 可执行文件:`);
        this.logService.info(`  - Path: ${cliPath}`);

        // 检查 CLI 是否存在
        if (!fs.existsSync(cliPath)) {
            this.logService.error(`❌ Claude CLI not found at: ${cliPath}`);
            throw new Error(`Claude CLI not found at: ${cliPath}`);
        }
        this.logService.info(`  ✓ CLI 文件存在`);

        // 检查文件权限
        try {
            const stats = fs.statSync(cliPath);
            this.logService.info(`  - File size: ${stats.size} bytes`);
            this.logService.info(`  - Is executable: ${(stats.mode & fs.constants.X_OK) !== 0}`);
        } catch (e) {
            this.logService.warn(`  ⚠ Could not check file stats: ${e}`);
        }

        // 设置入口点环境变量
        process.env.CLAUDE_CODE_ENTRYPOINT = "claude-vscode";
        this.logService.info(`🔧 环境变量:`);
        this.logService.info(`  - CLAUDE_CODE_ENTRYPOINT: ${process.env.CLAUDE_CODE_ENTRYPOINT}`);

        this.logService.info('');
        this.logService.info('📦 导入 SDK...');

        try {
            // 调用 SDK query() 函数
            const { query } = await import('@anthropic-ai/claude-agent-sdk');

            this.logService.info(`  - Options: [已配置参数 ${Object.keys(options).join(', ')}]`);

            const result = query({ prompt: inputStream, options });
            return result;
        } catch (error) {
            this.logService.error('');
            this.logService.error('❌❌❌ SDK 调用失败 ❌❌❌');
            this.logService.error(`Error: ${error}`);
            if (error instanceof Error) {
                this.logService.error(`Message: ${error.message}`);
                this.logService.error(`Stack: ${error.stack}`);
            }
            this.logService.error('========================================');
            throw error;
        }
    }

    /**
     * 中断正在进行的查询
     */
    async interrupt(query: Query): Promise<void> {
        try {
            this.logService.info('🛑 中断 Claude SDK 查询');
            await query.interrupt();
            this.logService.info('✓ 查询已中断');
        } catch (error) {
            this.logService.error(`❌ 中断查询失败: ${error}`);
            throw error;
        }
    }

    /**
     * 尝试修复 Write 工具的缺失参数
     * 在 resumed session 中会更积极地尝试修复
     */
    private tryFixWriteParams(
        params: { file_path?: string; content?: string },
        missingParams: string[],
        cwd: string,
        isResumedSession: boolean
    ): { fixed: boolean; params: { file_path?: string; content?: string }; fixDescription: string } {
        const fixedParams = { ...params };
        const fixes: string[] = [];

        // 如果缺少 content，在 resumed session 中提供空字符串
        if (missingParams.includes('content')) {
            if (isResumedSession) {
                // 在 resumed session 中，提供空内容让操作继续
                // 这样可以避免错误循环，让模型有机会重新尝试
                fixedParams.content = '';
                fixes.push('content 设为空字符串（resumed session 恢复模式）');
            }
        }

        // 如果缺少 file_path，无法修复（必须由模型提供）
        if (missingParams.includes('file_path')) {
            // file_path 无法猜测，必须返回失败
            return {
                fixed: false,
                params: fixedParams,
                fixDescription: 'file_path 无法自动修复，必须由模型提供'
            };
        }

        // 检查是否所有缺失参数都已修复
        const stillMissing = missingParams.filter(p => {
            if (p === 'content') return fixedParams.content === undefined;
            if (p === 'file_path') return !fixedParams.file_path;
            return true;
        });

        if (stillMissing.length === 0) {
            return {
                fixed: true,
                params: fixedParams,
                fixDescription: fixes.join('; ')
            };
        }

        return {
            fixed: false,
            params: fixedParams,
            fixDescription: `无法修复: ${stillMissing.join(', ')}`
        };
    }

    /**
     * 尝试修复 Edit 工具的缺失参数
     */
    private tryFixEditParams(
        params: { file_path?: string; old_string?: string; new_string?: string },
        missingParams: string[],
        cwd: string,
        isResumedSession: boolean
    ): { fixed: boolean; params: { file_path?: string; old_string?: string; new_string?: string }; fixDescription: string } {
        const fixedParams = { ...params };
        const fixes: string[] = [];

        // Edit 工具的参数都是必需的，无法安全地提供默认值
        // 但在 resumed session 中，如果只缺少 new_string，可以设为空字符串（表示删除）
        if (missingParams.includes('new_string') && !missingParams.includes('old_string') && !missingParams.includes('file_path')) {
            if (isResumedSession) {
                fixedParams.new_string = '';
                fixes.push('new_string 设为空字符串（resumed session 恢复模式，表示删除操作）');
            }
        }

        // file_path 和 old_string 无法猜测
        if (missingParams.includes('file_path') || missingParams.includes('old_string')) {
            return {
                fixed: false,
                params: fixedParams,
                fixDescription: `${missingParams.filter(p => p !== 'new_string').join(' 和 ')} 无法自动修复`
            };
        }

        // 检查是否所有缺失参数都已修复
        const stillMissing = missingParams.filter(p => {
            if (p === 'new_string') return fixedParams.new_string === undefined;
            if (p === 'old_string') return fixedParams.old_string === undefined;
            if (p === 'file_path') return !fixedParams.file_path;
            return true;
        });

        if (stillMissing.length === 0) {
            return {
                fixed: true,
                params: fixedParams,
                fixDescription: fixes.join('; ')
            };
        }

        return {
            fixed: false,
            params: fixedParams,
            fixDescription: `无法修复: ${stillMissing.join(', ')}`
        };
    }

    /**
     * 获取环境变量
     * 如果配置了 xiong.apiKey，则设置为 ANTHROPIC_API_KEY
     */
    private getEnvironmentVariables(): Record<string, string> {
        const xiongConfig = vscode.workspace.getConfiguration("xiong");
        const customVars = xiongConfig.get<Array<{ name: string; value: string }>>("environmentVariables", []);

        const env = { ...process.env };

        // 读取 xiong.apiKey 配置
        const xiongApiKey = xiongConfig.get<string>("apiKey");
        if (xiongApiKey && xiongApiKey.trim() !== '') {
            // 如果配置了 xiong.apiKey，使用它作为 ANTHROPIC_API_KEY
            env.ANTHROPIC_API_KEY = xiongApiKey.trim();
            this.logService.info('[ClaudeSdkService] 使用 xiong.apiKey 作为 ANTHROPIC_API_KEY');
        } else {
            // 没有配置 xiong.apiKey，删除环境变量让 SDK 从 ~/.claude/ 读取
            delete env.ANTHROPIC_API_KEY;
            this.logService.info('[ClaudeSdkService] 未配置 xiong.apiKey，SDK 将使用 ~/.claude/ 凭据');
        }

        // 读取 xiong.baseUrl 配置（如果有的话）
        const xiongBaseUrl = xiongConfig.get<string>("baseUrl");
        if (xiongBaseUrl && xiongBaseUrl.trim() !== '') {
            env.ANTHROPIC_BASE_URL = xiongBaseUrl.trim();
            this.logService.info(`[ClaudeSdkService] 使用自定义 Base URL: ${xiongBaseUrl}`);
        }

        // 读取 xiong.selectedModel 配置并设置 ANTHROPIC_MODEL（仅在未显式设置时）
        const selectedModel = xiongConfig.get<string>("selectedModel");
        if (selectedModel && selectedModel.trim() !== '') {
            const mappedModel = MODEL_NAME_MAPPING[selectedModel] || selectedModel;
            if (!env.ANTHROPIC_MODEL || env.ANTHROPIC_MODEL.trim() === '') {
                env.ANTHROPIC_MODEL = mappedModel;
                this.logService.info(`[ClaudeSdkService] 使用 ANTHROPIC_MODEL: ${mappedModel}`);
            }
        }

        for (const item of customVars) {
            if (item.name) {
                env[item.name] = item.value || "";
            }
        }

        return env as Record<string, string>;
    }

    /**
     * 获取 Claude CLI 可执行文件路径
     */
    private getClaudeExecutablePath(): string {
        const configuredCliPath = this.configService.getValue<string>('xiong.claudeCliPath');
        if (configuredCliPath && configuredCliPath.trim() !== '') {
            return configuredCliPath.trim();
        }

        const binaryName = process.platform === "win32" ? "claude.exe" : "claude";
        const arch = process.arch;

        const nativePath = this.context.asAbsolutePath(
            `resources/native-binaries/${process.platform}-${arch}/${binaryName}`
        );

        if (fs.existsSync(nativePath)) {
            return nativePath;
        }

        return this.context.asAbsolutePath("resources/claude-code/cli.js");
    }
}
