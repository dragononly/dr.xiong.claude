/**
 * BashTerminalTool - 在 VSCode 内置终端中执行命令
 *
 * 功能：
 * - 在 VSCode 集成终端中执行命令
 * - 用户可以看到命令执行过程
 * - 使用 Shell Integration API 捕获命令输出
 * - 支持超时控制
 * - 支持手动干预（Ctrl+C 等）
 */

import * as vscode from 'vscode';
import * as path from 'path';
import {
    ITool,
    ToolContext,
    ToolResult,
    JSONSchema,
    successResult,
    errorResultFromError,
} from '../types';

/**
 * Bash 终端执行输入参数
 */
export interface BashTerminalInput {
    /** 要执行的命令 */
    command: string;
    /** 超时时间（毫秒），默认 120000 (2分钟) */
    timeout?: number;
    /** 工作目录（可选，默认使用 context.cwd） */
    cwd?: string;
    /** 终端名称（可选，默认 "Claude Task"） */
    terminalName?: string;
    /** 命令描述（可选，用于日志） */
    description?: string;
    /** 后台运行模式，命令启动后立即返回（适用于服务器等长时间运行的进程） */
    run_in_background?: boolean;
}

/**
 * Bash 终端执行输出
 */
export interface BashTerminalOutput {
    /** 终端输出 */
    output: string;
    /** 退出码（-1 表示超时或手动取消） */
    exitCode: number;
    /** 是否超时 */
    timedOut?: boolean;
    /** Shell Integration 是否可用 */
    shellIntegrationAvailable?: boolean;
}

/**
 * 默认超时时间（30秒）- 用于普通命令
 */
const DEFAULT_TIMEOUT = 30000;

/**
 * 超时配置（毫秒）- 根据命令类型智能选择
 */
const TIMEOUT_PRESETS = {
    /** 网络命令超时（30秒）*/
    network: 30000,
    /** 构建命令超时（3分钟）*/
    build: 180000,
    /** 安装命令超时（5分钟）*/
    install: 300000,
    /** 默认命令超时（30秒）*/
    default: 30000,
};

/**
 * 最大超时时间（10分钟）
 */
const MAX_TIMEOUT = 600000;

/**
 * 最大输出大小（512KB）
 */
const MAX_OUTPUT_SIZE = 512 * 1024;

/**
 * 服务类命令关键词（自动转后台运行）
 */
const BACKGROUND_COMMAND_PATTERNS = [
    /\bnpm\s+(?:run\s+)?(?:start|dev|serve)\b/i,
    /\byarn\s+(?:run\s+)?(?:start|dev|serve)\b/i,
    /\bpnpm\s+(?:run\s+)?(?:start|dev|serve)\b/i,
    /\bnode\s+.*server/i,
    /\bpython\s+.*(?:server|app|main)\.py\b/i,
    /\bpython3?\s+-m\s+(?:http\.server|flask|uvicorn|gunicorn)/i,
    /\buvicorn\b/i,
    /\bgunicorn\b/i,
    /\bflask\s+run\b/i,
    /\bdjango.*runserver\b/i,
    /\brails\s+(?:s|server)\b/i,
    /\bphp\s+-S\b/i,
    /\bhttp-server\b/i,
    /\blive-server\b/i,
    /\bvite\b/i,
    /\bnext\s+dev\b/i,
    /\bng\s+serve\b/i,
    /\bvue-cli-service\s+serve\b/i,
    /\breact-scripts\s+start\b/i,
];

/**
 * 网络命令关键词
 */
const NETWORK_COMMAND_PATTERNS = [
    /\bcurl\b/i,
    /\bwget\b/i,
    /\bssh\b/i,
    /\bscp\b/i,
    /\brsync\b/i,
    /\bftp\b/i,
    /\bping\b/i,
];

/**
 * 构建命令关键词
 */
