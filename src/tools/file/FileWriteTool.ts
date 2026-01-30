/**
 * FileWriteTool - 文件写入工具
 *
 * 功能：
 * - 创建或覆盖文件
 * - 自动创建父目录
 * - 支持 UTF-8 编码
 * - 支持撤回（保存快照）
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import {
    ITool,
    ToolContext,
    ToolResult,
    JSONSchema,
    successResult,
    errorResult,
    errorResultFromError,
} from '../types';
import { FileSnapshotService } from '../../services/FileSnapshotService';

/**
 * 文件写入输入参数
 */
export interface FileWriteInput {
    /** 文件路径（绝对或相对于 cwd） */
    file_path: string;
    /** 文件内容 */
    content: string;
    /** 是否自动创建父目录（默认 true） */
    create_dirs?: boolean;
}

/**
 * 文件写入输出
 */
export interface FileWriteOutput {
    /** 写入的文件路径（绝对） */
    path: string;
    /** 写入的字节数 */
    bytesWritten: number;
    /** 是否为新创建的文件 */
    created: boolean;
    /** 快照 ID（用于撤回） */
    snapshotId?: string;
    /** 是否支持撤回 */
    canRevert?: boolean;
}

/**
 * FileWriteTool 实现
 */
export class FileWriteTool implements ITool<FileWriteInput, FileWriteOutput> {
    readonly name = 'file_write';

    readonly description = `Write content to a file. Creates the file if it doesn't exist, or overwrites if it does. Parent directories are created automatically by default.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'The absolute path or relative path (to workspace) of the file to write.',
            },
            content: {
                type: 'string',
                description: 'The content to write to the file.',
            },
            create_dirs: {
                type: 'boolean',
                description: 'Whether to create parent directories if they do not exist. Defaults to true.',
                default: true,
            },
        },
        required: ['file_path', 'content'],
    };

    validate(input: FileWriteInput): string | undefined {
        if (!input.file_path || typeof input.file_path !== 'string') {
            return 'file_path 是必需参数';
        }
        if (input.content === undefined || input.content === null) {
            return 'content 是必需参数';
        }
        if (typeof input.content !== 'string') {
            return 'content 必须是字符串';
        }
        return undefined;
    }

    async execute(input: FileWriteInput, context: ToolContext): Promise<ToolResult<FileWriteOutput>> {
        const startTime = Date.now();
        const { file_path, content, create_dirs = true } = input;
        const { cwd, logService, metadata } = context;
        const toolUseId = metadata?.toolUseId as string | undefined;

        try {
            // 1. 解析文件路径
            const absolutePath = this.resolvePath(file_path, cwd);
            logService.info(`[FileWriteTool] 写入文件: ${absolutePath}`);

            // 2. 创建快照（用于撤回）
            let snapshotCreated = false;
            if (toolUseId) {
                const snapshotService = FileSnapshotService.getInstance(logService);
                snapshotCreated = await snapshotService.createSnapshot(toolUseId, absolutePath, 'write');
                logService.info(`[FileWriteTool] 快照创建${snapshotCreated ? '成功' : '失败'}: ${toolUseId}`);
            }

            // 3. 检查文件是否存在
            let fileExists = false;
            try {
                const stat = await fs.stat(absolutePath);
                if (stat.isDirectory()) {
                    return errorResult(`"${file_path}" 是目录，无法写入`);
                }
                fileExists = true;
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw e;
                }
            }

            // 4. 创建父目录（如果需要）
            if (create_dirs) {
                const dir = path.dirname(absolutePath);
                await fs.mkdir(dir, { recursive: true });
            }

            // 5. 写入文件
            const buffer = Buffer.from(content, 'utf-8');
            await fs.writeFile(absolutePath, buffer);

            const duration = Date.now() - startTime;
            logService.info(`[FileWriteTool] 完成，写入 ${buffer.length} 字节，耗时 ${duration}ms`);

            return successResult({
                path: absolutePath,
                bytesWritten: buffer.length,
                created: !fileExists,
                snapshotId: snapshotCreated ? toolUseId : undefined,
                canRevert: snapshotCreated,
            }, { duration });

        } catch (error) {
            return errorResultFromError(error, '写入文件失败');
        }
    }

    /**
     * 解析文件路径
     */
    private resolvePath(filePath: string, cwd: string): string {
        // 展开 ~
        if (filePath.startsWith('~')) {
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            filePath = path.join(homeDir, filePath.slice(1));
        }

        // 转为绝对路径
        if (path.isAbsolute(filePath)) {
            return path.normalize(filePath);
        }

        return path.normalize(path.join(cwd, filePath));
    }
}
