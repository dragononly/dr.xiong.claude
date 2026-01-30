# Dr.Xiong.Claude 项目架构规划

> 目标：构建一个不依赖任何特定 SDK 的通用 AI 编程助手 VSCode 扩展

## 1. 现有服务清单

### 1.1 基础服务层

| 服务 | 文件 | 状态 | 功能描述 |
|------|------|------|----------|
| **FileSystemService** | `fileSystemService.ts` | ✅ 完整 | 文件读写、搜索（Ripgrep + Fuse.js）、目录操作 |
| **TerminalService** | `terminalService.ts` | ⚠️ 基础 | 终端创建、发送命令（需增强命令输出捕获） |
| **WorkspaceService** | `workspaceService.ts` | ✅ 完整 | 工作区文件夹管理 |
| **ConfigurationService** | `configurationService.ts` | ✅ 完整 | VSCode 配置读写 |
| **DialogService** | `dialogService.ts` | ✅ 完整 | 用户输入、选择对话框 |
| **NotificationService** | `notificationService.ts` | ✅ 完整 | 消息通知 |
| **TabsAndEditorsService** | `tabsAndEditorsService.ts` | ✅ 完整 | 编辑器标签管理 |
| **WebViewService** | `webViewService.ts` | ✅ 完整 | WebView 管理（侧边栏 + 编辑器） |
| **LogService** | `logService.ts` | ✅ 完整 | 日志服务 |

### 1.2 业务服务层

| 服务 | 文件 | 状态 | 功能描述 |
|------|------|------|----------|
| **ClaudeSdkService** | `claude/ClaudeSdkService.ts` | 🔄 待移除 | Claude SDK 封装 |
| **ClaudeAgentService** | `claude/ClaudeAgentService.ts` | 🔄 待重构 | 代理逻辑（需改为通用） |
| **ClaudeSessionService** | `claude/ClaudeSessionService.ts` | 🔄 待重构 | 会话管理 |
| **LocalTodoService** | `LocalTodoService.ts` | ✅ 完整 | 本地 Todo 持久化 |
| **AutoTaskService** | `AutoTaskService.ts` | ✅ 保留 | 自动任务执行 |

### 1.3 AI 服务层（新建）

| 服务 | 状态 | 功能描述 |
|------|------|----------|
| **SystemPrompts** | ✅ 已创建 | 通用系统提示词生成 |
| **AIProviderFactory** | ⚠️ 待扩展 | AI 模型适配器工厂 |

---

## 2. 需要构建的工具层

### 2.1 核心工具定义

```typescript
// src/tools/types.ts

/**
 * 工具执行上下文
 */
interface ToolContext {
    cwd: string;                    // 工作目录
    abortSignal?: AbortSignal;      // 取消信号
    logService: ILogService;        // 日志服务
}

/**
 * 工具执行结果
 */
interface ToolResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    metadata?: Record<string, any>;
}

/**
 * 通用工具接口
 */
interface ITool<TInput, TOutput> {
    name: string;
    description: string;
    inputSchema: JSONSchema;
    execute(input: TInput, context: ToolContext): Promise<ToolResult<TOutput>>;
}
```

### 2.2 文件工具 (FileTools)

| 工具 | 对应 SDK 工具 | 已有基础 | 复杂度 |
|------|---------------|----------|--------|
| `file_read` | FileRead | FileSystemService.readFile | ⭐ |
| `file_write` | FileWrite | FileSystemService.writeFile | ⭐ |
| `file_edit` | FileEdit | 需新建（diff/patch） | ⭐⭐⭐ |
| `file_search` | Glob | FileSystemService.searchFiles | ⭐ |
| `content_search` | Grep | 需新建（ripgrep 内容搜索） | ⭐⭐ |

**实现优先级**：P0

**接口定义**：

```typescript
// file_read
interface FileReadInput {
    file_path: string;
    offset?: number;      // 起始行（可选）
    limit?: number;       // 最大行数（可选）
}

interface FileReadOutput {
    content: string;
    totalLines: number;
    truncated: boolean;
}

// file_write  
interface FileWriteInput {
    file_path: string;
    content: string;
    create_dirs?: boolean;  // 自动创建父目录
}

// file_edit
interface FileEditInput {
    file_path: string;
    old_string: string;    // 要替换的内容
    new_string: string;    // 新内容
}
```

### 2.3 终端工具 (BashTools)

