/**
 * SSH 服务 / SSH Service
 *
 * 提供 SSH 连接管理和命令执行功能
 * 支持 AI 通过 SSH 与远程服务器交互
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { createDecorator } from '../di/instantiation';
import { ILogService } from './logService';

export const ISSHService = createDecorator<ISSHService>('sshService');

/**
 * SSH 连接配置
 */
export interface SSHConnectionConfig {
    host: string;
    port?: number;
    username?: string;
    identityFile?: string;  // SSH 私钥路径
}

/**
 * SSH 会话
 */
export interface SSHSession {
    id: string;
    config: SSHConnectionConfig;
    process: ChildProcess;
    terminal?: vscode.Terminal;
    outputBuffer: string;
    isConnected: boolean;
    lastActivity: number;
}

/**
 * SSH 命令执行结果
 */
export interface SSHCommandResult {
    success: boolean;
    output: string;
    error?: string;
}

export interface ISSHService {
    readonly _serviceBrand: undefined;

    /**
     * 创建 SSH 连接
     */
    connect(config: SSHConnectionConfig): Promise<string>;

    /**
     * 断开 SSH 连接
     */
    disconnect(sessionId: string): Promise<void>;

    /**
     * 执行 SSH 命令
     */
    executeCommand(sessionId: string, command: string, timeout?: number): Promise<SSHCommandResult>;

    /**
     * 获取会话输出缓冲区
     */
    getOutput(sessionId: string): string;

    /**
     * 清空输出缓冲区
     */
    clearOutput(sessionId: string): void;

    /**
     * 获取所有活跃会话
     */
    getActiveSessions(): SSHSession[];

    /**
     * 检查会话是否存在
     */
    hasSession(sessionId: string): boolean;

    /**
     * 关闭所有会话
     */
    closeAll(): Promise<void>;
}

export class SSHService implements ISSHService {
    readonly _serviceBrand: undefined;

    private sessions = new Map<string, SSHSession>();
    private sessionCounter = 0;

    constructor(
        @ILogService private readonly logService: ILogService
    ) {}

    /**
     * 创建 SSH 连接
     */
    async connect(config: SSHConnectionConfig): Promise<string> {
        const sessionId = `ssh-${++this.sessionCounter}`;

        this.logService.info(`[SSHService] 创建 SSH 连接: ${config.username || 'default'}@${config.host}`);

        // 构建 SSH 命令参数
        const args = this.buildSSHArgs(config);

        // 启动 SSH 进程
        const sshProcess = spawn('ssh', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: {
                ...process.env,
                // 禁用 SSH 的严格主机密钥检查（可选，生产环境应该移除）
                // SSH_ASKPASS: '',
            }
        });

        const session: SSHSession = {
            id: sessionId,
            config,
            process: sshProcess,
            outputBuffer: '',
            isConnected: false,
            lastActivity: Date.now()
        };

        // 监听输出
        sshProcess.stdout?.on('data', (data: Buffer) => {
            const text = data.toString();
            session.outputBuffer += text;
            session.lastActivity = Date.now();
            session.isConnected = true;
            this.logService.info(`[SSH ${sessionId}] stdout: ${text.substring(0, 100)}...`);
        });

        sshProcess.stderr?.on('data', (data: Buffer) => {
            const text = data.toString();
            session.outputBuffer += `[stderr] ${text}`;
            session.lastActivity = Date.now();
            this.logService.warn(`[SSH ${sessionId}] stderr: ${text}`);
        });

        sshProcess.on('close', (code) => {
            session.isConnected = false;
            this.logService.info(`[SSH ${sessionId}] 连接关闭，退出码: ${code}`);
        });

        sshProcess.on('error', (err) => {
            session.isConnected = false;
            session.outputBuffer += `[error] ${err.message}\n`;
            this.logService.error(`[SSH ${sessionId}] 错误: ${err.message}`);
        });

        this.sessions.set(sessionId, session);

        // 等待连接建立（检测到输出或超时）
        await this.waitForConnection(session, 10000);

