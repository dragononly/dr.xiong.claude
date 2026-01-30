/**
 * GlobSearchTool - 文件名搜索工具
 *
 * 功能：
 * - 使用 glob 模式搜索文件
 * - 支持模糊匹配
 * - 返回文件和目录列表
 */

import * as vscode from 'vscode';
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
 * Glob 搜索输入参数
 */
export interface GlobSearchInput {
    /** 搜索模式（支持 glob 和模糊匹配） */
    pattern: string;
    /** 搜索路径（可选，默认工作区根目录） */
    path?: string;
}

/**
 * 搜索结果项
 */
export interface SearchResultItem {
    /** 相对路径 */
    path: string;
    /** 文件/目录名 */
    name: string;
    /** 类型 */
    type: 'file' | 'directory';
}

/**
 * Glob 搜索输出
 */
export interface GlobSearchOutput {
    /** 搜索结果 */
    results: SearchResultItem[];
    /** 结果总数 */
    totalCount: number;
    /** 是否被截断 */
    truncated: boolean;
}

/**
 * 最大结果数
 */
const MAX_RESULTS = 100;

/**
 * GlobSearchTool 实现
 */
export class GlobSearchTool implements ITool<GlobSearchInput, GlobSearchOutput> {
    readonly name = 'glob_search';

    readonly description = `Search for files and directories by name pattern. Supports glob patterns (e.g., "**/*.ts") and fuzzy matching. Returns paths relative to workspace.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'The search pattern. Can be a glob pattern (e.g., "**/*.ts", "src/**") or a filename for fuzzy matching.',
            },
            path: {
                type: 'string',
                description: 'Optional subdirectory to search within. Defaults to workspace root.',
            },
        },
        required: ['pattern'],
    };

    validate(input: GlobSearchInput): string | undefined {
        if (!input.pattern || typeof input.pattern !== 'string') {
            return 'pattern 是必需参数';
        }
        return undefined;
    }

    async execute(input: GlobSearchInput, context: ToolContext): Promise<ToolResult<GlobSearchOutput>> {
        const startTime = Date.now();
        const { pattern, path: searchPath } = input;
        const { cwd, logService } = context;

        try {
            logService.info(`[GlobSearchTool] 搜索: "${pattern}" in ${searchPath || cwd}`);

            // 构建搜索 pattern
            let searchPattern = pattern;

            // 如果不是 glob 模式，转为模糊匹配
            if (!pattern.includes('*') && !pattern.includes('?')) {
                searchPattern = `**/*${pattern}*`;
            }

            // 如果指定了子路径
            if (searchPath) {
                const basePath = path.isAbsolute(searchPath)
                    ? path.relative(cwd, searchPath)
                    : searchPath;
                if (!searchPattern.startsWith(basePath)) {
                    searchPattern = path.join(basePath, searchPattern);
                }
            }

            // 构建排除模式
            const excludePattern = this.buildExcludePattern();

            // 使用 VSCode API 搜索
            const uris = await vscode.workspace.findFiles(
                searchPattern,
                excludePattern,
                MAX_RESULTS + 1  // 多取一个用于判断是否截断
            );

            const truncated = uris.length > MAX_RESULTS;
            const resultUris = uris.slice(0, MAX_RESULTS);

            // 转换结果
            const results: SearchResultItem[] = resultUris.map(uri => {
                const relativePath = path.relative(cwd, uri.fsPath);
                return {
                    path: relativePath,
                    name: path.basename(uri.fsPath),
                    type: 'file' as const,
                };
            });

            // 按路径排序
            results.sort((a, b) => a.path.localeCompare(b.path));

            const duration = Date.now() - startTime;
            logService.info(`[GlobSearchTool] 找到 ${results.length} 个结果，耗时 ${duration}ms`);

            return successResult({
                results,
                totalCount: results.length,
                truncated,
            }, { duration, truncated });

        } catch (error) {
            return errorResultFromError(error, '搜索失败');
        }
    }

    /**
     * 构建排除模式
     */
    private buildExcludePattern(): string {
        const patterns = [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/build/**',
            '**/.next/**',
            '**/.nuxt/**',
            '**/.DS_Store',
        ];
        return `{${patterns.join(',')}}`;
    }
}