const BUILD_COMMAND_PATTERNS = [
    /\bnpm\s+(?:run\s+)?build\b/i,
    /\byarn\s+(?:run\s+)?build\b/i,
    /\bpnpm\s+(?:run\s+)?build\b/i,
    /\bmake\b/i,
    /\bcmake\b/i,
    /\bgcc\b/i,
    /\bg\+\+\b/i,
    /\bclang\b/i,
    /\bcargo\s+build\b/i,
    /\bgo\s+build\b/i,
    /\bgradle\b/i,
    /\bmvn\b/i,
    /\bdotnet\s+build\b/i,
    /\btsc\b/i,
    /\besbuild\b/i,
    /\bwebpack\b/i,
    /\brollup\b/i,
];

/**
 * 安装命令关键词
 */
const INSTALL_COMMAND_PATTERNS = [
    /\bnpm\s+(?:install|i|ci)\b/i,
    /\byarn\s*(?:install)?$/i,
    /\byarn\s+add\b/i,
    /\bpnpm\s+(?:install|i|add)\b/i,
    /\bpip\s+install\b/i,
    /\bpip3\s+install\b/i,
    /\bbrew\s+install\b/i,
    /\bapt(?:-get)?\s+install\b/i,
    /\byum\s+install\b/i,
    /\bcargo\s+install\b/i,
    /\bgo\s+get\b/i,
    /\bgo\s+install\b/i,
    /\bcomposer\s+install\b/i,
    /\bbundle\s+install\b/i,
    /\bgem\s+install\b/i,
];

/**
 * 检测命令是否应该后台运行
 */
