/**
 * Claude Agent Handlers - 统一处理器文件
 *
 * 职责：处理所有来自 WebView 的请求
 * 依赖：通过 HandlerContext 注入所有服务
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFile } from 'child_process';
import type {
    InitRequest,
    InitResponse,
    GetClaudeStateRequest,
    GetClaudeStateResponse,
    GetMcpServersRequest,
    GetMcpServersResponse,
    GetAssetUrisRequest,
    GetAssetUrisResponse,
    OpenFileRequest,
    OpenFileResponse,
    GetCurrentSelectionResponse,
    ShowNotificationRequest,
    ShowNotificationResponse,
    NewConversationTabRequest,
    NewConversationTabResponse,
    RenameTabRequest,
    RenameTabResponse,
    OpenDiffRequest,
    OpenDiffResponse,
    ListSessionsRequest,
    ListSessionsResponse,
    GetSessionRequest,
    GetSessionResponse,
    ExecRequest,
    ExecResponse,
    ListFilesRequest,
    ListFilesResponse,
    StatPathRequest,
    StatPathResponse,
    OpenContentRequest,
    OpenContentResponse,
    OpenURLRequest,
    OpenURLResponse,
    // GetAuthStatusRequest,
    // GetAuthStatusResponse,
    // LoginRequest,
    // LoginResponse,
    // SubmitOAuthCodeRequest,
    // SubmitOAuthCodeResponse,
    OpenConfigFileRequest,
    OpenConfigFileResponse,
    OpenClaudeInTerminalRequest,
    OpenClaudeInTerminalResponse,
    WriteFileRequest,
    WriteFileResponse,
    CheckEnvironmentRequest,
    CheckEnvironmentResponse,
    SetClaudeCliPathRequest,
    SetClaudeCliPathResponse,
} from '../../../shared/messages';
import type { HandlerContext } from './types';
import type { PermissionMode } from '../../../shared/permissions';

/**
 * 初始化请求
 */
export async function handleInit(
    _request: InitRequest,
    context: HandlerContext
): Promise<InitResponse> {
    const { configService, workspaceService, logService, agentService } = context;

    logService.info('[handleInit] 处理初始化请求');

    // TODO: 从 AuthManager 获取认证状态
    // const authStatus = null;

    // 获取模型设置
    const modelSetting = configService.getValue<string>('xiong.selectedModel') || 'claude-opus-4-5-20251101';

    // 获取默认工作目录
    const defaultWorkspaceFolder = workspaceService.getDefaultWorkspaceFolder();
    const defaultCwd = defaultWorkspaceFolder?.uri.fsPath || process.cwd();

    // 检查是否有打开的工作区
    const hasWorkspace = !!defaultWorkspaceFolder;

    // TODO: 从配置获取 openNewInTab
    const openNewInTab = false;

    // 获取 thinking level (默认值)
    const thinkingLevel = 'off';

    return {
        type: "init_response",
        state: {
            defaultCwd,
            openNewInTab,
            // authStatus,
            modelSetting,
            platform: process.platform,
            thinkingLevel,
            hasWorkspace
        }
    };
}

/**
 * 获取 Claude 状态
 */
export async function handleGetClaudeState(
    _request: GetClaudeStateRequest,
    context: HandlerContext
): Promise<GetClaudeStateResponse> {
    const { logService } = context;

    logService.info('[handleGetClaudeState] 获取 Claude 状态');

    const config = await loadConfig(context);

    return {
        type: "get_claude_state_response",
        config
    };
}

/**
 * 获取 MCP 服务器
 */
export async function handleGetMcpServers(
    _request: GetMcpServersRequest,
    context: HandlerContext,
    channelId?: string
): Promise<GetMcpServersResponse> {
    return await getMcpServers(context, channelId);
}

/**
 * 获取资源 URI
 */
export async function handleGetAssetUris(
    _request: GetAssetUrisRequest,
    context: HandlerContext
): Promise<GetAssetUrisResponse> {
    return {
        type: "asset_uris_response",
        assetUris: getAssetUris(context)
    };
}

/**
 * 打开文件
 */
