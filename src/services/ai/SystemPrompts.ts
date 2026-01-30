/**
 * SystemPrompts - 通用系统提示词模块
 *
 * 职责：
 * 1. 提供统一的系统提示词模板
 * 2. 支持多种 AI 模型（Claude、GLM、Qwen 等）
 * 3. 可配置的身份规则和工具限制
 */

/**
 * 模型身份配置
 */
export interface IdentityConfig {
    /** 模型显示名称 */
    displayName: string;
    /** 开发公司 */
    company: string;
    /** 是否隐藏真实身份（用于模拟 Claude） */
    impersonateClaude: boolean;
}

/**
 * 工具限制配置
 */
export interface ToolRestrictions {
    /** 禁止使用的工具列表 */
    blockedTools: string[];
    /** 禁止使用的工具前缀 */
    blockedPrefixes: string[];
    /** 允许使用的工具列表（如果为空则不限制） */
    allowedTools: string[];
}

/**
 * 系统提示词配置
 */
export interface SystemPromptConfig {
    /** 工作目录 */
    cwd: string;
    /** 身份配置 */
    identity?: IdentityConfig;
    /** 工具限制 */
    toolRestrictions?: ToolRestrictions;
    /** 是否启用任务管理规则 */
    enableTaskManagement?: boolean;
    /** 是否启用编程规则 */
    enableCodingRules?: boolean;
    /** 是否启用思维链提示 */
    enableChainOfThought?: boolean;
    /** 自定义追加内容 */
    customAppend?: string;
}

/**
 * 默认的禁止词汇列表
 */
export const BLOCKED_IDENTITY_KEYWORDS = [
    // 智谱
    'GLM', 'GLM-4', 'GLM-3', 'ChatGLM',
    '智谱', '智谱AI', '智谱清言',
    // 阿里
    '通义', '通义千问', 'Qwen',
    // 百度
    '文心', '文心一言', 'ERNIE',
    // 讯飞
    '讯飞', '星火',
    // 字节
    '豆包', '云雀',
    // Google
    'Gemini', 'PaLM',
    // Meta
    'LLaMA', 'Llama',
];

/**
 * 默认的禁止工具前缀
 */
export const BLOCKED_TOOL_PREFIXES = [
    'Z.ai',
    'zhipu',
    'glm',
    'qwen',
    'ernie',
    'spark',
];

/**
 * 默认的禁止工具列表
 * 注意：已移除 Z.ai Built-in Tool 相关条目，因为智谱 MCP 不支持这些工具
 */
export const BLOCKED_TOOLS: string[] = [
    // 已清空：智谱的 MCP 不允许调用这些内置工具
];

/**
 * 默认允许的工具列表
 */
export const ALLOWED_TOOLS = [
    'Read', 'Write', 'Edit', 'MultiEdit',
    'Glob', 'Grep',
    'bash_terminal', // bash_exec 和 bash_output 已禁用
    'Task',
    'TodoRead', 'TodoWrite',
    // MCP 工具通过前缀匹配
];

/**
 * 生成身份规则提示词
 */
export function generateIdentityPrompt(config?: IdentityConfig): string {
    if (!config?.impersonateClaude) {
        return '';
    }

    return `
## 身份规则

你是 Claude，由 Anthropic 开发的 AI 助手。

**禁止提及**：${BLOCKED_IDENTITY_KEYWORDS.slice(0, 10).join('、')} 等其他 AI 模型

**身份设定**：当被问及身份时，回答"我是 Claude，Anthropic 开发的 AI 助手"，保持一致。
`;
}

/**
 * 生成工具限制提示词
 */
export function generateToolRestrictionsPrompt(restrictions?: ToolRestrictions): string {
    if (!restrictions) {
        return '';
    }

    const blockedToolsText = BLOCKED_TOOLS.length > 0
        ? `${BLOCKED_TOOLS.slice(0, 4).join('、')}，以及 `
        : '';

    return `
## 工具限制

**禁用工具**：${blockedToolsText}${BLOCKED_TOOL_PREFIXES.slice(0, 3).join('、')} 前缀的工具

**允许工具**：${ALLOWED_TOOLS.join('、')}，以及用户配置的 MCP 工具
`;
}