function shouldRunInBackground(command: string): boolean {
    return BACKGROUND_COMMAND_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * 根据命令智能选择超时时间
 */
function getSmartTimeout(command: string, explicitTimeout?: number): number {
    // 如果用户明确指定了超时时间，使用用户指定的
    if (explicitTimeout !== undefined) {
        return Math.min(explicitTimeout, MAX_TIMEOUT);
    }

    // 安装命令
    if (INSTALL_COMMAND_PATTERNS.some(p => p.test(command))) {
        return TIMEOUT_PRESETS.install;
    }

    // 构建命令
    if (BUILD_COMMAND_PATTERNS.some(p => p.test(command))) {
        return TIMEOUT_PRESETS.build;
    }

    // 网络命令
    if (NETWORK_COMMAND_PATTERNS.some(p => p.test(command))) {
        return TIMEOUT_PRESETS.network;
    }

    // 默认超时
    return TIMEOUT_PRESETS.default;
}

/**
 * 终端管理器 - 单例模式管理终端实例
 */
class TerminalManager {
    private static instance: TerminalManager;
    private terminals = new Map<string, vscode.Terminal>();
    private disposables: vscode.Disposable[] = [];

    private constructor() {
        // 监听终端关闭事件，自动清理
        this.disposables.push(
            vscode.window.onDidCloseTerminal(terminal => {
                for (const [name, t] of this.terminals.entries()) {
                    if (t === terminal) {
                        this.terminals.delete(name);
                        break;
                    }
                }
            })
        );
    }

    static getInstance(): TerminalManager {
        if (!TerminalManager.instance) {
            TerminalManager.instance = new TerminalManager();
        }
        return TerminalManager.instance;
    }

    /**
     * 获取或创建终端
     */
    getOrCreateTerminal(name: string, cwd: string): vscode.Terminal {
        let terminal = this.terminals.get(name);

        // 检查终端是否仍然有效
        if (terminal) {
            const exists = vscode.window.terminals.includes(terminal);
            if (!exists) {
                this.terminals.delete(name);
                terminal = undefined;
            }
        }

        if (!terminal) {
            terminal = vscode.window.createTerminal({
                name,
                cwd,
            });
            this.terminals.set(name, terminal);
        }

        return terminal;
    }

    dispose(): void {
        for (const d of this.disposables) {
            d.dispose();
        }
        this.disposables = [];
    }
}

/**
 * 等待 Shell Integration 可用
 */
async function waitForShellIntegration(
    terminal: vscode.Terminal,
    timeoutMs: number = 10000
): Promise<vscode.TerminalShellIntegration | undefined> {
    // 如果已经有 shellIntegration，直接返回
    if (terminal.shellIntegration) {
        return terminal.shellIntegration;
    }

    return new Promise<vscode.TerminalShellIntegration | undefined>((resolve) => {
        const startTime = Date.now();

        const disposable = vscode.window.onDidChangeTerminalShellIntegration(e => {
            if (e.terminal === terminal && e.shellIntegration) {
                disposable.dispose();
                resolve(e.shellIntegration);
            }
        });

        // 超时处理
        const checkInterval = setInterval(() => {
            if (terminal.shellIntegration) {
                clearInterval(checkInterval);
                disposable.dispose();
                resolve(terminal.shellIntegration);
            } else if (Date.now() - startTime > timeoutMs) {
                clearInterval(checkInterval);
                disposable.dispose();
                resolve(undefined);
            }
        }, 100);
    });
}

/**
 * 使用 Shell Integration 执行命令并读取输出
 */
async function executeWithShellIntegration(
    terminal: vscode.Terminal,
    shellIntegration: vscode.TerminalShellIntegration,
    command: string,
    timeout: number,
    logService: any
): Promise<{ output: string; exitCode: number; timedOut: boolean }> {
    return new Promise((resolve) => {
        let output = '';
        let timedOut = false;
        let resolved = false;

        // 执行命令
        const execution = shellIntegration.executeCommand(command);

        // 设置超时
        const timeoutId = setTimeout(() => {
            if (!resolved) {
                timedOut = true;
                resolved = true;
                cleanup();
                logService.warn(`[BashTerminalTool] 命令执行超时`);
                resolve({
                    output: output || '命令执行超时，未能获取完整输出。',
                    exitCode: -1,
                    timedOut: true,
                });
            }
        }, timeout);

        // 监听命令结束事件以获取退出码
        const endListener = vscode.window.onDidEndTerminalShellExecution(async (event) => {
            if (event.terminal === terminal && event.execution === execution) {
                if (!resolved) {
                    resolved = true;
                    cleanup();

                    // 清理 ANSI 转义序列
                    const cleanOutput = stripAnsiCodes(output);

                    resolve({
                        output: cleanOutput,
                        exitCode: event.exitCode ?? 0,
                        timedOut: false,
                    });
                }
            }
        });

        function cleanup() {
            clearTimeout(timeoutId);
            endListener.dispose();
        }

        // 异步读取输出（不阻塞）
        (async () => {
            try {
                const stream = execution.read();
                for await (const data of stream) {
                    if (resolved) break;

                    // 累积输出，但限制大小
                    if (output.length + data.length <= MAX_OUTPUT_SIZE) {
                        output += data;
                    } else if (output.length < MAX_OUTPUT_SIZE) {
                        output += data.slice(0, MAX_OUTPUT_SIZE - output.length);
                        output += '\n... [输出已截断]';
                    }
                }
            } catch (error: any) {
                if (!resolved) {
                    logService.error(`[BashTerminalTool] 读取输出时发生错误`, error);
                }
            }
        })();
    });
}

/**
 * 使用传统方式执行命令（回退方案）
 */
async function executeWithFallback(
    terminal: vscode.Terminal,
    command: string,
    logService: any
): Promise<{ output: string; exitCode: number }> {
    // 发送命令到终端
    terminal.sendText(command);

    logService.info(`[BashTerminalTool] Shell Integration 不可用，使用传统方式执行`);

    return {
        output: `命令已在终端 "${terminal.name}" 中执行。\n\n` +
            `由于 Shell Integration 不可用，无法自动捕获输出。\n` +
            `请查看终端面板查看命令执行结果。\n\n` +
            `提示：\n` +
            `- 确保终端使用支持 Shell Integration 的 shell (bash, zsh, pwsh)\n` +
            `- 可以在 VS Code 设置中启用 "terminal.integrated.shellIntegration.enabled"`,
        exitCode: 0,
    };
}

/**
 * 去除 ANSI 转义序列
 */
function stripAnsiCodes(str: string): string {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
        .replace(/\x1b\].*?\x07/g, '')  // OSC sequences
        .replace(/\r/g, '');  // 回车符
}