export async function handleOpenFile(
    request: OpenFileRequest,
    context: HandlerContext
): Promise<OpenFileResponse> {
    const { logService, workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const { filePath, location } = request;

    try {
        const searchResults = await fileSystemService.findFiles(filePath, cwd);
        const resolvedPath = await fileSystemService.resolveExistingPath(filePath, cwd, searchResults);
        const stat = await fs.promises.stat(resolvedPath);
        const uri = vscode.Uri.file(resolvedPath);

        if (stat.isDirectory()) {
            await vscode.commands.executeCommand("revealInExplorer", uri);
            return { type: "open_file_response" };
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });

        if (location) {
            const startLine = Math.max((location.startLine ?? 1) - 1, 0);
            const endLine = Math.max((location.endLine ?? location.startLine ?? 1) - 1, startLine);
            const startColumn = Math.max(location.startColumn ?? 0, 0);
            const endColumn = Math.max(location.endColumn ?? startColumn, startColumn);

            const range = new vscode.Range(
                new vscode.Position(startLine, startColumn),
                new vscode.Position(endLine, endColumn)
            );

            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(range.start, range.end);
        }

        return { type: "open_file_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleOpenFile] 打开文件失败: ${errorMsg}`);
        throw new Error(`Failed to open file: ${errorMsg}`);
    }
}

/**
 * 获取当前编辑器选区
 */
export async function handleGetCurrentSelection(
    context: HandlerContext
): Promise<GetCurrentSelectionResponse> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty || editor.document.uri.scheme !== "file") {
        return {
            type: "get_current_selection_response",
            selection: null
        };
    }

    const document = editor.document;
    const selection = editor.selection;

    return {
        type: "get_current_selection_response",
        selection: {
            filePath: document.uri.fsPath,
            startLine: selection.start.line + 1,
            endLine: selection.end.line + 1,
            startColumn: selection.start.character,
            endColumn: selection.end.character,
            selectedText: document.getText(selection)
        }
    };
}

/**
 * 显示通知
 */
export async function handleShowNotification(
    request: ShowNotificationRequest,
    context: HandlerContext
): Promise<ShowNotificationResponse> {
    const { message, severity, buttons = [] } = request;

    let result: string | undefined;
    switch (severity) {
        case "error":
            result = await vscode.window.showErrorMessage(message, ...buttons);
            break;
        case "warning":
            result = await vscode.window.showWarningMessage(message, ...buttons);
            break;
        case "info":
        default:
            result = await vscode.window.showInformationMessage(message, ...buttons);
            break;
    }

    return {
        type: "show_notification_response",
        buttonValue: result
    };
}

/**
 * 新建会话标签页（聚焦侧边栏）
 */
export async function handleNewConversationTab(
    _request: NewConversationTabRequest,
    context: HandlerContext
): Promise<NewConversationTabResponse> {
    const { logService } = context;

    try {
        await vscode.commands.executeCommand("xiong.chatView.focus");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logService.warn(`Failed to focus chat view: ${message}`);
    }
    return {
        type: "new_conversation_tab_response"
    };
}

/**
 * 重命名标签（目前仅占位）
 */
export async function handleRenameTab(
    _request: RenameTabRequest,
    context: HandlerContext
): Promise<RenameTabResponse> {
    return {
        type: "rename_tab_response"
    };
}

/**
 * 打开 Diff 编辑器
 */
export async function handleOpenDiff(
    request: OpenDiffRequest,
    context: HandlerContext,
    signal: AbortSignal
): Promise<OpenDiffResponse> {
    const { logService, workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    logService.info(`Opening diff for: ${request.originalFilePath}`);

    const originalPath = fileSystemService.resolveFilePath(request.originalFilePath, cwd);
    const fallbackNewPath = request.newFilePath ? fileSystemService.resolveFilePath(request.newFilePath, cwd) : undefined;

    if (signal.aborted) {
        return {
            type: "open_diff_response",
            newEdits: request.edits
        };
    }

    const rightPath = await prepareDiffRightFile(originalPath, fallbackNewPath, request.edits, context);

    const leftExists = await fileSystemService.pathExists(originalPath);
    const leftPath = leftExists
        ? originalPath
        : await fileSystemService.createTempFile(path.basename(request.originalFilePath || request.newFilePath || "untitled"), "");

    const leftUri = vscode.Uri.file(leftPath);
    const rightUri = vscode.Uri.file(rightPath);

    const diffTitle = `${path.basename(request.originalFilePath || request.newFilePath || rightPath)} (Claude)`;

    await vscode.commands.executeCommand(
        "vscode.diff",
        leftUri,
        rightUri,
        diffTitle,
        { preview: true }
    );

    return {
        type: "open_diff_response",
        newEdits: request.edits
    };
}

/**
 * 列出历史会话
 */
export async function handleListSessions(
    _request: ListSessionsRequest,
    context: HandlerContext
): Promise<ListSessionsResponse> {
    const { logService, sessionService, workspaceService } = context;

    try {
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const sessions = await sessionService.listSessions(cwd);

        // 添加 worktree 和 isCurrentWorkspace 字段
        const sessionsWithMeta = sessions.map(session => ({
            ...session,
            worktree: undefined,
            isCurrentWorkspace: true
        }));

        return {
            type: "list_sessions_response",
            sessions: sessionsWithMeta
        };
    } catch (error) {
        logService.error(`Failed to list sessions: ${error}`);
        return {
            type: "list_sessions_response",
            sessions: []
        };
    }
}

/**
 * 获取会话详情
 */
export async function handleGetSession(
    request: GetSessionRequest,
    context: HandlerContext
): Promise<GetSessionResponse> {
    const { logService, sessionService, workspaceService } = context;

    try {
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const messages = await sessionService.getSession(request.sessionId, cwd);

        return {
            type: "get_session_response",
            messages
        };
    } catch (error) {
        logService.error(`Failed to get session: ${error}`);
        return {
            type: "get_session_response",
            messages: []
        };
    }
}

/**
 * 执行命令
 */
export async function handleExec(
    request: ExecRequest,
    context: HandlerContext
): Promise<ExecResponse> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const { command, params } = request;

    return new Promise<ExecResponse>((resolve) => {
        const { spawn } = require('child_process');
        let stdout = "";
        let stderr = "";

        const proc = spawn(command, params, {
            cwd,
            shell: false
        });

        proc.stdout?.on("data", (data: Buffer) => {
            stdout += data.toString();
        });

        proc.stderr?.on("data", (data: Buffer) => {
            stderr += data.toString();
        });

        proc.on("close", (code: number) => {
            resolve({
                type: "exec_response",
                stdout,
                stderr,
                exitCode: code || 0
            });
        });

        proc.on("error", (error: Error) => {
            resolve({
                type: "exec_response",
                stdout: "",
                stderr: error.message,
                exitCode: 1
            });
        });
    });
}

