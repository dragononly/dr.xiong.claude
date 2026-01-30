/**
 * ToolParamsValidator - 工具参数验证和修复工具
 *
 * 参考 Cline 的多层防护架构：
 * 1. 参数兼容层 - 支持多种参数名称
 * 2. 参数验证层 - 检查必需参数
 * 3. 参数修复层 - 自动修复常见问题
 * 4. 错误反馈层 - 返回清晰的错误信息
 */

import { WorkspacePathResolver } from '../../workspacePathResolver';

/**
 * 工具参数定义
 */
export interface ToolParamDef {
    /** 参数名称 */
    name: string;
    /** 是否必需 */
    required: boolean;
    /** 参数别名（兼容不同模型的参数名） */
    aliases?: string[];
    /** 是否为路径参数（需要路径修复） */
    isPath?: boolean;
    /** 参数描述（用于错误提示） */
    description?: string;
}

/**
 * 工具定义
 */
export interface ToolDef {
    /** 工具名称 */
    name: string;
    /** 参数定义列表 */
    params: ToolParamDef[];
    /** 使用示例 */
    usageExample?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
    /** 是否验证通过 */
    valid: boolean;
    /** 规范化后的参数 */
    normalizedParams: Record<string, unknown>;
    /** 缺失的必需参数 */
    missingParams: string[];
    /** 修复报告 */
    fixes: string[];
    /** 错误消息（如果验证失败） */
    errorMessage?: string;
}

/**
 * 工具定义注册表
 */
export const TOOL_DEFINITIONS: Record<string, ToolDef> = {
    Write: {
        name: 'Write',
        params: [
            {
                name: 'file_path',
                required: true,
                aliases: ['path', 'absolutePath', 'filePath'],
                isPath: true,
                description: '文件的绝对路径'
            },
            {
                name: 'content',
                required: true,
                aliases: ['text', 'data', 'fileContent'],
                description: '要写入的文件内容'
            }
        ],
        usageExample: 'Write(file_path="/absolute/path/to/file.ts", content="file content")'
    },
    Edit: {
        name: 'Edit',
        params: [
            {
                name: 'file_path',
                required: true,
                aliases: ['path', 'absolutePath', 'filePath'],
                isPath: true,
                description: '文件的绝对路径'
            },
            {
                name: 'old_string',
                required: true,
                aliases: ['oldString', 'search', 'find'],
                description: '要替换的原始字符串'
            },
            {
                name: 'new_string',
                required: true,
                aliases: ['newString', 'replace', 'replacement'],
                description: '替换后的新字符串'
            }
        ],
        usageExample: 'Edit(file_path="/path/to/file.ts", old_string="old", new_string="new")'
    },
    Read: {
        name: 'Read',
        params: [
            {
                name: 'file_path',
                required: true,
                aliases: ['path', 'absolutePath', 'filePath'],
                isPath: true,
                description: '文件的绝对路径'
            }
        ],
        usageExample: 'Read(file_path="/absolute/path/to/file.ts")'
    },
    Glob: {
        name: 'Glob',
        params: [
            {
                name: 'pattern',
                required: true,
                aliases: ['glob', 'filePattern'],
                description: 'glob 匹配模式，如 "**/*.ts"'
            },
            {
                name: 'path',
                required: false,
                aliases: ['directory', 'dir', 'cwd'],
                isPath: true,
                description: '搜索目录（可选）'
            }
        ],
        usageExample: 'Glob(pattern="**/*.ts", path="/optional/search/path")'
    },
    Grep: {
        name: 'Grep',
        params: [
            {
                name: 'pattern',
                required: true,
                aliases: ['regex', 'search', 'query'],
                description: '搜索的正则表达式模式'
            },
            {
                name: 'path',
                required: false,
                aliases: ['directory', 'dir', 'cwd'],
                isPath: true,
                description: '搜索目录（可选）'
            }
        ],
        usageExample: 'Grep(pattern="searchTerm", path="/optional/search/path")'
    },
    Bash: {
        name: 'Bash',
        params: [
            {
                name: 'command',
                required: true,
                aliases: ['cmd', 'script', 'shell'],
                description: '要执行的 bash 命令'
            },
            {
                name: 'description',
                required: false,
                aliases: ['desc'],
                description: '命令描述'
            }
        ],
        usageExample: 'Bash(command="ls -la", description="List files")'
    },
    Task: {
        name: 'Task',
        params: [
            {
                name: 'description',
                required: true,
                aliases: ['desc', 'title'],
                description: '任务简短描述'
            },
            {
                name: 'prompt',
                required: true,
                aliases: ['task', 'instruction'],
                description: '任务详细提示'
            },
            {
                name: 'subagent_type',
                required: true,
                aliases: ['agentType', 'type'],
                description: '子代理类型'
            }
        ],
        usageExample: 'Task(description="Search code", prompt="Find all API endpoints", subagent_type="Explore")'
    },
    NotebookEdit: {
        name: 'NotebookEdit',
        params: [
            {
                name: 'notebook_path',
                required: true,
                aliases: ['path', 'notebookPath', 'file_path'],
                isPath: true,
                description: 'Notebook 文件的绝对路径'
            },
            {
                name: 'new_source',
                required: true,
                aliases: ['source', 'content', 'code'],
                description: '新的单元格内容'
            }
        ],
        usageExample: 'NotebookEdit(notebook_path="/path/to/notebook.ipynb", new_source="print(1)")'
    },
    TodoWrite: {
        name: 'TodoWrite',
        params: [
            {
                name: 'todos',
                required: true,
                aliases: ['items', 'tasks', 'todoList'],
                description: '待办事项列表数组，每项包含 content、status 和 activeForm'
            }
        ],
        usageExample: 'TodoWrite(todos=[{"content": "任务描述", "status": "pending", "activeForm": "正在执行任务描述"}])'
    }
};