        return sessionId;
    }

    /**
     * 断开 SSH 连接
     */
    async disconnect(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            this.logService.warn(`[SSHService] 会话不存在: ${sessionId}`);
            return;
        }

        this.logService.info(`[SSHService] 断开连接: ${sessionId}`);

        // 发送 exit 命令
        session.process.stdin?.write('exit\n');

        // 等待进程退出
        await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
                session.process.kill('SIGTERM');
                resolve();
            }, 3000);

            session.process.on('close', () => {
                clearTimeout(timeout);
                resolve();
            });
        });

        this.sessions.delete(sessionId);
    }

    /**
     * 执行 SSH 命令
     */
    async executeCommand(sessionId: string, command: string, timeout = 30000): Promise<SSHCommandResult> {
        const session = this.sessions.get(sessionId);
        if (!session) {
            return {
                success: false,
                output: '',
                error: `会话不存在: ${sessionId}`
            };
        }

        if (!session.isConnected) {
            return {
                success: false,
                output: '',
                error: '连接已断开'
            };
        }

        this.logService.info(`[SSH ${sessionId}] 执行命令: ${command}`);

        // 清空之前的输出
        const outputBefore = session.outputBuffer.length;

        // 添加命令结束标记，方便检测命令完成
        const endMarker = `__CMD_END_${Date.now()}__`;
        const fullCommand = `${command}; echo "${endMarker}"\n`;

        // 发送命令
        session.process.stdin?.write(fullCommand);

        // 等待命令完成
        const result = await this.waitForCommandComplete(session, endMarker, timeout, outputBefore);

        return result;
    }

    /**
     * 获取会话输出缓冲区
     */
    getOutput(sessionId: string): string {
        const session = this.sessions.get(sessionId);
        return session?.outputBuffer || '';
    }

    /**
     * 清空输出缓冲区
     */
    clearOutput(sessionId: string): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.outputBuffer = '';
        }
    }

    /**
     * 获取所有活跃会话
     */
    getActiveSessions(): SSHSession[] {
        return Array.from(this.sessions.values()).filter(s => s.isConnected);
    }

    /**
     * 检查会话是否存在
     */
    hasSession(sessionId: string): boolean {
        return this.sessions.has(sessionId);
    }

    /**
     * 关闭所有会话
     */
    async closeAll(): Promise<void> {
        const promises = Array.from(this.sessions.keys()).map(id => this.disconnect(id));
        await Promise.all(promises);
    }

    // ===== 私有方法 =====

    /**
     * 构建 SSH 命令参数
     */
    private buildSSHArgs(config: SSHConnectionConfig): string[] {
        const args: string[] = [];

        // 端口
        if (config.port && config.port !== 22) {
            args.push('-p', config.port.toString());
        }

        // 私钥
        if (config.identityFile) {
            args.push('-i', config.identityFile);
        }

        // 禁用伪终端分配的严格检查
        args.push('-o', 'StrictHostKeyChecking=accept-new');
        args.push('-o', 'BatchMode=no');

        // 保持连接
        args.push('-o', 'ServerAliveInterval=60');
        args.push('-o', 'ServerAliveCountMax=3');

        // 强制分配伪终端（交互式）
        args.push('-tt');

        // 目标
        const target = config.username
            ? `${config.username}@${config.host}`
            : config.host;
        args.push(target);

        return args;
    }

    /**
     * 等待连接建立
     */
    private waitForConnection(session: SSHSession, timeout: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();

            const checkConnection = () => {
                // 检查是否有输出（表示连接成功）
                if (session.outputBuffer.length > 0 || session.isConnected) {
                    resolve();
                    return;
                }

                // 检查超时
                if (Date.now() - startTime > timeout) {
                    reject(new Error('SSH 连接超时'));
                    return;
                }

                // 继续等待
                setTimeout(checkConnection, 100);
            };

            checkConnection();
        });
    }

    /**
     * 等待命令完成
     */
    private waitForCommandComplete(
        session: SSHSession,
        endMarker: string,
        timeout: number,
        outputBefore: number
    ): Promise<SSHCommandResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const checkComplete = () => {
                const newOutput = session.outputBuffer.substring(outputBefore);

                // 检查是否包含结束标记
                if (newOutput.includes(endMarker)) {
                    // 移除结束标记
                    const cleanOutput = newOutput
                        .replace(new RegExp(`echo "${endMarker}"\\n?`, 'g'), '')
                        .replace(new RegExp(`${endMarker}\\n?`, 'g'), '')
                        .trim();

                    resolve({
                        success: true,
                        output: cleanOutput
                    });
                    return;
                }

                // 检查连接是否断开
                if (!session.isConnected) {
                    resolve({
                        success: false,
                        output: newOutput,
                        error: '连接已断开'
                    });
                    return;
                }

                // 检查超时
                if (Date.now() - startTime > timeout) {
                    resolve({
                        success: false,
                        output: newOutput,
                        error: '命令执行超时'
                    });
                    return;
                }

                // 继续等待
                setTimeout(checkComplete, 100);
            };

            checkComplete();
        });
    }
}
