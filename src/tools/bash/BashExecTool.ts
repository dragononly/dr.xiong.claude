/**
 * BashExecTool - 终端命令执行工具
 *
 * 功能：
 * - 执行 shell 命令
 * - 支持超时控制
 * - 捕获 stdout/stderr
 * - 支持后台执行
 */

import { spawn, exec } from 'child_process';
import * as path from 'path';
import {
    ITool,
    ToolContext,
    ToolResult,
    JSONSchema,
    successResult,
    errorResult,
    errorResultFromError,
} from '../types';

/**
 * Bash 执行输入参数
 */
export interface BashExecInput {
    /** 要执行的命令 */
    command: string;
    /** 超时时间（毫秒），默认 120000 (2分钟) */
    timeout?: number;
    /** 工作目录（可选，默认使用 context.cwd） */
    cwd?: string;
    /** 是否在后台运行（默认 false） */
    run_in_background?: boolean;
    /** 命令描述（可选，用于日志） */
    description?: string;
}

/**
 * Bash 执行输出
 */
export interface BashExecOutput {
    /** 标准输出 */
    stdout: string;
    /** 标准错误 */
    stderr: string;
    /** 退出码 */
    exitCode: number;
    /** 后台进程 ID（仅当 run_in_background=true） */
    bash_id?: string;
    /** 是否超时 */
    timedOut?: boolean;
}

/**
 * 后台进程管理器
 */
class BackgroundProcessManager {
    private static instance: BackgroundProcessManager;
    private processes = new Map<string, {
        stdout: string[];
        stderr: string[];
        exitCode: number | null;
        startTime: number;
    }>();

    private constructor() { }

    static getInstance(): BackgroundProcessManager {
        if (!BackgroundProcessManager.instance) {
            BackgroundProcessManager.instance = new BackgroundProcessManager();
        }
        return BackgroundProcessManager.instance;
    }

    register(id: string): void {
        this.processes.set(id, {
            stdout: [],
            stderr: [],
            exitCode: null,
            startTime: Date.now(),
        });
    }

    appendStdout(id: string, data: string): void {
        const proc = this.processes.get(id);
        if (proc) {
            proc.stdout.push(data);
        }
    }

    appendStderr(id: string, data: string): void {
        const proc = this.processes.get(id);
        if (proc) {
            proc.stderr.push(data);
        }
    }

    setExitCode(id: string, code: number): void {
        const proc = this.processes.get(id);
        if (proc) {
            proc.exitCode = code;
        }
    }

    getOutput(id: string): { stdout: string; stderr: string; exitCode: number | null; running: boolean } | null {
        const proc = this.processes.get(id);
        if (!proc) {
            return null;
        }
        return {
            stdout: proc.stdout.join(''),
            stderr: proc.stderr.join(''),
            exitCode: proc.exitCode,
            running: proc.exitCode === null,
        };
    }

    cleanup(id: string): void {
        this.processes.delete(id);
    }
}

/**
 * 默认超时时间（2分钟）
 */
const DEFAULT_TIMEOUT = 120000;

/**
 * 最大超时时间（10分钟）
 */
const MAX_TIMEOUT = 600000;

/**
 * 最大输出大小（1MB）
 */
const MAX_OUTPUT_SIZE = 1024 * 1024;

/**
 * BashExecTool 实现
 */
export class BashExecTool implements ITool<BashExecInput, BashExecOutput> {
    readonly name = 'bash_exec';

