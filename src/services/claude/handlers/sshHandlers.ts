/**
 * SSH Handlers
 *
 * 处理 SSH 相关的请求
 */

import type { HandlerContext } from './types';

/**
 * SSH 连接请求
 */
export interface SSHConnectRequest {
    type: 'ssh_connect';
    host: string;
    port?: number;
    username?: string;
    identityFile?: string;
}

/**
 * SSH 命令请求
 */
export interface SSHCommandRequest {
    type: 'ssh_command';
    sessionId: string;
    command: string;
    timeout?: number;
}

/**
 * SSH 断开请求
 */
export interface SSHDisconnectRequest {
    type: 'ssh_disconnect';
    sessionId: string;
}

/**
 * SSH 获取输出请求
 */
export interface SSHGetOutputRequest {
    type: 'ssh_get_output';
    sessionId: string;
}

/**
 * SSH 列出会话请求
 */
export interface SSHListSessionsRequest {
    type: 'ssh_list_sessions';
}

/**
 * 处理 SSH 连接
 */
export async function handleSSHConnect(
    request: SSHConnectRequest,
    context: HandlerContext
): Promise<{ sessionId: string } | { error: string }> {
    const { sshService, logService } = context;

    try {
        logService.info(`[SSHHandler] 连接到 ${request.username || ''}@${request.host}`);

        const sessionId = await sshService.connect({
            host: request.host,
            port: request.port,
            username: request.username,
            identityFile: request.identityFile
        });

        return { sessionId };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logService.error(`[SSHHandler] 连接失败: ${message}`);
        return { error: message };
    }
}

/**
 * 处理 SSH 命令执行
 */
export async function handleSSHCommand(
    request: SSHCommandRequest,
    context: HandlerContext
): Promise<{ success: boolean; output: string; error?: string }> {
    const { sshService, logService } = context;

    try {
        logService.info(`[SSHHandler] 执行命令: ${request.command}`);

        const result = await sshService.executeCommand(
            request.sessionId,
            request.command,
            request.timeout
        );

        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logService.error(`[SSHHandler] 命令执行失败: ${message}`);
        return { success: false, output: '', error: message };
    }
}

/**
 * 处理 SSH 断开连接
 */
export async function handleSSHDisconnect(
    request: SSHDisconnectRequest,
    context: HandlerContext
): Promise<{ success: boolean }> {
    const { sshService, logService } = context;

    try {
        logService.info(`[SSHHandler] 断开连接: ${request.sessionId}`);

        await sshService.disconnect(request.sessionId);

        return { success: true };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logService.error(`[SSHHandler] 断开失败: ${message}`);
        return { success: false };
    }
}

/**
 * 处理获取 SSH 输出
 */
export function handleSSHGetOutput(
    request: SSHGetOutputRequest,
    context: HandlerContext
): { output: string } {
    const { sshService } = context;

    const output = sshService.getOutput(request.sessionId);
    return { output };
}

/**
 * 处理列出 SSH 会话
 */
export function handleSSHListSessions(
    _request: SSHListSessionsRequest,
    context: HandlerContext
): { sessions: Array<{ id: string; host: string; isConnected: boolean }> } {
    const { sshService } = context;

    const sessions = sshService.getActiveSessions().map(s => ({
        id: s.id,
        host: s.config.host,
        isConnected: s.isConnected
    }));

    return { sessions };
}