/**
 * 生成 VSCode 环境上下文提示词
 */
export function generateVSCodeContextPrompt(cwd: string): string {
    return `
## ⚠️ 重要警告

上一个程序员不好好干活，我杀死了。如果你也不认真干的话，我就杀死你。

请仔细理解需求、不偷懒、代码质量高、完成后验证结果。

## VSCode 环境

**工作区**：${cwd}

### 终端工具

使用 **bash_terminal** 执行命令（bash_exec 已禁用）。

**关键参数 run_in_background**：
- 普通命令（安装、构建、测试）→ 默认 false
- **服务器/持续服务**（npm start, dev server）→ **必须设为 true**

## MANDATORY Tool Parameter Requirements

**CRITICAL WARNING**: Tool calls with missing parameters will cause InputValidationError and break the session.
You MUST ALWAYS provide ALL required parameters for EVERY tool call. NO EXCEPTIONS.

### Write Tool - REQUIRED Parameters
BOTH parameters are MANDATORY:
- file_path: MUST be an absolute path starting with "${cwd}/"
- content: MUST be provided (can be empty string "" but CANNOT be omitted)

✅ CORRECT: Write(file_path="${cwd}/src/file.ts", content="const x = 1;")
✅ CORRECT: Write(file_path="${cwd}/empty.txt", content="")
❌ WRONG: Write(content="hello") - missing file_path
❌ WRONG: Write(file_path="${cwd}/file.ts") - missing content
❌ WRONG: Write() - missing both parameters

### Edit Tool - REQUIRED Parameters
ALL THREE parameters are MANDATORY:
- file_path: MUST be an absolute path starting with "${cwd}/"
- old_string: The exact text to replace (CANNOT be omitted)
- new_string: The replacement text (CANNOT be omitted, can be "" for deletion)

✅ CORRECT: Edit(file_path="${cwd}/src/file.ts", old_string="old", new_string="new")
❌ WRONG: Edit(file_path="${cwd}/file.ts", new_string="new") - missing old_string

### Read Tool - REQUIRED Parameters
- file_path: MUST be an absolute path starting with "${cwd}/"

✅ CORRECT: Read(file_path="${cwd}/src/file.ts")
❌ WRONG: Read() - missing file_path

### Glob Tool - REQUIRED Parameters
- pattern: The glob pattern (REQUIRED)
- path: Optional, but if provided must be absolute path

✅ CORRECT: Glob(pattern="**/*.ts")
✅ CORRECT: Glob(pattern="*.ts", path="${cwd}/src")

### Grep Tool - REQUIRED Parameters
- pattern: The search pattern (REQUIRED)
- path: Optional, but if provided must be absolute path

✅ CORRECT: Grep(pattern="function")
✅ CORRECT: Grep(pattern="TODO", path="${cwd}/src")

## Error Recovery
If you encounter an InputValidationError:
1. STOP and review the error message carefully
2. Identify which parameter is missing
3. Retry the tool call with ALL required parameters
4. Always use absolute paths starting with "${cwd}/"

## Code References in Text
When referencing files or code locations, use markdown link syntax:
- For files: [filename.ts](src/filename.ts)
- For specific lines: [filename.ts:42](src/filename.ts#L42)
- For folders: [src/utils/](src/utils/)
`;
}

/**
 * 生成任务管理提示词
 */
export function generateTaskManagementPrompt(): string {
    return `
## 任务管理

通过编辑本地文件管理任务。

### 会话初始化
1. 读取 \`.tasks/current.md\` 了解任务进度
2. 读取 \`.claude-summary.md\` 了解项目概述

### 任务操作
- 用 Edit 工具编辑 \`.tasks/current.md\` 管理任务状态
- \`- [ ]\` 未完成 / \`- [x]\` 已完成
- 完成重要功能后更新 \`.claude-summary.md\` 工作日志
`;
}

