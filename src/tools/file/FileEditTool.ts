/**
 * FileEditTool - 文件编辑工具
 *
 * 功能：
 * - 基于字符串替换的文件编辑
 * - 支持精确匹配替换
 * - 保留文件原有格式
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
 * 文件编辑输入参数
 */
export interface FileEditInput {
    /** 文件路径（绝对或相对于 cwd） */
    file_path: string;
    /** 要替换的原始文本（必须精确匹配） */
    old_string: string;
    /** 新文本 */
    new_string: string;
}

/**
 * 文件编辑输出
 */
export interface FileEditOutput {
    /** 编辑后的文件路径 */
    path: string;
    /** 替换次数 */
    replacements: number;
    /** 编辑的行范围 */
    affectedLines?: {
        start: number;
        end: number;
    };
    /** 快照 ID（用于撤回） */
    snapshotId?: string;
    /** 是否支持撤回 */
    canRevert?: boolean;
}

/**
 * FileEditTool 实现
 */
export class FileEditTool implements ITool<FileEditInput, FileEditOutput> {
    readonly name = 'file_edit';

    readonly description = `Edit a file by replacing exact text matches. The old_string must match exactly (including whitespace and indentation). For safety, include 2-3 lines of context before and after the target text to ensure unique matching.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            file_path: {
                type: 'string',
                description: 'The absolute path or relative path (to workspace) of the file to edit.',
            },
            old_string: {
                type: 'string',
                description: 'The exact text to find and replace. Must match exactly including whitespace. Include context lines if needed for unique matching.',
            },
            new_string: {
                type: 'string',
                description: 'The new text to replace the old_string with.',
            },
        },
        required: ['file_path', 'old_string', 'new_string'],
    };

    validate(input: FileEditInput): string | undefined {
        if (!input.file_path || typeof input.file_path !== 'string') {
            return 'file_path 是必需参数';
        }
        if (input.old_string === undefined || input.old_string === null) {
            return 'old_string 是必需参数';
        }
        if (input.new_string === undefined || input.new_string === null) {
            return 'new_string 是必需参数';
        }
        if (input.old_string === '') {
            return 'old_string 不能为空';
        }
        return undefined;
    }

    async execute(input: FileEditInput, context: ToolContext): Promise<ToolResult<FileEditOutput>> {
        const startTime = Date.now();
        const { file_path, old_string, new_string } = input;
        const { cwd, logService, metadata } = context;
        const toolUseId = metadata?.toolUseId as string | undefined;

        try {
            // 1. 解析文件路径
            const absolutePath = this.resolvePath(file_path, cwd);
            logService.info(`[FileEditTool] 编辑文件: ${absolutePath}`);

            // 2. 读取文件
            let content: string;
            try {
                content = await fs.readFile(absolutePath, 'utf-8');
            } catch (e) {
                if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
                    return errorResult(`文件不存在: ${file_path}`);
                }
                throw e;
            }

            // 3. 查找匹配
            const matchIndex = content.indexOf(old_string);
            if (matchIndex === -1) {
                // 提供有用的错误信息
                const suggestion = this.getSuggestion(content, old_string);
                return errorResult(
                    `未找到匹配的文本`,
                    {
                        suggestion,
                        code: 'NO_MATCH',
                    }
                );
            }

            // 4. 检查是否有多个匹配
            const secondMatch = content.indexOf(old_string, matchIndex + 1);
            if (secondMatch !== -1) {
                const matchCount = this.countMatches(content, old_string);
                return errorResult(
                    `找到 ${matchCount} 处匹配，请提供更多上下文以确保唯一匹配`,
                    {
                        code: 'MULTIPLE_MATCHES',
                        suggestion: '在 old_string 中包含更多前后文行以确保唯一性',
                    }
                );
            }

            // 5. 创建快照（用于撤回）- 在确认要修改后再创建
            let snapshotCreated = false;
            if (toolUseId) {
                const snapshotService = FileSnapshotService.getInstance(logService);
                snapshotCreated = await snapshotService.createSnapshot(toolUseId, absolutePath, 'edit');
                logService.info(`[FileEditTool] 快照创建${snapshotCreated ? '成功' : '失败'}: ${toolUseId}`);
            }

            // 6. 执行替换
            const newContent = content.substring(0, matchIndex) +
                new_string +
                content.substring(matchIndex + old_string.length);

            // 7. 计算受影响的行
            const affectedLines = this.getAffectedLines(content, matchIndex, old_string.length);

            // 8. 写入文件
            await fs.writeFile(absolutePath, newContent, 'utf-8');

            const duration = Date.now() - startTime;
            logService.info(`[FileEditTool] 完成，替换 1 处，耗时 ${duration}ms`);

            return successResult({
                path: absolutePath,
                replacements: 1,
                affectedLines,
                snapshotId: snapshotCreated ? toolUseId : undefined,
                canRevert: snapshotCreated,
            }, { duration });

        } catch (error) {
            return errorResultFromError(error, '编辑文件失败');
        }
    }

    /**
     * 解析文件路径
     */
    private resolvePath(filePath: string, cwd: string): string {
        if (filePath.startsWith('~')) {
            const homeDir = process.env.HOME || process.env.USERPROFILE || '';
            filePath = path.join(homeDir, filePath.slice(1));
        }

        if (path.isAbsolute(filePath)) {
            return path.normalize(filePath);
        }

        return path.normalize(path.join(cwd, filePath));
    }

    /**
     * 计算匹配次数
     */
    private countMatches(content: string, search: string): number {
        let count = 0;
        let pos = 0;
        while ((pos = content.indexOf(search, pos)) !== -1) {
            count++;
            pos += 1;
        }
        return count;
    }

    /**
     * 获取受影响的行范围
     */
    private getAffectedLines(content: string, startIndex: number, length: number): { start: number; end: number } {
        const beforeMatch = content.substring(0, startIndex);
        const startLine = (beforeMatch.match(/\n/g) || []).length + 1;

        const matchContent = content.substring(startIndex, startIndex + length);
        const linesInMatch = (matchContent.match(/\n/g) || []).length;
        const endLine = startLine + linesInMatch;

        return { start: startLine, end: endLine };
    }

    /**
     * 生成修复建议
     */
    private getSuggestion(content: string, search: string): string {
        // 尝试找相似的文本
        const searchLines = search.split('\n');
        const firstLine = searchLines[0].trim();

        if (firstLine.length > 10) {
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes(firstLine.substring(0, 20))) {
                    return `可能在第 ${i + 1} 行找到类似文本，请检查空白字符和缩进是否完全匹配`;
                }
            }
        }

        return '请确保 old_string 与文件中的文本完全匹配（包括空格、制表符和换行符）';
    }
}
