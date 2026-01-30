# Cline Write Tool 参数验证处理方法

## 问题背景

当 AI 模型调用 `write_to_file` 工具时，可能会出现以下错误：
```
InputValidationError: Write failed due to the following issues:
- The required parameter `file_path` is missing
- The required parameter `content` is missing
- An unexpected parameter `raw_arguments` was provided
```

这是因为 AI 模型返回的工具调用格式不正确。Cline 通过多层防护来解决这个问题。

---

## Cline 的解决方案架构

```
┌─────────────────────────────────────────────────────────────┐
│                    1. 工具定义层                              │
│         (System Prompt 中明确定义参数格式和示例)               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    2. 参数解析层                              │
│              (支持多种参数名称的兼容处理)                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    3. 参数验证层                              │
│              (检查必需参数，返回清晰错误信息)                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    4. 错误恢复层                              │
│              (追踪连续错误，引导 AI 自我纠正)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 第一层：工具定义 (System Prompt)

**文件位置**: `src/core/prompts/system-prompt/tools/write_to_file.ts`

### 工具规格定义

```typescript
const GENERIC: ClineToolSpec = {
    variant: ModelFamily.GENERIC,
    id: ClineDefaultTool.FILE_NEW,
    name: "write_to_file",
    description:
        "Request to write content to a file at the specified path. If the file exists, it will be overwritten with the provided content. If the file doesn't exist, it will be created. This tool will automatically create any directories needed to write the file.",
    parameters: [
        {
            name: "path",
            required: true,  // ✅ 明确标记为必需
            instruction: `The path of the file to write to (relative to the current working directory {{CWD}}){{MULTI_ROOT_HINT}}`,
            usage: "File path here",  // 提供使用示例
        },
        {
            name: "content",
            required: true,  // ✅ 明确标记为必需
            instruction:
                "The content to write to the file. ALWAYS provide the COMPLETE intended content of the file, without any truncation or omissions. You MUST include ALL parts of the file, even if they haven't been modified.",
            usage: "Your file content here",  // 提供使用示例
        },
    ],
}
```

### 针对不同模型的变体

Cline 为不同的模型家族定义了不同的工具变体：

```typescript
// 针对原生工具调用的模型 (如 Claude, GPT-5)
const NATIVE_NEXT_GEN: ClineToolSpec = {
    variant: ModelFamily.NATIVE_NEXT_GEN,
    id,
    name: "write_to_file",
    description:
        "[IMPORTANT: Always output the absolutePath first] Request to write content to a file...",
    parameters: [
        {
            name: "absolutePath",  // 使用绝对路径
            required: true,
            instruction: "The absolute path to the file to write to.",
        },
        {
            name: "content",
            required: true,
            instruction: "After providing the path so a file can be created, then use this to provide the content to write to the file.",
        },
    ],
}

// 导出所有变体
export const write_to_file_variants = [GENERIC, NATIVE_NEXT_GEN, NATIVE_GPT_5]
```

### System Prompt 中的使用示例

```xml
## write_to_file
Description: Request to write content to a file at the specified path...

Parameters:
- path: (required) The path of the file to write to
- content: (required) The content to write to the file