/**
 * 列出文件
 */
export async function handleListFiles(
    request: ListFilesRequest,
    context: HandlerContext
): Promise<ListFilesResponse> {
    const { workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    return {
        type: "list_files_response",
        files: await fileSystemService.findFiles(request.pattern, cwd)
    };
}

/**
 * 统计路径类型（文件 / 目录 / 其它）
 */
export async function handleStatPath(
    request: StatPathRequest,
    context: HandlerContext
): Promise<StatPathResponse> {
    const { workspaceService, fileSystemService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
    const paths = Array.isArray(request.paths) ? request.paths : [];

    const entries: StatPathResponse["entries"] = [];

    for (const raw of paths) {
        if (!raw || typeof raw !== "string") {
            continue;
        }

        const absolute = fileSystemService.normalizeAbsolutePath(raw, cwd);

        try {
            const stat = await fs.promises.stat(absolute);
            let type: StatPathResponse["entries"][number]["type"] = "other";

            if (stat.isFile()) type = "file";
            else if (stat.isDirectory()) type = "directory";

            entries.push({ path: raw, type });
        } catch {
            entries.push({ path: raw, type: "not_found" });
        }
    }

    return {
        type: "stat_path_response",
        entries
    };
}

/**
 * 打开内容（临时文件编辑）
 */
export async function handleOpenContent(
    request: OpenContentRequest,
    context: HandlerContext,
    signal: AbortSignal
): Promise<OpenContentResponse> {
    const { logService, fileSystemService } = context;
    const { content, fileName, editable } = request;

    logService.info(`Opening content as: ${fileName} (editable: ${editable})`);

    if (!editable) {
        const document = await vscode.workspace.openTextDocument({
            content,
            language: detectLanguage(fileName)
        });
        await vscode.window.showTextDocument(document, { preview: true });

        return {
            type: "open_content_response"
        };
    }

    const tempPath = await fileSystemService.createTempFile(fileName || "claude.txt", content);
    const tempUri = vscode.Uri.file(tempPath);
    const document = await vscode.workspace.openTextDocument(tempUri);
    await vscode.window.showTextDocument(document, { preview: false });

    const updatedContent = await waitForDocumentEdits(document, signal);

    return {
        type: "open_content_response",
        updatedContent
    };
}

/**
 * 打开 URL
 */
export async function handleOpenURL(
    request: OpenURLRequest,
    context: HandlerContext
): Promise<OpenURLResponse> {
    const { url } = request;

    try {
        await vscode.env.openExternal(vscode.Uri.parse(url));
        return { type: "open_url_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open URL: ${errorMsg}`);
    }
}

/**
 * 获取认证状态
 */
// export async function handleGetAuthStatus(
//     _request: GetAuthStatusRequest,
//     context: HandlerContext
// ): Promise<GetAuthStatusResponse> {
//     // TODO: 实现认证状态获取
//     // const status = authManager?.getAuthStatus();

//     return {
//         type: "get_auth_status_response",
//         status: null
//     };
// }

/**
 * 登录
 */
// export async function handleLogin(
//     request: LoginRequest,
//     context: HandlerContext
// ): Promise<LoginResponse> {
//     const { logService, agentService } = context;
//     const { method } = request;

//     // TODO: 实现认证流程
//     logService.info(`Login requested with method: ${method}`);

//     // 关闭所有现有通道
//     await agentService.closeAllChannelsWithCredentialChange();

//     return {
//         type: "login_response",
//         auth: {
//             authenticated: false
//         }
//     };
// }

/**
 * 提交 OAuth 代码
 */
// export async function handleSubmitOAuthCode(
//     request: SubmitOAuthCodeRequest,
//     context: HandlerContext
// ): Promise<SubmitOAuthCodeResponse> {
//     const { logService } = context;
//     const { code } = request;

//     // TODO: 实现 OAuth 代码提交
//     logService.info(`OAuth code submitted: ${code.substring(0, 10)}...`);

//     return {
//         type: "submit_oauth_code_response"
//     };
// }

/**
 * 打开配置文件
 */
export async function handleOpenConfigFile(
    request: OpenConfigFileRequest,
    context: HandlerContext
): Promise<OpenConfigFileResponse> {
    const { configType } = request;

    try {
        // VS Code 设置
        if (configType === "vscode") {
            await vscode.commands.executeCommand('workbench.action.openSettings', 'xiong');
        }
        // 用户配置文件
        else {
            const configPath = getConfigFilePath(configType);
            const uri = vscode.Uri.file(configPath);
            await vscode.window.showTextDocument(uri);
        }

        return { type: "open_config_file_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open config file: ${errorMsg}`);
    }
}

/**
 * 在终端打开 Claude
 */
export async function handleOpenClaudeInTerminal(
    _request: OpenClaudeInTerminalRequest,
    context: HandlerContext
): Promise<OpenClaudeInTerminalResponse> {
    const { workspaceService } = context;
    const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();

    try {
        const terminal = vscode.window.createTerminal({
            name: "Claude Code",
            cwd
        });

        terminal.show();
        terminal.sendText("claude --help");

        return { type: "open_claude_in_terminal_response" };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to open terminal: ${errorMsg}`);
    }
}

// ============================================================================
// 配置和状态管理
// ============================================================================

/**
 * 默认支持的 Slash Commands
 */
const DEFAULT_SLASH_COMMANDS = [
    { name: '/clear', description: '清除当前对话历史' },
    { name: '/help', description: '显示帮助信息' },
    { name: '/bug', description: '报告 bug 或问题' },
    { name: '/review', description: '代码审查' },
    { name: '/init', description: '初始化新项目' },
];

/**
 * 默认支持的模型列表
 */
const DEFAULT_MODELS = [
    // Claude 模型
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5', description: '最强大的 Claude 4.5 模型' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5', description: '平衡性能与速度的 Claude 4.5 模型' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', description: '快速响应的 Claude 4.5 模型' },
    { value: 'claude-opus-4.6', label: 'Claude Opus 4.6', description: '最新的 Claude Opus 4.6 模型' },
];

/**
 * 加载配置缓存（硬编码版本）
 */
async function loadConfig(context: HandlerContext): Promise<any> {
    const { logService } = context;

    logService.info("[loadConfig] 返回默认硬编码配置");

    const config = {
        slashCommands: DEFAULT_SLASH_COMMANDS,
        models: DEFAULT_MODELS,
        accountInfo: null
    };

    logService.info(`  - Config: [${JSON.stringify(config)}]`);

    return config;
}

/**
 * 获取 MCP 服务器状态
 */
async function getMcpServers(
    context: HandlerContext,
    channelId?: string
): Promise<GetMcpServersResponse> {
    const { logService, agentService } = context;

    if (!channelId) {
        throw new Error('Channel ID is required');
    }

    // TODO: 通过 agentService 获取 channel
    // const channel = agentService.getChannel(channelId);

    try {
        return {
            type: "get_mcp_servers_response",
            // mcpServers: await channel.query.mcpServerStatus?.() || []
            mcpServers: []
        };
    } catch (error) {
        logService.error(`Error fetching MCP servers: ${error}`);
        return {
            type: "get_mcp_servers_response",
            mcpServers: []
        };
    }
}

/**
 * 获取资源 URI
 */
function getAssetUris(context: HandlerContext): Record<string, { light: string; dark: string }> {
    const { webViewService } = context;
    const webview = webViewService.getWebView();

    if (!webview) {
        return {};
    }

    const assets = {
        clawd: {
            light: path.join("resources", "clawd.svg"),
            dark: path.join("resources", "clawd.svg")
        },
        "welcome-art": {
            light: path.join("resources", "welcome-art-light.svg"),
            dark: path.join("resources", "welcome-art-dark.svg")
        }
    } as const;

    // TODO: 获取 extensionPath
    const extensionPath = process.cwd();

    const toWebviewUri = (relativePath: string) =>
        webview.asWebviewUri(
            vscode.Uri.file(path.join(extensionPath, relativePath))
        ).toString();

    return Object.fromEntries(
        Object.entries(assets).map(([key, value]) => [
            key,
            {
                light: toWebviewUri(value.light),
                dark: toWebviewUri(value.dark)
            }
        ])
    );
}

// ============================================================================
// 辅助方法
// ============================================================================

async function prepareDiffRightFile(
    originalPath: string,
    fallbackPath: string | undefined,
    edits: OpenDiffRequest["edits"],
    context: HandlerContext
): Promise<string> {
    let baseContent = "";

    if (await context.fileSystemService.pathExists(originalPath)) {
        baseContent = await fs.promises.readFile(originalPath, "utf8");
    } else if (fallbackPath && await context.fileSystemService.pathExists(fallbackPath)) {
        baseContent = await fs.promises.readFile(fallbackPath, "utf8");
    }

    let modified = baseContent;

    for (const edit of edits) {
        const oldString = edit.oldString ?? "";
        const newString = edit.newString ?? "";

        if (!oldString) {
            modified += newString;
            continue;
        }

        if (edit.replaceAll) {
            modified = modified.split(oldString).join(newString);
        } else {
            const index = modified.indexOf(oldString);
            if (index >= 0) {
                modified = `${modified.slice(0, index)}${newString}${modified.slice(index + oldString.length)}`;
            } else {
                modified += newString;
            }
        }
    }

    const baseName = path.basename(fallbackPath || originalPath || "claude.diff");
    const outputName = baseName.endsWith(".claude") ? baseName : `${baseName}.claude`;

    return context.fileSystemService.createTempFile(outputName, modified);
}

async function waitForDocumentEdits(
    document: vscode.TextDocument,
    signal: AbortSignal
): Promise<string> {
    let currentText = document.getText();
    let resolved = false;

    return new Promise<string>((resolve) => {
        const disposables: vscode.Disposable[] = [];

        const cleanup = () => {
            if (!resolved) {
                resolved = true;
                disposables.forEach(d => d.dispose());
            }
        };

        disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                if (event.document.uri.toString() === document.uri.toString()) {
                    currentText = event.document.getText();
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidSaveTextDocument(event => {
                if (event.uri.toString() === document.uri.toString()) {
                    currentText = event.getText();
                    cleanup();
                    resolve(currentText);
                }
            })
        );

        disposables.push(
            vscode.workspace.onDidCloseTextDocument(event => {
                if (event.uri.toString() === document.uri.toString()) {
                    cleanup();
                    resolve(currentText);
                }
            })
        );

        if (signal.aborted) {
            cleanup();
            resolve(currentText);
            return;
        }

        signal.addEventListener("abort", () => {
            cleanup();
            resolve(currentText);
        }, { once: true });
    });
}

function detectLanguage(fileName?: string): string {
    if (!fileName) {
        return "plaintext";
    }

    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
        case ".ts":
        case ".tsx":
            return "typescript";
        case ".js":
        case ".jsx":
            return "javascript";
        case ".json":
            return "json";
        case ".py":
            return "python";
        case ".java":
            return "java";
        case ".go":
            return "go";
        case ".rs":
            return "rust";
        case ".md":
            return "markdown";
        case ".sh":
            return "shellscript";
        case ".css":
            return "css";
        case ".html":
        case ".htm":
            return "html";
        default:
            return "plaintext";
    }
}

function getConfigFilePath(configType: string): string {
    const homeDir = os.homedir();

    switch (configType) {
        case "settings":
            return path.join(homeDir, ".claude", "settings.json");
        case "config":
            return path.join(homeDir, ".claude", "config.json");
        default:
            return path.join(homeDir, ".claude", `${configType}.json`);
    }
}

/**
 * 写入文件
 */
export async function handleWriteFile(
    request: WriteFileRequest,
    context: HandlerContext
): Promise<WriteFileResponse> {
    const { logService, workspaceService, fileSystemService } = context;
    const { filePath, content } = request;

    try {
        // 解析文件路径（支持相对路径和绝对路径）
        const cwd = workspaceService.getDefaultWorkspaceFolder()?.uri.fsPath || process.cwd();
        const absolutePath = path.isAbsolute(filePath)
            ? filePath
            : path.join(cwd, filePath);

        // 确保目录存在
        const dir = path.dirname(absolutePath);
        await fs.promises.mkdir(dir, { recursive: true });

        // 写入文件
        await fs.promises.writeFile(absolutePath, content, 'utf8');

        logService.info(`[handleWriteFile] 文件已写入: ${absolutePath}`);

        return {
            type: "write_file_response",
            success: true
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleWriteFile] 写入文件失败: ${errorMsg}`);

        return {
            type: "write_file_response",
            success: false,
            error: errorMsg
        };
    }
}

// ============================================================================
// Claude 配置管理 Handlers
// ============================================================================

import type {
    GetClaudeConfigRequest,
    GetClaudeConfigResponse,
    SetApiKeyRequest,
    SetApiKeyResponse,
    SetBaseUrlRequest,
    SetBaseUrlResponse,
    GetSubscriptionRequest,
    GetSubscriptionResponse,
    GetUsageRequest,
    GetUsageResponse,
    // Local Todo
    GetLocalTodosRequest,
    GetLocalTodosResponse,
    AddLocalTodoRequest,
    AddLocalTodoResponse,
    UpdateLocalTodoRequest,
    UpdateLocalTodoResponse,
    DeleteLocalTodoRequest,
    DeleteLocalTodoResponse,
    ClearCompletedTodosRequest,
    ClearCompletedTodosResponse,
    ImportClaudeTodosRequest,
    ImportClaudeTodosResponse,
} from '../../../shared/messages';

/**
 * 获取 Claude 配置
 */
export async function handleGetClaudeConfig(
    _request: GetClaudeConfigRequest,
    context: HandlerContext
): Promise<GetClaudeConfigResponse> {
    const { claudeConfigService, configService, logService } = context;

    logService.info('[handleGetClaudeConfig] 获取 Claude 配置');

    // 返回完整的 API Key（不脱敏），方便用户查看和编辑
    const apiKey = await claudeConfigService.getApiKey();
    const baseUrl = await claudeConfigService.getBaseUrl();
    const cliPath = configService.getValue<string>('xiong.claudeCliPath') || null;

    logService.info(`[handleGetClaudeConfig] 读取结果: apiKey=${apiKey ? apiKey.slice(0, 8) + '...' : 'null'}, baseUrl=${baseUrl || 'null'}`);

    return {
        type: "get_claude_config_response",
        config: {
            apiKey,
            baseUrl,
            claudeCliPath: cliPath,
            isConfigured: apiKey !== null
        }
    };
}

/**
 * 设置 API Key
 */
export async function handleSetApiKey(
    request: SetApiKeyRequest,
    context: HandlerContext
): Promise<SetApiKeyResponse> {
    const { claudeConfigService, logService } = context;

    logService.info('[handleSetApiKey] 设置 API Key');

    try {
        await claudeConfigService.setApiKey(request.apiKey);

        logService.info('[handleSetApiKey] API Key 已更新');

        return {
            type: "set_api_key_response",
            success: true
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleSetApiKey] 设置 API Key 失败: ${errorMsg}`);

        return {
            type: "set_api_key_response",
            success: false,
            error: errorMsg
        };
    }
}

/**
 * 设置 Base URL
 */
export async function handleSetBaseUrl(
    request: SetBaseUrlRequest,
    context: HandlerContext
): Promise<SetBaseUrlResponse> {
    const { claudeConfigService, logService } = context;

    logService.info(`[handleSetBaseUrl] 设置 Base URL: ${request.baseUrl}`);

    try {
        await claudeConfigService.setBaseUrl(request.baseUrl);

        logService.info('[handleSetBaseUrl] Base URL 已更新');

        return {
            type: "set_base_url_response",
            success: true
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleSetBaseUrl] 设置 Base URL 失败: ${errorMsg}`);

        return {
            type: "set_base_url_response",
            success: false,
            error: errorMsg
        };
    }
}

/**
 * 设置 Claude CLI 路径
 */
export async function handleSetClaudeCliPath(
    request: SetClaudeCliPathRequest,
    context: HandlerContext
): Promise<SetClaudeCliPathResponse> {
    const { configService, logService } = context;

    const cliPath = request.cliPath?.trim() ?? '';
    logService.info(`[handleSetClaudeCliPath] 设置 Claude CLI 路径: ${cliPath || '(empty)'}`);

    try {
        await configService.updateValue('xiong.claudeCliPath', cliPath);
        logService.info('[handleSetClaudeCliPath] Claude CLI 路径已更新');
        return {
            type: "set_claude_cli_path_response",
            success: true
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleSetClaudeCliPath] 设置 Claude CLI 路径失败: ${errorMsg}`);
        return {
            type: "set_claude_cli_path_response",
            success: false,
            error: errorMsg
        };
    }
}

/**
 * 查询订阅信息
 */
export async function handleGetSubscription(
    _request: GetSubscriptionRequest,
    context: HandlerContext
): Promise<GetSubscriptionResponse> {
    const { claudeConfigService, logService } = context;

    logService.info('[handleGetSubscription] 查询订阅信息');

    try {
        const subscription = await claudeConfigService.getSubscription();

        if (!subscription) {
            return {
                type: "get_subscription_response",
                subscription: null,
                error: "无法获取订阅信息，请检查 API Key 是否正确"
            };
        }

        return {
            type: "get_subscription_response",
            subscription
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleGetSubscription] 查询订阅信息失败: ${errorMsg}`);

        return {
            type: "get_subscription_response",
            subscription: null,
            error: errorMsg
        };
    }
}

/**
 * 查询使用量
 */
export async function handleGetUsage(
    request: GetUsageRequest,
    context: HandlerContext
): Promise<GetUsageResponse> {
    const { claudeConfigService, logService } = context;

    logService.info(`[handleGetUsage] 查询使用量: ${request.startDate} - ${request.endDate}`);

    try {
        const usage = await claudeConfigService.getUsage(request.startDate, request.endDate);

        if (!usage) {
            return {
                type: "get_usage_response",
                usage: null,
                error: "无法获取使用量信息，请检查 API Key 是否正确"
            };
        }

        return {
            type: "get_usage_response",
            usage
        };
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logService.error(`[handleGetUsage] 查询使用量失败: ${errorMsg}`);

        return {
            type: "get_usage_response",
            usage: null,
            error: errorMsg
        };
    }
}

/**
 * 检查环境（Claude Code CLI 和 Git）
 */
export async function handleCheckEnvironment(
    _request: CheckEnvironmentRequest,
    context: HandlerContext
): Promise<CheckEnvironmentResponse> {
    const { logService, configService } = context;

    logService.info('[handleCheckEnvironment] 检查环境');

    const result: CheckEnvironmentResponse = {
        type: "check_environment_response",
        claudeCode: { installed: false },
        git: { installed: false },
        allReady: false
    };

    // 检查 Claude Code CLI
    // 根据操作系统尝试多个可能的路径
    const isWindows = process.platform === 'win32';
    const homedir = os.homedir();

    const claudePaths: string[] = isWindows
        ? [
            'claude',  // 系统 PATH
            'claude.exe',
            'claude.ps1',
            `${homedir}\\AppData\\Local\\Programs\\claude\\claude.exe`,
            `${homedir}\\AppData\\Roaming\\npm\\claude.cmd`,
            `${homedir}\\AppData\\Roaming\\npm\\claude.ps1`,
            `${homedir}\\.claude\\local\\claude.exe`,
            'C:\\Program Files\\Claude\\claude.exe',
            'C:\\Program Files (x86)\\Claude\\claude.exe',
        ]
        : [
            'claude',  // 系统 PATH
            '/usr/local/bin/claude',
            '/opt/homebrew/bin/claude',
            `${homedir}/.local/bin/claude`,
            `${homedir}/.claude/local/claude`,
            '/usr/bin/claude',
        ];

    const addUniquePath = (target: string[], candidate: string | undefined | null) => {
        if (!candidate) return;
        if (!target.includes(candidate)) {
            target.push(candidate);
        }
    };

    // 优先使用用户配置的 CLI 路径
    const configuredCliPath = configService.getValue<string>('xiong.claudeCliPath');
    if (configuredCliPath && configuredCliPath.trim() !== '') {
        const trimmedPath = configuredCliPath.trim();
        if (!claudePaths.includes(trimmedPath)) {
            claudePaths.unshift(trimmedPath);
        }
        logService.info(`[handleCheckEnvironment] 使用自定义 Claude CLI 路径: ${trimmedPath}`);
    }

    // Windows: 额外考虑 APPDATA/LOCALAPPDATA 的 npm 全局 bin 位置
    if (isWindows) {
        const appData = process.env.APPDATA;
        const localAppData = process.env.LOCALAPPDATA;
        const programFiles = process.env.ProgramFiles;
        const programFilesX86 = process.env['ProgramFiles(x86)'];

        addUniquePath(claudePaths, appData ? `${appData}\\npm\\claude.cmd` : null);
        addUniquePath(claudePaths, appData ? `${appData}\\npm\\claude.exe` : null);
        addUniquePath(claudePaths, appData ? `${appData}\\npm\\claude.ps1` : null);
        addUniquePath(claudePaths, localAppData ? `${localAppData}\\npm\\claude.cmd` : null);
        addUniquePath(claudePaths, localAppData ? `${localAppData}\\npm\\claude.exe` : null);
        addUniquePath(claudePaths, localAppData ? `${localAppData}\\npm\\claude.ps1` : null);
        addUniquePath(claudePaths, programFiles ? `${programFiles}\\Claude\\claude.exe` : null);
        addUniquePath(claudePaths, programFilesX86 ? `${programFilesX86}\\Claude\\claude.exe` : null);
    }

    try {
        // Windows: 使用 where 进一步定位 PATH 中的 claude 可执行文件
        if (isWindows) {
            const whereResults: string[] = [];
            const findWithWhere = async (name: string) => {
                try {
                    const output = await new Promise<string>((resolve, reject) => {
                        execFile('where', [name], { timeout: 3000 }, (error, stdout) => {
                            if (error) {
                                reject(error);
                                return;
                            }
                            resolve(stdout);
                        });
                    });
                    for (const line of output.split(/\r?\n/)) {
                        const trimmed = line.trim();
                        if (trimmed) whereResults.push(trimmed);
                    }
                } catch {
                    // 忽略 where 失败
                }
            };

            await findWithWhere('claude');
            await findWithWhere('claude.cmd');
            await findWithWhere('claude.exe');

            for (const foundPath of whereResults) {
                addUniquePath(claudePaths, foundPath);
            }
        }

        let claudeFound = false;
        for (const claudePath of claudePaths) {
            try {
                const hasPathSeparator = claudePath.includes('/') || claudePath.includes('\\');
                const isExplicitPath = path.isAbsolute(claudePath) || hasPathSeparator;
                const fileExists = isExplicitPath ? fs.existsSync(claudePath) : false;

                if (fileExists) {
                    logService.info(`[handleCheckEnvironment] Claude Code CLI 文件存在: ${claudePath}`);
                    result.claudeCode = { installed: true, path: claudePath };
                    claudeFound = true;
                }

                const claudeResult = await new Promise<{ installed: boolean; version?: string; path?: string }>((resolve) => {
                    const isPowerShellScript = isWindows && claudePath.toLowerCase().endsWith('.ps1');
                    const execCmd = isPowerShellScript ? 'powershell.exe' : claudePath;
                    const execArgs = isPowerShellScript
                        ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', claudePath, '--version']
                        : ['--version'];

                    execFile(execCmd, execArgs, { timeout: 5000 }, (error, stdout, stderr) => {
                        if (error) {
                            resolve({ installed: false });
                        } else {
                            const version = stdout.trim() || stderr.trim();
                            logService.info(`[handleCheckEnvironment] Claude Code CLI 版本: ${version} (路径: ${claudePath})`);
                            resolve({ installed: true, version, path: claudePath });
                        }
                    });
                });

                if (claudeResult.installed) {
                    result.claudeCode = claudeResult;
                    claudeFound = true;
                    break;
                }

                if (claudeFound) {
                    break;
                }
            } catch {
                // 继续尝试下一个路径
            }
        }

        if (!claudeFound) {
            logService.warn(`[handleCheckEnvironment] Claude Code CLI 未安装或不可用（已尝试 ${claudePaths.length} 个路径）`);
        }
    } catch (error) {
        logService.error(`[handleCheckEnvironment] 检查 Claude Code CLI 失败: ${error}`);
    }

    // 检查 Git
    const gitPaths = isWindows
        ? ['git', 'git.exe', 'C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files (x86)\\Git\\bin\\git.exe']
        : ['git'];

    try {
        let gitFound = false;
        for (const gitPath of gitPaths) {
            try {
                const gitResult = await new Promise<{ installed: boolean; version?: string }>((resolve) => {
                    execFile(gitPath, ['--version'], { timeout: 5000 }, (error, stdout) => {
                        if (error) {
                            resolve({ installed: false });
                        } else {
                            const version = stdout.trim();
                            logService.info(`[handleCheckEnvironment] Git 版本: ${version}`);
                            resolve({ installed: true, version });
                        }
                    });
                });

                if (gitResult.installed) {
                    result.git = gitResult;
                    gitFound = true;
                    break;
                }
            } catch {
                // 继续尝试下一个路径
            }
        }

        if (!gitFound) {
            logService.warn('[handleCheckEnvironment] Git 未安装或不可用');
        }
    } catch (error) {
        logService.error(`[handleCheckEnvironment] 检查 Git 失败: ${error}`);
    }

    // 判断是否全部就绪
    result.allReady = result.claudeCode.installed && result.git.installed;

    logService.info(`[handleCheckEnvironment] 环境检查完成: Claude=${result.claudeCode.installed}, Git=${result.git.installed}`);

    return result;
}

// ============================================================================
// 本地 Todo CRUD Handlers
// ============================================================================

/**
 * 获取所有本地 Todo
 */
export async function handleGetLocalTodos(
    _request: GetLocalTodosRequest,
    context: HandlerContext
): Promise<GetLocalTodosResponse> {
    const { localTodoService, logService } = context;

    logService.info('[handleGetLocalTodos] 获取本地 Todo 列表');

    const todos = await localTodoService.getAll();

    return {
        type: "get_local_todos_response",
        todos
    };
}

/**
 * 添加本地 Todo
 */
export async function handleAddLocalTodo(
    request: AddLocalTodoRequest,
    context: HandlerContext
): Promise<AddLocalTodoResponse> {
    const { localTodoService, logService } = context;

    logService.info(`[handleAddLocalTodo] 添加 Todo: ${request.todo.content}`);

    const todo = await localTodoService.add(request.todo);

    return {
        type: "add_local_todo_response",
        todo
    };
}

/**
 * 更新本地 Todo
 */
export async function handleUpdateLocalTodo(
    request: UpdateLocalTodoRequest,
    context: HandlerContext
): Promise<UpdateLocalTodoResponse> {
    const { localTodoService, logService } = context;

    logService.info(`[handleUpdateLocalTodo] 更新 Todo: ${request.id}`);

    const todo = await localTodoService.update(request.id, request.updates);

    if (!todo) {
        throw new Error(`Todo not found: ${request.id}`);
    }

    return {
        type: "update_local_todo_response",
        todo
    };
}

/**
 * 删除本地 Todo
 */
export async function handleDeleteLocalTodo(
    request: DeleteLocalTodoRequest,
    context: HandlerContext
): Promise<DeleteLocalTodoResponse> {
    const { localTodoService, logService } = context;

    logService.info(`[handleDeleteLocalTodo] 删除 Todo: ${request.id}`);

    const success = await localTodoService.delete(request.id);

    return {
        type: "delete_local_todo_response",
        success
    };
}

/**
 * 清除已完成的 Todo
 */
export async function handleClearCompletedTodos(
    _request: ClearCompletedTodosRequest,
    context: HandlerContext
): Promise<ClearCompletedTodosResponse> {
    const { localTodoService, logService } = context;

    logService.info('[handleClearCompletedTodos] 清除已完成的 Todo');

    const deletedCount = await localTodoService.clearCompleted();

    return {
        type: "clear_completed_todos_response",
        deletedCount
    };
}

/**
 * 从 Claude TodoWrite 导入
 */
export async function handleImportClaudeTodos(
    request: ImportClaudeTodosRequest,
    context: HandlerContext
): Promise<ImportClaudeTodosResponse> {
    const { localTodoService, logService } = context;

    logService.info(`[handleImportClaudeTodos] 导入 ${request.todos.length} 个 Todo`);

    const todos = await localTodoService.importFromClaude(request.todos, request.sessionId);

    return {
        type: "import_claude_todos_response",
        todos
    };
}
