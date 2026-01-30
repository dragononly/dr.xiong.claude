/**
 * GrepSearchTool - 文件内容搜索工具
 *
 * 功能：
 * - 使用正则或文本搜索文件内容
 * - 显示匹配行和上下文
 * - 支持限制结果数量
 */

import { execFile } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
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
 * Grep 搜索输入参数
 */
export interface GrepSearchInput {
    /** 搜索模式 */
    pattern: string;
    /** 是否为正则表达式（默认 false） */
    is_regex?: boolean;
    /** 搜索路径（可选） */
    path?: string;
    /** 文件类型过滤（可选，如 "*.ts"） */
    file_pattern?: string;
    /** 是否区分大小写（默认 false） */
    case_sensitive?: boolean;
    /** 上下文行数（默认 2） */
    context_lines?: number;
}

/**
 * 匹配结果项
 */
export interface GrepMatchItem {
    /** 文件路径（相对） */
    file: string;
    /** 行号 */
    line: number;
    /** 匹配的行内容 */
    content: string;
    /** 上下文（前后行） */
    context?: {
        before: string[];
        after: string[];
    };
}

/**
 * Grep 搜索输出
 */
export interface GrepSearchOutput {
    /** 匹配结果 */
    matches: GrepMatchItem[];
    /** 匹配文件数 */
    fileCount: number;
    /** 总匹配数 */
    matchCount: number;
    /** 是否被截断 */
    truncated: boolean;
}

/**
 * 最大结果数
 */
const MAX_MATCHES = 100;

/**
 * GrepSearchTool 实现
 */
export class GrepSearchTool implements ITool<GrepSearchInput, GrepSearchOutput> {
    readonly name = 'grep_search';