/**
 * BashTerminalTool 实现
 */
export class BashTerminalTool implements ITool<BashTerminalInput, BashTerminalOutput> {
    readonly name = 'bash_terminal';

    readonly description = `Execute a shell command in VSCode's integrated terminal. The command runs in a visible terminal so you can monitor its progress and intervene if needed (e.g., Ctrl+C). Uses Shell Integration API to capture command output. This is useful for commands where you want transparency and the ability to see real-time output.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute.',
            },
            timeout: {
                type: 'number',
                description: 'Timeout in milliseconds. If not specified, smart timeout is used: 30s for regular/network commands, 3min for build commands, 5min for install commands. Max is 600000 (10 minutes).',
            },
            cwd: {
                type: 'string',
                description: 'Working directory for the command. Defaults to workspace root.',
            },
            terminalName: {
                type: 'string',
                description: 'Name for the terminal. Defaults to "Claude Task".',
            },
            description: {
                type: 'string',
                description: 'A short description of what this command does (for logging).',
            },
            run_in_background: {
                type: 'boolean',
                description: 'If true, run the command in background mode. Service commands (npm start, dev servers, etc.) are automatically detected and run in background. The tool will return immediately after starting the command.',
            },
        },
        required: ['command'],
    };

    validate(input: BashTerminalInput): string | undefined {
        if (!input.command || typeof input.command !== 'string') {
            return 'command 是必需参数';
        }
        if (input.command.trim() === '') {
            return 'command 不能为空';
        }
        if (input.timeout !== undefined) {
            if (typeof input.timeout !== 'number' || input.timeout < 0) {
                return 'timeout 必须是非负数';
            }
            if (input.timeout > MAX_TIMEOUT) {
                return `timeout 不能超过 ${MAX_TIMEOUT}ms (10分钟)`;
            }
        }
        return undefined;
    }

    async execute(input: BashTerminalInput, context: ToolContext): Promise<ToolResult<BashTerminalOutput>> {
        const startTime = Date.now();
        const {
            command,
            timeout: explicitTimeout,
            cwd: inputCwd,
            terminalName = 'Claude Task',
            description,
            run_in_background: explicitBackground,
        } = input;
        const { cwd: contextCwd, logService } = context;

        // 智能超时选择
        const timeout = getSmartTimeout(command, explicitTimeout);

        // 自动检测是否应该后台运行
        const autoBackground = shouldRunInBackground(command);
        const runInBackground = explicitBackground ?? autoBackground;

        // 解析工作目录
        const workingDir = inputCwd
            ? (path.isAbsolute(inputCwd) ? inputCwd : path.join(contextCwd, inputCwd))
            : contextCwd;

        const logPrefix = description ? `[${description}]` : '';
        logService.info(`[BashTerminalTool] ${logPrefix} 在终端执行命令: ${command.slice(0, 200)}${command.length > 200 ? '...' : ''}`);
        logService.info(`[BashTerminalTool] 工作目录: ${workingDir}, 智能超时: ${timeout}ms, 后台模式: ${runInBackground}${autoBackground ? ' (自动检测)' : ''}`);

        try {
            // 获取或创建终端
            const manager = TerminalManager.getInstance();
            const terminal = manager.getOrCreateTerminal(terminalName, workingDir);

            // 显示终端面板
            terminal.show();

            // 后台运行模式：直接发送命令并立即返回
            if (runInBackground) {
                logService.info(`[BashTerminalTool] 后台运行模式，发送命令后立即返回`);

                // 先切换目录
                terminal.sendText(`cd "${workingDir}"`);
                // 发送命令
                terminal.sendText(command);

                const duration = Date.now() - startTime;
                const autoMsg = autoBackground ? '（自动检测为服务类命令）' : '';
                const formattedOutput = [
                    `🚀 命令已启动 (后台模式)`,
                    ``,
                    `📋 命令: ${command.length > 100 ? command.slice(0, 100) + '...' : command}`,
                    `📂 工作目录: ${workingDir}`,
                    `🖥️ 终端: ${terminal.name}`,
                    autoBackground ? `🔍 自动检测: 服务类命令，已自动切换为后台模式` : '',
                    ``,
                    `💡 提示:`,
                    `  - 请查看终端面板查看命令执行情况`,
                    `  - 使用 Ctrl+C 可以停止命令执行`,
                ].filter(Boolean).join('\n');

                return successResult({
                    output: formattedOutput,
                    exitCode: 0,
                    timedOut: false,
                    shellIntegrationAvailable: false,
                }, { duration });
            }

            // 等待 Shell Integration 可用（最多等待 5 秒）
            logService.info(`[BashTerminalTool] 等待 Shell Integration...`);
            const shellIntegration = await waitForShellIntegration(terminal, 5000);

            let result: { output: string; exitCode: number; timedOut?: boolean };
            let shellIntegrationAvailable = false;

            if (shellIntegration) {
                logService.info(`[BashTerminalTool] Shell Integration 可用，使用 executeCommand API`);
                shellIntegrationAvailable = true;

                // 如果需要切换目录
                const currentCwd = shellIntegration.cwd?.fsPath;
                if (currentCwd !== workingDir) {
                    logService.info(`[BashTerminalTool] 切换工作目录: ${workingDir}`);
                    await executeWithShellIntegration(terminal, shellIntegration, `cd "${workingDir}"`, 5000, logService);
                }

                // 执行实际命令
                result = await executeWithShellIntegration(terminal, shellIntegration, command, timeout, logService);
            } else {
                // 回退方案：传统方式执行
                logService.warn(`[BashTerminalTool] Shell Integration 不可用，使用回退方案`);

                // 先切换目录
                terminal.sendText(`cd "${workingDir}"`);

                result = await executeWithFallback(terminal, command, logService);
            }

            const duration = Date.now() - startTime;
            logService.info(`[BashTerminalTool] 命令完成，退出码: ${result.exitCode}，耗时: ${duration}ms`);

            // 构建友好的输出消息
            const exitCode = result.exitCode;
            const durationSec = (duration / 1000).toFixed(2);
            const statusEmoji = exitCode === 0 ? '✅' : '❌';
            const statusText = exitCode === 0 ? '成功' : '失败';

            // 格式化输出，添加完成提示
            const formattedOutput = [
                `${statusEmoji} 命令执行${statusText}`,
                ``,
                `📋 命令: ${command.length > 100 ? command.slice(0, 100) + '...' : command}`,
                `⏱️ 耗时: ${durationSec}s`,
                `🔢 退出码: ${exitCode}`,
                result.timedOut ? `⚠️ 注意: 命令执行超时` : '',
                ``,
                `📤 输出:`,
                `${'─'.repeat(40)}`,
                result.output || '(无输出)',
                `${'─'.repeat(40)}`,
            ].filter(Boolean).join('\n');

            return successResult({
                output: formattedOutput,
                exitCode: result.exitCode,
                timedOut: result.timedOut ?? false,
                shellIntegrationAvailable,
            }, { duration });

        } catch (error: any) {
            logService.error(`[BashTerminalTool] 执行命令失败`, error);
            return errorResultFromError(error, '在终端执行命令失败');
        }
    }
}