/**
 * 工具参数验证器
 */
export class ToolParamsValidator {
    private pathResolver: WorkspacePathResolver;
    private cwd: string;

    constructor(cwd: string) {
        this.cwd = cwd;
        this.pathResolver = new WorkspacePathResolver(cwd);
    }

    /**
     * 更新工作目录
     */
    setCwd(cwd: string): void {
        this.cwd = cwd;
        this.pathResolver.setCwd(cwd);
    }

    /**
     * 解析 raw_arguments（如果存在）
     *
     * 有些模型会返回未解析的 JSON 字符串作为 raw_arguments
     */
    parseRawArguments(params: Record<string, unknown>): Record<string, unknown> {
        const rawArgs = params.raw_arguments;

        if (!rawArgs || typeof rawArgs !== 'string') {
            return params;
        }

        // 尝试 JSON 解析
        try {
            const parsed = JSON.parse(rawArgs);
            if (typeof parsed === 'object' && parsed !== null) {
                // 合并解析后的参数，但不覆盖已存在的参数
                return { ...parsed, ...params };
            }
        } catch {
            // JSON 解析失败，尝试其他格式
        }

        // 尝试解析 key=value 格式
        try {
            const result: Record<string, unknown> = { ...params };
            const keyValuePattern = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/g;
            let match;

            while ((match = keyValuePattern.exec(rawArgs)) !== null) {
                const key = match[1];
                const value = match[2] ?? match[3] ?? match[4];
                if (key && value !== undefined && !(key in result)) {
                    result[key] = value;
                }
            }

            return result;
        } catch {
            // 解析失败，返回原参数
        }

        return params;
    }

    /**
     * 规范化参数名称
     *
     * 将各种别名转换为标准参数名
     */
    normalizeParamNames(
        params: Record<string, unknown>,
        toolDef: ToolDef
    ): Record<string, unknown> {
        const normalized: Record<string, unknown> = {};

        for (const paramDef of toolDef.params) {
            // 检查标准名称
            if (params[paramDef.name] !== undefined) {
                normalized[paramDef.name] = params[paramDef.name];
                continue;
            }

            // 检查别名
            if (paramDef.aliases) {
                for (const alias of paramDef.aliases) {
                    if (params[alias] !== undefined) {
                        normalized[paramDef.name] = params[alias];
                        break;
                    }
                }
            }
        }

        // 保留其他未定义的参数
        for (const [key, value] of Object.entries(params)) {
            if (!(key in normalized) && key !== 'raw_arguments') {
                normalized[key] = value;
            }
        }

        return normalized;
    }