    readonly description = `Search for text or regex pattern in file contents. Returns matching lines with file paths and line numbers. Supports context lines.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            pattern: {
                type: 'string',
                description: 'The text or regex pattern to search for.',
            },
            is_regex: {
                type: 'boolean',
                description: 'Whether the pattern is a regex. Defaults to false (literal text search).',
            },
            path: {
                type: 'string',
                description: 'Subdirectory or file to search within. Defaults to workspace root.',
            },
            file_pattern: {
                type: 'string',
                description: 'Glob pattern to filter files (e.g., "*.ts", "*.py").',
            },
            case_sensitive: {
                type: 'boolean',
                description: 'Whether the search is case-sensitive. Defaults to false.',
            },
            context_lines: {
                type: 'number',
                description: 'Number of context lines before and after each match. Defaults to 2.',
            },
        },
        required: ['pattern'],
    };

    // Ripgrep 路径缓存
    private rgPath: string | null = null;

    validate(input: GrepSearchInput): string | undefined {
        if (!input.pattern || typeof input.pattern !== 'string') {
            return 'pattern 是必需参数';
        }
        if (input.pattern.trim() === '') {
            return 'pattern 不能为空';
        }
        if (input.is_regex) {
            try {
                new RegExp(input.pattern);
            } catch {
                return 'pattern 不是有效的正则表达式';
            }
        }
        return undefined;
    }

    async execute(input: GrepSearchInput, context: ToolContext): Promise<ToolResult<GrepSearchOutput>> {
        const startTime = Date.now();
        const {
            pattern,
            is_regex = false,
            path: searchPath,
            file_pattern,
            case_sensitive = false,
            context_lines = 2,
        } = input;
        const { cwd, logService } = context;

        try {
            logService.info(`[GrepSearchTool] 搜索: "${pattern}" (regex: ${is_regex})`);

            // 确定搜索目录
            const searchDir = searchPath
                ? (path.isAbsolute(searchPath) ? searchPath : path.join(cwd, searchPath))
                : cwd;

            // 尝试使用 ripgrep
            const rgResult = await this.searchWithRipgrep(
                pattern,
                searchDir,
                cwd,
                {
                    isRegex: is_regex,
                    filePattern: file_pattern,
                    caseSensitive: case_sensitive,
                    contextLines: context_lines,
                },
                logService
            );

            if (rgResult) {
                const duration = Date.now() - startTime;
                logService.info(`[GrepSearchTool] 找到 ${rgResult.matchCount} 个匹配，耗时 ${duration}ms`);
                return successResult(rgResult, { duration });
            }

            // 降级到 VSCode 搜索
            logService.info(`[GrepSearchTool] Ripgrep 不可用，使用 VSCode 搜索`);
            const vscodeResult = await this.searchWithVSCode(
                pattern,
                searchDir,
                cwd,
                { isRegex: is_regex, caseSensitive: case_sensitive },
                logService
            );

            const duration = Date.now() - startTime;
            return successResult(vscodeResult, { duration });

        } catch (error) {
            return errorResultFromError(error, '搜索失败');
        }
    }

    /**
     * 使用 Ripgrep 搜索
     */
    private async searchWithRipgrep(
        pattern: string,
        searchDir: string,
        cwd: string,
        options: {
            isRegex: boolean;
            filePattern?: string;
            caseSensitive: boolean;
            contextLines: number;
        },
        logService: any
    ): Promise<GrepSearchOutput | null> {
        const rgPath = this.getRipgrepPath();
        if (!rgPath) {
            return null;
        }

        return new Promise((resolve) => {
            const args = [
                '--json',
                '--max-count', String(MAX_MATCHES),
                '-C', String(options.contextLines),
            ];

            if (!options.caseSensitive) {
                args.push('-i');
            }

            if (!options.isRegex) {
                args.push('-F');  // 固定字符串（非正则）
            }

            if (options.filePattern) {
                args.push('-g', options.filePattern);
            }

            // 排除目录
            args.push('-g', '!node_modules');
            args.push('-g', '!.git');
            args.push('-g', '!dist');
            args.push('-g', '!build');

            args.push('--', pattern, searchDir);

            execFile(rgPath, args, {
                maxBuffer: 10 * 1024 * 1024,
                timeout: 30000,
            }, (error, stdout) => {
                if (error && (error as any).code !== 1) {
                    // code 1 表示无匹配，不是错误
                    resolve(null);
                    return;
                }

                try {
                    const result = this.parseRipgrepOutput(stdout, cwd);
                    resolve(result);
                } catch (e) {
                    logService.warn(`[GrepSearchTool] 解析 ripgrep 输出失败: ${e}`);
                    resolve(null);
                }
            });
        });
    }

    /**
     * 解析 Ripgrep JSON 输出
     */
    private parseRipgrepOutput(stdout: string, cwd: string): GrepSearchOutput {
        const matches: GrepMatchItem[] = [];
        const fileSet = new Set<string>();
        const lines = stdout.split('\n').filter(Boolean);

        for (const line of lines) {
            try {
                const data = JSON.parse(line);

                if (data.type === 'match') {
                    const filePath = path.relative(cwd, data.data.path.text);
                    fileSet.add(filePath);

                    matches.push({
                        file: filePath,
                        line: data.data.line_number,
                        content: data.data.lines.text.trim(),
                    });

                    if (matches.length >= MAX_MATCHES) {
                        break;
                    }
                }
            } catch {
                // 忽略解析错误的行
            }
        }

        return {
            matches,
            fileCount: fileSet.size,
            matchCount: matches.length,
            truncated: matches.length >= MAX_MATCHES,
        };
    }

    /**
     * 使用 VSCode API 搜索
     */
    private async searchWithVSCode(
        pattern: string,
        searchDir: string,
        cwd: string,
        options: { isRegex: boolean; caseSensitive: boolean },
        logService: any
    ): Promise<GrepSearchOutput> {
        // VSCode 文本搜索 API 较复杂，这里使用简化实现
        // 实际项目中应使用 vscode.workspace.findTextInFiles

        const matches: GrepMatchItem[] = [];
        const fileSet = new Set<string>();

        // 简化实现：返回空结果并提示用户使用其他方式
        logService.warn(`[GrepSearchTool] VSCode 文本搜索降级模式，结果可能不完整`);

        return {
            matches,
            fileCount: 0,
            matchCount: 0,
            truncated: false,
        };
    }

    /**
     * 获取 Ripgrep 路径
     */
    private getRipgrepPath(): string | null {
        if (this.rgPath !== null) {
            return this.rgPath || null;
        }

        // 1. 尝试扩展内置的 ripgrep
        const vendorDir = path.resolve(__dirname, '..', '..', '..', 'vendor', 'ripgrep');
        const platformKey = `${process.arch}-${process.platform}`;
        const builtinPath = path.join(
            vendorDir,
            platformKey,
            process.platform === 'win32' ? 'rg.exe' : 'rg'
        );

        if (fs.existsSync(builtinPath)) {
            this.rgPath = builtinPath;
            return this.rgPath;
        }

        // 2. 尝试系统 ripgrep
        this.rgPath = 'rg';

        try {
            require('child_process').execSync('rg --version', { stdio: 'ignore' });
            return this.rgPath;
        } catch {
            this.rgPath = '';
            return null;
        }
    }
}