Usage:
<write_to_file>
<path>File path here</path>
<content>
Your file content here
</content>
</write_to_file>
```

---

## 第二层：参数解析 (兼容处理)

**文件位置**: `src/core/task/tools/handlers/WriteToFileToolHandler.ts`

### 支持多种参数名称

```typescript
async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    // ✅ 兼容 path 和 absolutePath 两种参数名
    const rawRelPath = block.params.path || block.params.absolutePath

    // ✅ 获取内容参数
    const rawContent = block.params.content  // for write_to_file
    const rawDiff = block.params.diff        // for replace_in_file

    // ... 后续处理
}
```

### 部分数据处理 (Streaming)

```typescript
async handlePartialBlock(block: ToolUse, uiHelpers: StronglyTypedUIHelpers): Promise<void> {
    const rawRelPath = block.params.path || block.params.absolutePath
    const rawContent = block.params.content
    const rawDiff = block.params.diff

    // ✅ 早期返回：如果数据不完整，等待更多数据
    if (!rawRelPath || (!rawContent && !rawDiff)) {
        return  // 等待直到有路径和内容/diff
    }

    // ... 继续处理
}
```

---

## 第三层：参数验证

**文件位置**: `src/core/task/tools/handlers/WriteToFileToolHandler.ts:99-124`

### 验证逻辑

```typescript
async execute(config: TaskConfig, block: ToolUse): Promise<ToolResponse> {
    const rawRelPath = block.params.path || block.params.absolutePath
    const rawContent = block.params.content
    const rawDiff = block.params.diff

    // ✅ 验证 path 参数
    if (!rawRelPath) {
        config.taskState.consecutiveMistakeCount++  // 增加错误计数
        await config.services.diffViewProvider.reset()
        return await config.callbacks.sayAndCreateMissingParamError(
            block.name,
            block.params.absolutePath ? "absolutePath" : "path",
        )
    }

    // ✅ 验证 replace_in_file 的 diff 参数
    if (block.name === "replace_in_file" && !rawDiff) {
        config.taskState.consecutiveMistakeCount++
        await config.services.diffViewProvider.reset()
        return await config.callbacks.sayAndCreateMissingParamError(block.name, "diff")
    }

    // ✅ 验证 write_to_file 的 content 参数
    if (block.name === "write_to_file" && !rawContent) {
        config.taskState.consecutiveMistakeCount++
        await config.services.diffViewProvider.reset()
        return await config.callbacks.sayAndCreateMissingParamError(block.name, "content")
    }

    // ✅ 验证 new_rule 的 content 参数
    if (block.name === "new_rule" && !rawContent) {
        config.taskState.consecutiveMistakeCount++
        await config.services.diffViewProvider.reset()
        return await config.callbacks.sayAndCreateMissingParamError(block.name, "content")
    }

    // ✅ 验证通过，重置错误计数
    config.taskState.consecutiveMistakeCount = 0

    // ... 继续执行
}
```

### 错误响应函数

`sayAndCreateMissingParamError` 函数的作用：

1. **向用户显示错误** - 在 UI 中展示缺失参数的提示
2. **返回错误给 AI** - 让 AI 知道哪个参数缺失，以便自我纠正
3. **格式化错误信息** - 提供清晰的错误描述

```typescript
// 示例错误响应格式
return `Error: Missing required parameter "${paramName}" for tool "${toolName}".
Please provide the ${paramName} parameter and try again.`
```

---

## 第四层：内容预处理和修复

**文件位置**: `src/core/task/tools/handlers/WriteToFileToolHandler.ts:463-477`

### 自动修复常见问题

```typescript
if (content) {
    newContent = content

    // ✅ 修复：移除 markdown 代码块标记 (弱模型常见问题)
    if (newContent.startsWith("```")) {
        // 处理包含语言标识符的情况，如 ```python ```js
        newContent = newContent.split("\n").slice(1).join("\n").trim()
    }
    if (newContent.endsWith("```")) {
        newContent = newContent.split("\n").slice(0, -1).join("\n").trim()
    }

    // ✅ 应用模型特定的修复 (llama, gemini 等可能添加转义字符)
    newContent = applyModelContentFixes(newContent, config.api.getModel().id, resolvedPath)
}