    /**
     * 修复路径参数
     */
    fixPathParams(
        params: Record<string, unknown>,
        toolDef: ToolDef
    ): { params: Record<string, unknown>; fixes: string[] } {
        const fixed = { ...params };
        const fixes: string[] = [];

        for (const paramDef of toolDef.params) {
            if (!paramDef.isPath) continue;

            const value = fixed[paramDef.name];
            if (typeof value !== 'string' || !value.trim()) continue;

            const fixResult = this.pathResolver.fixToolPath(value, toolDef.name);
            if (fixResult.wasFixed) {
                fixed[paramDef.name] = fixResult.fixedPath;
                fixes.push(`${paramDef.name}: ${fixResult.fixDescription}`);
         }
        }

        return { params: fixed, fixes };
    }

    /**
     * 验证必需参数
     */
    validateRequiredParams(
        params: Record<string, unknown>,
        toolDef: ToolDef
    ): string[] {
        const missing: string[] = [];

        for (const paramDef of toolDef.params) {
            if (!paramDef.required) continue;

            const value = params[paramDef.name];

            // 检查参数是否存在且有效
            if (value === undefined || value === null) {
                missing.push(paramDef.name);
            } else if (typeof value === 'string' && !value.trim()) {
                // 空字符串对于某些参数是无效的（如 file_path）
                if (paramDef.isPath) {
                    missing.push(paramDef.name);
                }
            }
        }

        return missing;
    }

    /**
     * 完整的参数验证流程
     */
    validate(
        toolName: string,
        rawParams: Record<string, unknown> | unknown
    ): ValidationResult {
        // 获取工具定义
        const toolDef = TOOL_DEFINITIONS[toolName];
        if (!toolDef) {
            // 未知工具，跳过验证
            return {
                valid: true,
                normalizedParams: rawParams as Record<string, unknown>,
                missingParams: [],
                fixes: []
            };
        }

        // 确保 params 是对象
        let params: Record<string, unknown> = {};
        if (rawParams && typeof rawParams === 'object') {
            params = rawParams as Record<string, unknown>;
        }

        // 1. 解析 raw_arguments
        params = this.parseRawArguments(params);

        // 2. 规范化参数名称
        params = this.normalizeParamNames(params, toolDef);

        // 3. 修复路径参数
        const { params: fixedParams, fixes } = this.fixPathParams(params, toolDef);
        params = fixedParams;

        // 4. 验证必需参数
        const missingParams = this.validateRequiredParams(params, toolDef);

        // 5. 生成结果
        if (missingParams.length > 0) {
            return {
                valid: false,
                normalizedParams: params,
                missingParams,
                fixes,
                errorMessage: this.createErrorMessage(toolName, toolDef, missingParams)
            };
        }

        return {
            valid: true,
            normalizedParams: params,
            missingParams: [],
            fixes
        };
    }

    /**
     * 创建友好的错误消息
     */
    createErrorMessage(
        toolName: string,
        toolDef: ToolDef,
        missingParams: string[]
    ): string {
        const paramDescriptions = missingParams.map(name => {
            const paramDef = toolDef.params.find(p => p.name === name);
            return `  - ${name}: ${paramDef?.description || '必需参数'}`;
        }).join('\n');

        return `${toolName} 工具调用失败：缺少必需参数 ${missingParams.join(' 和 ')}。

当前 VSCode 工作目录: ${this.cwd}

缺失的参数:
${paramDescriptions}

正确用法示例:
${toolDef.usageExample || `${toolName}(...)`}

请确保:
1. 所有路径参数使用绝对路径，例如: ${this.cwd}/src/example.ts
2. 不要使用 raw_arguments，直接传递各个参数
3. 所有必需参数都必须提供值`;
    }

    /**
     * 获取工具定义
     */
    getToolDef(toolName: string): ToolDef | undefined {
        return TOOL_DEFINITIONS[toolName];
    }

    /**
     * 注册自定义工具定义
     */
    static registerTool(toolDef: ToolDef): void {
        TOOL_DEFINITIONS[toolDef.name] = toolDef;
    }
}

/**
 * 创建验证器实例
 */
export function createToolParamsValidator(cwd: string): ToolParamsValidator {
    return new ToolParamsValidator(cwd);
}