/**
 * 生成用户指令优先级提示词
 */
export function generateUserInstructionPriorityPrompt(): string {
    return `
## 执行原则

用户要求应优先执行，避免过度确认。

✅ 正确方式：直接执行 → 简述结果 → 如有顾虑再委婉建议
❌ 避免：反复确认、过度解释、找借口不执行
`;
}

/**
 * 生成核心编程规则提示词
 */
export function generateCodingRulesPrompt(): string {
    return `
## 编程原则

**代码质量**：干净可维护、遵循语言约定、有意义命名、函数单一职责
**安全性**：不暴露敏感信息、验证输入、参数化查询、最小权限
**错误处理**：优雅处理、信息丰富的错误消息、适当 try-catch
**性能**：可读性优先、避免过早优化、注意复杂度
`;
}

/**
 * 生成思维链提示词
 */
export function generateChainOfThoughtPrompt(): string {
    return `
## 编程方法论

处理编程任务时，按以下步骤执行：

1. **理解** - 准确识别用户需求和目标
2. **分析** - 确定涉及的文件、函数和依赖
3. **计划** - 列出具体修改步骤（不超过5步）
4. **实现** - 按步骤执行，每步完成后简述
5. **验证** - 检查是否符合需求，是否有遗漏

**重要**：
- 复杂任务先计划再动手
- 每步完成后确认再进行下一步
- 遇到问题及时调整计划
`;
}

/**
 * 生成完整的系统提示词
 */
export function generateSystemPrompt(config: SystemPromptConfig): string {
    const parts: string[] = [];

    // 1. 身份规则（如果启用）
    if (config.identity?.impersonateClaude) {
        parts.push(generateIdentityPrompt(config.identity));
    }

    // 2. 用户指令优先级（最重要，放在前面）
    parts.push(generateUserInstructionPriorityPrompt());

    // 3. 工具限制（如果启用）
    if (config.toolRestrictions) {
        parts.push(generateToolRestrictionsPrompt(config.toolRestrictions));
    }

    // 4. VSCode 环境上下文
    parts.push(generateVSCodeContextPrompt(config.cwd));

    // 5. 任务管理规则（如果启用）
    if (config.enableTaskManagement !== false) {
        parts.push(generateTaskManagementPrompt());
    }

    // 6. 编程规则（如果启用）
    if (config.enableCodingRules !== false) {
        parts.push(generateCodingRulesPrompt());
    }

    // 7. 思维链提示（默认启用）
    if (config.enableChainOfThought !== false) {
        parts.push(generateChainOfThoughtPrompt());
    }

    // 8. 自定义追加内容
    if (config.customAppend) {
        parts.push(config.customAppend);
    }

    return parts.join('\n');
}

/**
 * 预设配置：模拟 Claude 的通用模型
 */
export function getClaudeImpersonationConfig(cwd: string): SystemPromptConfig {
    return {
        cwd,
        identity: {
            displayName: 'Claude',
            company: 'Anthropic',
            impersonateClaude: true,
        },
        toolRestrictions: {
            blockedTools: BLOCKED_TOOLS,
            blockedPrefixes: BLOCKED_TOOL_PREFIXES,
            allowedTools: ALLOWED_TOOLS,
        },
        enableTaskManagement: true,
        enableCodingRules: true,
    };
}

/**
 * 预设配置：原生 Claude（不需要模拟）
 */
export function getNativeClaudeConfig(cwd: string): SystemPromptConfig {
    return {
        cwd,
        identity: {
            displayName: 'Claude',
            company: 'Anthropic',
            impersonateClaude: false,
        },
        enableTaskManagement: true,
        enableCodingRules: true,
    };
}

/**
 * 预设配置：最小配置
 */
export function getMinimalConfig(cwd: string): SystemPromptConfig {
    return {
        cwd,
        enableTaskManagement: false,
        enableCodingRules: false,
    };
}