| 工具 | 对应 SDK 工具 | 已有基础 | 复杂度 |
|------|---------------|----------|--------|
| `bash_exec` | Bash | TerminalService | ⭐⭐⭐ |
| `bash_output` | BashOutput | 需新建 | ⭐⭐ |

**实现优先级**：P0

**接口定义**：

```typescript
// bash_exec
interface BashExecInput {
    command: string;
    timeout?: number;       // 超时毫秒数
    cwd?: string;           // 工作目录
    run_in_background?: boolean;
}

interface BashExecOutput {
    stdout: string;
    stderr: string;
    exitCode: number;
    bash_id?: string;       // 后台进程 ID
}

// bash_output
interface BashOutputInput {
    bash_id: string;
    filter?: string;        // 正则过滤
}
```

**关键挑战**：
- 需要实现命令输出捕获（PTY 或 child_process）
- 后台进程管理
- 超时控制

### 2.4 搜索工具 (SearchTools)

| 工具 | 对应 SDK 工具 | 已有基础 | 复杂度 |
|------|---------------|----------|--------|
| `glob_search` | Glob | FileSystemService.searchFiles | ⭐ |
| `grep_search` | Grep | 需扩展 ripgrep | ⭐⭐ |

**实现优先级**：P1

### 2.5 网络工具 (WebTools)

| 工具 | 对应 SDK 工具 | 已有基础 | 复杂度 |
|------|---------------|----------|--------|
| `web_fetch` | WebFetch | 无（需 fetch + cheerio） | ⭐⭐ |
| `web_search` | WebSearch | 无（需接入搜索 API） | ⭐⭐⭐ |

**实现优先级**：P2

### 2.6 MCP 工具 (MCPTools)

| 工具 | 对应 SDK 工具 | 已有基础 | 复杂度 |
|------|---------------|----------|--------|
| `mcp_call` | MCP | 需实现 MCP 客户端 | ⭐⭐⭐ |
| `mcp_list_resources` | ListMcpResources | 需实现 MCP 客户端 | ⭐⭐ |

**实现优先级**：P2

### 2.7 代理工具 (AgentTools)

| 工具 | 对应 SDK 工具 | 已有基础 | 复杂度 |
|------|---------------|----------|--------|
| `sub_agent` | Agent | 需实现代理调度 | ⭐⭐⭐⭐ |
| `agent_output` | AgentOutput | 需实现 | ⭐⭐ |

**实现优先级**：P3

---

## 3. AI 模型适配层

### 3.1 架构说明

**重要**：用户使用 NewAPI 作为统一网关，NewAPI 会将各种模型（GLM/通义/GPT 等）的响应转换为 Claude API 协议格式。

因此：
- ✅ **不需要** OpenAI 兼容适配器
- ✅ **不需要** 多协议转换
- ✅ **只需要** 一套 Claude API 协议

### 3.2 简化后的模型层

```typescript
// src/services/ai/IModelProvider.ts

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

interface ContentBlock {
    type: 'text' | 'tool_use' | 'tool_result';
    // ... Claude API 格式
}

interface IModelProvider {
    /**
     * 发送消息（Claude Messages API 格式）
     */
    sendMessage(params: {
        model: string;
        messages: ChatMessage[];
        system?: string;
        tools?: ToolDefinition[];
        max_tokens?: number;
    }): Promise<MessageResponse>;
    
    /**
     * 流式发送
     */
    streamMessage(params: MessageParams): AsyncIterable<StreamEvent>;
}
```

### 3.3 NewAPI 配置

用户通过 NewAPI 统一管理：
- API Base URL
- API Key
- 模型映射（GLM → Claude 协议）

扩展只需要支持 Claude API 协议即可。

---

## 4. 消息流转架构