    readonly description = `Execute a shell command. Captures stdout and stderr. Supports timeout control and background execution. Use run_in_background=true for long-running processes.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                description: 'The shell command to execute.',
            },
            timeout: {
                type: 'number',
                description: 'Timeout in milliseconds. Default is 120000 (2 minutes). Max is 600000 (10 minutes).',
            },
            cwd: {
                type: 'string',
                description: 'Working directory for the command. Defaults to workspace root.',
            },
            run_in_background: {
                type: 'boolean',
                description: 'If true, run the command in background and return immediately with a bash_id.',
            },
            description: {
                type: 'string',
                description: 'A short description of what this command does (for logging).',
            },
        },
        required: ['command'],
    };

    validate(input: BashExecInput): string | undefined {
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

    async execute(input: BashExecInput, context: ToolContext): Promise<ToolResult<BashExecOutput>> {
        const startTime = Date.now();
        const {
            command,
            timeout = DEFAULT_TIMEOUT,
            cwd: inputCwd,
            run_in_background = false,
            description,
        } = input;
        const { cwd: contextCwd, logService, abortSignal } = context;

        // 解析工作目录
        const workingDir = inputCwd
            ? (path.isAbsolute(inputCwd) ? inputCwd : path.join(contextCwd, inputCwd))
            : contextCwd;

        const logPrefix = description ? `[${description}]` : '';
        logService.info(`[BashExecTool] ${logPrefix} 执行命令: ${command.slice(0, 200)}${command.length > 200 ? '...' : ''}`);
        logService.info(`[BashExecTool] 工作目录: ${workingDir}`);

        if (run_in_background) {
            return this.executeBackground(command, workingDir, logService);
        }

        return this.executeForeground(command, workingDir, timeout, abortSignal, logService, startTime);
    }

    /**
     * 前台执行（等待完成）
     */
    private executeForeground(
        command: string,
        cwd: string,
        timeout: number,
        abortSignal: AbortSignal | undefined,
        logService: any,
        startTime: number
    ): Promise<ToolResult<BashExecOutput>> {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;
            let killed = false;

            const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
            const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

            const child = spawn(shell, shellArgs, {
                cwd,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            // 超时处理
            const timeoutId = setTimeout(() => {
                timedOut = true;
                killed = true;
                child.kill('SIGTERM');
                setTimeout(() => {
                    if (!child.killed) {
                        child.kill('SIGKILL');
                    }
                }, 1000);
            }, timeout);

            // 取消信号处理
            const abortHandler = () => {
                killed = true;
                child.kill('SIGTERM');
            };
            abortSignal?.addEventListener('abort', abortHandler);

            // 收集输出
            child.stdout?.on('data', (data) => {
                const chunk = data.toString();
                if (stdout.length + chunk.length <= MAX_OUTPUT_SIZE) {
                    stdout += chunk;
                }
            });

            child.stderr?.on('data', (data) => {
                const chunk = data.toString();
                if (stderr.length + chunk.length <= MAX_OUTPUT_SIZE) {
                    stderr += chunk;
                }
            });

            child.on('close', (code) => {
                clearTimeout(timeoutId);
                abortSignal?.removeEventListener('abort', abortHandler);

                const duration = Date.now() - startTime;
                const exitCode = code ?? (killed ? -1 : 0);

                logService.info(`[BashExecTool] 命令完成，退出码: ${exitCode}，耗时: ${duration}ms`);

                if (timedOut) {
                    resolve(successResult({
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        exitCode: -1,
                        timedOut: true,
                    }, { duration }));
                } else {
                    resolve(successResult({
                        stdout: stdout.trim(),
                        stderr: stderr.trim(),
                        exitCode,
                        timedOut: false,
                    }, { duration }));
                }
            });

            child.on('error', (error) => {
                clearTimeout(timeoutId);
                abortSignal?.removeEventListener('abort', abortHandler);

                resolve(errorResultFromError(error, '执行命令失败'));
            });
        });
    }

    /**
     * 后台执行
     */
    private executeBackground(
        command: string,
        cwd: string,
        logService: any
    ): Promise<ToolResult<BashExecOutput>> {
        return new Promise((resolve) => {
            const bashId = `bash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const manager = BackgroundProcessManager.getInstance();
            manager.register(bashId);

            const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/bash';
            const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

            const child = spawn(shell, shellArgs, {
                cwd,
                env: { ...process.env },
                stdio: ['ignore', 'pipe', 'pipe'],
                detached: true,
            });

            child.stdout?.on('data', (data) => {
                manager.appendStdout(bashId, data.toString());
            });

            child.stderr?.on('data', (data) => {
                manager.appendStderr(bashId, data.toString());
            });

            child.on('close', (code) => {
                manager.setExitCode(bashId, code ?? 0);
            });

            child.unref();

            logService.info(`[BashExecTool] 后台进程已启动，bash_id: ${bashId}`);

            resolve(successResult({
                stdout: '',
                stderr: '',
                exitCode: 0,
                bash_id: bashId,
            }));
        });
    }
}

/**
 * 导出后台进程管理器（供 BashOutputTool 使用）
 */
export { BackgroundProcessManager };
