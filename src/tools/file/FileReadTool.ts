/**
 * FileReadTool - 文件读取工具
 *
 * 功能：
 * - 读取文件内容
 * - 支持行范围读取（offset + limit）
 * - 自动检测编码
 * - 大文件截断保护
 */

import * as vscode from 'vscode';
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

/**
 * 文件读取输入参数
 */
export interface FileReadInput {
    /** 文件路径（绝对或相对于 cwd） */
    file_path: string;
    /** 起始行号（1-based，可选） */
    offset?: number;
    /** 最大读取行数（可选） */
    limit?: number;
}

/**
 * 文件读取输出
 */
export interface FileReadOutput {
    /** 文件内容 */
    content: string;
    /** 文件总行数 */
    totalLines: number;
    /** 是否被截断 */
    truncated: boolean;
    /** 读取的行范围 */
    lineRange?: {
        start: number;
        end: number;
    };
}

/**
 * 最大读取行数
 */
const MAX_LINES = 2000;

/**
 * 最大文件大小（10MB）
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * FileReadTool 实现
 */
export class FileReadTool implements ITool<FileReadInput, FileReadOutput> {
    readonly name = 'file_read';

    readonly description = `Read the contents of a file. Line numbers are 1-indexed. Returns file content with line information. Use offset and limit for large files.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'The absolute path or relative path (to workspace) of the file to read.',
            },
            offset: {
                type: 'number',
                description: 'The 1-based line number to start reading from. Optional.',
            },
            limit: {
                type: 'number',
                description: 'The maximum number of lines to read. Optional, defaults to 2000.',
            },
        },
        required: ['file_path'],
    };

    validate(input: FileReadInput): string | undefined {
        if (!input.file_path || typeof input.file_path !== 'string') {
            return 'file_path 是必需参数';
        }
        if (input.offset !== undefined && (typeof input.offset !== 'number' || input.offset < 0)) {
            return 'offset 必须是非负数';
        }
        if (input.limit !== undefined && (typeof input.limit !== 'number' || input.limit < 1)) {
            return 'limit 必须是大于 0 的数字';
        }
        return undefined;
    }

    async execute(input: FileReadInput, context: ToolContext): Promise<ToolResult<FileReadOutput>> {
        const startTime = Date.now();
        // 兼容处理：如果传入 0，视为 1（行号从 1 开始）
        const { file_path, offset: rawOffset = 1, limit = MAX_LINES } = input;
        const offset = rawOffset < 1 ? 1 : rawOffset;
        const { cwd, logService } = context;

        try {
            // 1. 解析文件路径
            const absolutePath = this.resolvePath(file_path, cwd);
            logService.info(`[FileReadTool] 读取文件: ${absolutePath}`);

            // 2. 检查文件是否存在
            try {
                const stat = await fs.stat(absolutePath);

                if (stat.isDirectory()) {
                    return errorResult(`"${file_path}" 是目录，不是文件`);
                }

                // 检查文件大小
                if (stat.size > MAX_FILE_SIZE) {
                    return errorResult(
                        `文件过大 (${(stat.size / 1024 / 1024).toFixed(2)}MB)，超过限制 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
                        { suggestion: '请使用 offset 和 limit 参数分块读取' }
                    );
                }
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                    return errorResult(`文件不存在: ${file_path}`);
                }
                throw e;
            }

            // 3. 读取文件内容
            const content = await fs.readFile(absolutePath, 'utf-8');
            const lines = content.split('\n');
            const totalLines = lines.length;

            // 4. 计算行范围
            const startLine = Math.max(1, offset);
            const endLine = Math.min(totalLines, startLine + limit - 1);
            const actualLimit = Math.min(limit, MAX_LINES);

            // 5. 提取指定行
            const selectedLines = lines.slice(startLine - 1, startLine - 1 + actualLimit);
            const truncated = endLine < totalLines || limit > MAX_LINES;

            // 6. 构建输出
            const output: FileReadOutput = {
                content: selectedLines.join('\n'),
                totalLines,
                truncated,
                lineRange: {
                    start: startLine,
                    end: Math.min(startLine + selectedLines.length - 1, totalLines),
                },
            };

            const duration = Date.now() - startTime;
            logService.info(`[FileReadTool] 完成，读取 ${selectedLines.length} 行，耗时 ${duration}ms`);

            return successResult(output, { duration, truncated });

        } catch (error) {
            return errorResultFromError(error, '读取文件失败');
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