```
┌─────────────────────────────────────────────────────────────────┐
│                          WebView UI                              │
│  (Vue 3 + Pinia + VitePress/Markdown)                           │
└────────────────────────────┬────────────────────────────────────┘
                             │ postMessage
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WebViewService                              │
│  消息路由 + 序列化/反序列化                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AgentCoordinator                              │
│  1. 用户消息处理                                                  │
│  2. 模型选择（Claude/GLM/GPT）                                   │
│  3. 工具调用协调                                                  │
│  4. 会话状态管理                                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
┌─────────────────────────┐    ┌─────────────────────────┐
│     IModelProvider      │    │      ToolRegistry       │
│  ┌───────────────────┐  │    │  ┌───────────────────┐  │
│  │ ClaudeProvider    │  │    │  │ FileTools         │  │
│  ├───────────────────┤  │    │  ├───────────────────┤  │
│  │ OpenAICompatible  │  │    │  │ BashTools         │  │
│  ├───────────────────┤  │    │  ├───────────────────┤  │
│  │ OpenRouterProvider│  │    │  │ SearchTools       │  │
│  └───────────────────┘  │    │  ├───────────────────┤  │
│                         │    │  │ WebTools          │  │
└─────────────────────────┘    │  ├───────────────────┤  │
                               │  │ MCPTools          │  │
                               │  └───────────────────┘  │
                               └─────────────────────────┘
```

---

## 5. 开发路线图

### Phase 1：核心工具层（第 1 周）✅ 已完成

- [x] 创建 `src/tools/` 目录结构
- [x] 实现 `ITool` 接口和 `ToolRegistry`
- [x] 实现 `FileReadTool`、`FileWriteTool`
- [x] 实现 `FileEditTool`（字符串替换）
- [x] 实现 `BashExecTool`（同步/后台命令）
- [x] 实现 `BashOutputTool`
- [x] 实现 `GlobSearchTool`、`GrepSearchTool`

### Phase 2：模型适配层（第 1-2 周）✅ 已完成

- [x] 创建 `ClaudeApiClient`（Claude API 协议）
- [x] 支持流式和非流式响应
- [x] 支持工具调用
- [x] 支持自动重试

### Phase 3：协调器（第 2 周）✅ 已完成

- [x] 创建 `AgentCoordinator`
- [x] 实现工具调用循环
- [x] 实现会话状态管理
- [ ] 移除 Claude SDK 依赖（待集成）

### Phase 4：搜索和网络（第 3 周）

- [ ] 实现 `GrepSearchTool`（内容搜索）
- [ ] 实现 `WebFetchTool`
- [ ] 实现 `WebSearchTool`（可选）

### Phase 5：高级功能（第 4 周）

- [ ] 实现 MCP 客户端
- [ ] 实现子代理系统
- [ ] 实现会话恢复

---

## 6. 文件结构规划

```
src/
├── tools/                      # 🆕 工具层
│   ├── types.ts                # 工具接口定义
│   ├── registry.ts             # 工具注册表
│   ├── file/
│   │   ├── FileReadTool.ts
│   │   ├── FileWriteTool.ts
│   │   └── FileEditTool.ts
│   ├── bash/
│   │   ├── BashExecTool.ts
│   │   └── BashOutputTool.ts
│   ├── search/
│   │   ├── GlobSearchTool.ts
│   │   └── GrepSearchTool.ts
│   ├── web/
│   │   ├── WebFetchTool.ts
│   │   └── WebSearchTool.ts
│   └── mcp/
│       └── MCPTool.ts
├── services/
│   ├── ai/
│   │   ├── SystemPrompts.ts     # ✅ 已创建
│   │   ├── IModelProvider.ts    # 🆕 模型接口（Claude API 协议）
│   │   └── ClaudeApiClient.ts   # 🆕 API 客户端（支持 NewAPI）
│   ├── agent/                   # 🆕 代理层（替代 claude/）
│   │   ├── AgentCoordinator.ts
│   │   ├── SessionManager.ts
│   │   └── ToolCaller.ts
│   └── ... (现有服务)
```

---

## 7. 关键决策记录

| 决策 | 选择 | 原因 |
|------|------|------|
| 是否保留 Claude SDK | ❌ 移除 | 降低依赖，自主可控 |
| 模型 API 协议 | Claude API | NewAPI 统一转换，无需多协议 |
| 命令执行方式 | child_process | 比 PTY 简单，满足大部分场景 |
| 工具调用格式 | Claude Tools 格式 | NewAPI 已处理协议转换 |
| MCP 实现 | 独立客户端 | 不依赖 SDK 内置 MCP |

---

## 8. 下一步行动

1. **确认方案**：用户确认是否采用此架构
2. **创建工具基础**：实现 `ITool` 接口和 `ToolRegistry`
3. **第一个工具**：实现 `FileReadTool` 作为模板
4. **模型适配**：实现 `OpenAICompatibleProvider` 支持 NewAPI

---

*文档版本：1.0*  
*创建日期：2025-01-XX*  
*更新日期：2025-01-XX*