// ✅ 移除尾部换行符
newContent = newContent.trimEnd()
```

### 模型特定修复函数

```typescript
// src/core/task/tools/utils/ModelContentProcessor.ts
export function applyModelContentFixes(
    content: string,
    modelId: string,
    filePath: string
): string {
    // 针对 DeepSeek 模型：修复未转义的 HTML 实体
    // 针对 Gemini 模型：修复额外的转义字符
    // 针对 Llama 模型：修复代码块标记
    // ...
}
```

---

## 第五层：错误追踪和恢复

### 连续错误计数

```typescript
// 在 TaskState 中追踪
interface TaskState {
    consecutiveMistakeCount: number  // 连续错误次数
    didAlreaUseTool: boolean       // 是否已使用工具
    didRejectTool: boolean           // 工具是否被拒绝
    // ...
}
```

### 错误处理流程

```typescript
try {
    const result = await this.validateAndPrepareFileOperation(...)
    if (!result) {
        return ""  // 验证失败，已添加错误到 userMessages
    }
    // ... 正常执行
} catch (error) {
    // ✅ 错误时重置 diff 视图
    await config.services.diffViewProvider.revertChanges()
    await config.services.diffViewProvider.reset()
    throw error
}
```

---

## 完整的验证和准备函数

```typescript
async validateAndPrepareFileOperation(
    config: TaskConfig,
    block: ToolUse,
    relPath: string,
    diff?: string,
    content?: string
) {
    // 1. 解析工作区路径
    const pathResult = resolveWorkspacePath(config, relPath, "WriteToFileToolHandler")
    const { absolutePath, resolvedPath } = typeof pathResult === "string"
        ? { absolutePath: pathResult, resolvedPath: relPath }
        : { absolutePath: pathResult.absolutePath, resolvedPath: pathResult.resolvedPath }

    // 2. 检查 .clineignore 访问权限
    const accessValidation = this.validator.checkClineIgnorePath(resolvedPath)
    if (!accessValidation.ok) {
        await config.callbacks.say("clineignore_error", resolvedPath)
        // 返回错误响应...
        return
    }

    // 3. 检查文件是否存在
    let fileExists: boolean
    if (config.services.diffViewProvider.editType !== undefined) {
        fileExists = config.services.diffViewProvider.editType === "modify"
    } else {
        fileExists = await fileExistsAtPath(absolutePath)
        config.services.diffViewProvider.editType = fileExists ? "modify" : "create"
    }

    // 4. 构建新内容
    let newContent: string = ""

    if (dif  // 处理 replace_in_file
        diff = applyModelContentFixes(diff, config.api.getModel().id, resolvedPath)
        try {
            newContent = await constructNewFileContent(
                diff,
                config.services.diffViewProvider.originalContent || "",
                !block.partial,
            )
        } catch (error) {
            // 处理 diff 错误...
            return
        }
    } else if (content) {
        // 处理 write_to_file
        newContent = content
        // 应用修复...
    }

    newContent = newContent.trimEnd()

    return { relPath, absolutePath, fileExists, diff, ctent, newContent, workspaceContext }
}
```

---

## 工具枚举定义

**文件位置**: `src/shared/tools.ts`

```typescript
export enum ClineDefaultTool {
    ASK = "ask_followup_question",
    ATTEMPT = "attempt_completion",
    BASH = "execute_command",
    FILE_EDIT = "replace_in_file",
    FILE_READ = "read_file",
    FILE_NEW = "write_to_file",      // ✅ 写入文件工具
    SEARCH = "search_files",
    LIST_FILES = "list_files",
    LIST_CODE_DEF = "list_code_definition_names",
    BROWSER = "browser_action",
    MCP_USE = "use_mcp_tool",
    MCP_ACCESS = "access_mcp_resource",
    // ...
}
```

---

## 关键设计原则

### 1. 防御性编程
- 始终检查参数是否存在
- 支持多种参数名称的兼容
- 自动修复常见的格式问题

### 2. 清晰的错误反馈
- 向用户显示具体的错误信息
- 向 AI 返回可操作的错误提示
- 追踪连续错误以检测问题模式

### 3. 优雅降级
- 部分数据时等待完整数据
- 错误时重置状态
- 支持用户手动干预

### 4. 模型适配
- 为不同模型家族定义不同的工具变体
- 应用模型特定的内容修复
- 在 System Prompt 中提供清晰的使用示例

---

## 应用到你的插件

### 建议的实现步骤

1. **定义清晰的工具规格**
   ```typescript
   const writeToolSpec = {
       name: "write_file",
       parameters: [
           { name: "file_path", required: true },
           { name: "content", required: true }
       ]
   }
   ```

2. **添加参数兼容层**
   ```typescript
   function normalizeParams(params: any) {
       return {
           file_path: params.file_path || params.path || params.absolutePath,
           content: params.content || params.text || params.data
       }
   }
   ```

3. **实现验证函数**
   ```typescript
   function validateWriteParams(params: any): { valid: boolean; error?: string } {
       const normalized = normalizeParams(params)
       if (!normalized.file_path) {
           return { valid: false, error: "Missing required parameter: file_path" }
       }
       if (!normalized.content) {
           return { valid: false, error: "Missing required parameter: content" }
       }
       return { valid: true }
   }
   ```

4. **处理 raw_arguments**
   ```typescript
   function parseRawArguments(params: any) {
       if (params.raw_arguments && typeof params.raw_arguments === 'string') {
           try {
               const parsed = JSON.parse(params.raw_arguments)
               return { ...params, ...parsed }
           } catch (e) {
               // 尝试其他解析方式
           }
       }
       return params
   }
   ```

5. **返回有用的错误信息**
   ```typescript
   function createMissingParamError(toolName: string, paramName: string): string {
       return `Error: The "${toolName}" tool requires the "${paramName}" parameter.

   Correct usage:
   <${toolName}>
   <file_path>/path/to/file.txt</file_path>
   <content>File content here</content>
   </${toolName}>`
   }
   ```
