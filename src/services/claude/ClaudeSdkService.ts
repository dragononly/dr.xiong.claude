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
 * 生成 VSCode 追加提示（包含动态工作目录）
 */
function getVSCodeAppendPrompt(cwd: string): string {
    return `
  # VSCode Extension Context

  You are running inside a VSCode native extension environment.

  ## CRITICAL: Current Working Directory
  **The user's VSCode workspace is located at: ${cwd}**

  When using file tools (Write, Edit, Read, Glob, Grep), you MUST:
  1. Use ABSOLUTE paths starting with "${cwd}/"
  2. NEVER use relative paths or placeholder paths
  3. ALWAYS provide all required parameters for each tool
  4. **CRITICAL**: For Write tool, you MUST provide BOTH file_path AND content parameters
     - file_path: MUST be an absolute path like "${cwd}/src/file.ts"
     - content: MUST be provided (even if empty string "")
     - DO NOT use raw_arguments or any other format
     - Example: Write(file_path="${cwd}/test.txt", content="hello")

  Example correct paths:
  - ${cwd}/src/index.ts
  - ${cwd}/package.json
  - ${cwd}/README.md

  **IMPORTANT**: If you call Write without both file_path and content parameters, the tool will fail with InputValidationError.

  ## Code References in Text
  IMPORTANT: When referencing files or code locations, use markdown link syntax to make them clickable:
  - For files: [filename.ts](src/filename.ts)
  - For specific lines: [filename.ts:42](src/filename.ts#L42)
  - For a range of lines: [filename.ts:42-51](src/filename.ts#L For folders: [src/utils/](src/utils/)
  Unless explicitly asked for by the user, DO NOT USE backtickets \` or HTML tags like code for file references - always use markdown [text](link) format.
  The URL links should be relative paths from the root of the user's workspace.

  ## User Selection Context
  The user's IDE selection (if any) is included in the conversation context and marked with ide_selection tags. This represents code or text the user has highlighted in their editor and may or may not be relevant to their request.`;
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

                        // SDK 的 hook 输入格式
                        const hookInput = input as {
                            cwd?: string;
                            tool_input?: {
                                file_path?: string;
                                content?: string;
                                raw_arguments?: string;  // 有时模型返回未解析的 JSON 字符串
                            } | unknown;
                        };

                        // 获取当前工作目录
                        const currentCwd = hookInput.cwd || cwdParam;
                        const pathResolver = new WorkspacePathResolver(currentCwd);

                        // 安全地获取 tool_input
                        let params: { file_path?: string; content?: string; raw_arguments?: string } = {};
                        if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                            params = hookInput.tool_input as typeof params;
                        }

                        // 尝试从 raw_arguments 解析参数（如果存在）
                        if (params.raw_arguments && (!params.file_path || params.content === undefined)) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.file_path) params.file_path = parsed.file_path;
                                if (parsed.content !== undefined) params.content = parsed.content;
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
                                // 更新 tool_input 中的路径
                                if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                                    (hookInput.tool_input as { file_path?: string }).file_path = fixResult.fixedPath;
                                }
                            }
                        }

                        this.logService.info(`[Hook] Write 参数: file_path=${params.file_path}, content=${params.content !== undefined ? '(有内容)' : '(无内容)'}`);

                        const missingParams: string[] = [];
                        if (!params.file_path) missingParams.push('file_path');
                        if (params.content === undefined || params.content === null) missingParams.push('content');

                        if (missingParams.length > 0) {
                            this.logService.error(`[Hook] Write 工具缺少必需参数: ${missingParams.join(', ')}`);

                            // 阻止执行并返回友好的错误信息给模型
                            return {
                                continue: false,
                                reason: `Write 工具调用失败：缺少必需参数 ${missingParams.join(' 和 ')}。

当前 VSCode 工作目录: ${currentCwd}

请重新调用 Write 工具，确保：
1. file_path 使用绝对路径，例如: ${currentCwd}/src/example.ts
2. content 参数必须提供（即使是空字符串也要明确传入）
3. 不要使用 raw_arguments，直接传递 file_path 和 content 参数`
                            };
                        }

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

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && (!params.file_path || params.old_string === undefined || params.new_string === undefined)) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.file_path) params.file_path = parsed.file_path;
                                if (parsed.old_string !== undefined) params.old_string = parsed.old_string;
                                if (parsed.new_string !== undefined) params.new_string = parsed.new_string;
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
                                // 更新 tool_input 中的路径
                                if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                                    (hookInput.tool_input as { file_path?: string }).file_path = fixResult.fixedPath;
                                }
                            }
                        }

                        this.logService.info(`[Hook] Edit 参数: file_path=${params.file_path}`);

                        const missingParams: string[] = [];
                        if (!params.file_path) missingParams.push('file_path');
                        if (params.old_string === undefined) missingParams.push('old_string');
                        if (params.new_string === undefined) missingParams.push('new_string');

                        if (missingParams.length > 0) {
                            this.logService.error(`[Hook] Edit 工具缺少必需参数: ${missingParams.join(', ')}`);

                            return {
                                continue: false,
                                reason: `Edit 工具调用失败：缺少必需参数 ${missingParams.join(' 和 ')}。

当前 VSCode 工作目录: ${currentCwd}

请重新调用 Edit 工具，确保：
1. file_path 使用绝对路径，例如: ${currentCwd}/src/example.ts
2. old_string 和 new_string 参数必须提供
3. 不要使用 raw_arguments，直接传递各个参数`
                            };
                        }

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

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && !params.file_path) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.file_path) params.file_path = parsed.file_path;
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
                                // 更新 tool_input 中的路径
                                if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                                    (hookInput.tool_input as { file_path?: string }).file_path = fixResult.fixedPath;
                                }
                            }
                        }

                        this.logService.info(`[Hook] Read 参数: file_path=${params.file_path}`);

                        if (!params.file_path) {
                            this.logService.error(`[Hook] Read 工具缺少必需参数: file_path`);

                            return {
                                continue: false,
                                reason: `Read 工具调用失败：缺少必需参数 file_path。

当前 VSCode 工作目录: ${currentCwd}

请重新调用 Read 工具，确保：
1. file_path 使用绝对路径，例如: ${currentCwd}/src/example.ts
2. 不要使用 raw_arguments，直接传递 file_path 参数`
                            };
                        }

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

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && !params.pattern) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.pattern) params.pattern = parsed.pattern;
                                if (parsed.path) params.path = parsed.path;
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
                                // 更新 tool_input 中的路径
                                if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                                    (hookInput.tool_input as { path?: string }).path = fixResult.fixedPath;
                                }
                            }
                        }

                        this.logService.info(`[Hook] Glob 参数: pattern=${params.pattern}, path=${params.path}`);

                        if (!params.pattern) {
                            this.logService.error(`[Hook] Glob 工具缺少必需参数: pattern`);

                            return {
                                continue: false,
                                reason: `Glob 工具调用失败：缺少必需参数 pattern。

当前 VSCode 工作目录: ${currentCwd}

请重新调用 Glob 工具，确保：
1. pattern 参数必须提供，例如: "**/*.ts"
2. path 参数（可选）如果提供，应使用绝对路径`
                            };
                        }

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

                        // 尝试从 raw_arguments 解析参数
                        if (params.raw_arguments && !params.pattern) {
                            this.logService.info(`[Hook] 检测到 raw_arguments，尝试解析...`);
                            try {
                                const parsed = JSON.parse(params.raw_arguments);
                                if (parsed.pattern) params.pattern = parsed.pattern;
                                if (parsed.path) params.path = parsed.path;
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
                                // 更新 tool_input 中的路径
                                if (hookInput.tool_input && typeof hookInput.tool_input === 'object') {
                                    (hookInput.tool_input as { path?: string }).path = fixResult.fixedPath;
                                }
                            }
                        }

                        this.logService.info(`[Hook] Grep 参数: pattern=${params.pattern}, path=${params.path}`);

                        if (!params.pattern) {
                            this.logService.error(`[Hook] Grep 工具缺少必需参数: pattern`);

                            return {
                                continue: false,
                                reason: `Grep 工具调用失败：缺少必需参数 pattern。

当前 VSCode 工作目录: ${currentCwd}

请重新调用 Grep 工具，确保：
1. pattern 参数必须提供
2. path 参数（可选）如果提供，应使用绝对路径`
                            };
                        }

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

                        const missingParams: string[] = [];
                        if (!params.description) missingParams.push('description');
                        if (!params.prompt) missingParams.push('prompt');
                        if (!params.subagent_type) missingParams.push('subagent_type');

                        if (missingParams.length > 0) {
                            this.logService.error(`[Hook] Task 工具缺少必需参数: ${missingParams.join(', ')}`);

                            return {
                                continue: false,
                                reason: `Task 工具调用失败：缺少必需参数 ${missingParams.join(' 和 ')}。请确保提供 description、prompt 和 subagent_type。`
                            };
                        }

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
     * 获取环境变量
     */
    private getEnvironmentVariables(): Record<string, string> {
        const config = vscode.workspace.getConfiguration("claudix");
        const customVars = config.get<Array<{ name: string; value: string }>>("environmentVariables", []);

        const env = { ...process.env };
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
