/**
 * WorkspacePathResolver - 统一的工作区路径解析器
 *
 * 根据路径方案.md 实现，提供：
 * 1. 相对路径 → 绝对路径转换
 * 2. 绝对路径 → 相对路径转换
 * 3. 路径规范化（跨平台）
 * 4. 路径验证和修复
 * 5. ~ 展开支持
 */

import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * 路径解析结果
 */
export interface PathResolutionResult {
    /** 解析后的绝对路径 */
    absolutePath: string;
    /** 相对于工作区的路径 */
    relativePath: string;
    /** 是否为有效路径 */
    isValid: boolean;
    /** 路径是否存在 */
    exists: boolean;
    /** 原始输入路径 */
    originalPath: string;
    /** 是否进行了路径修复 */
    wasFixed: boolean;
    /** 修复说明（如果有） */
    fixDescription?: string;
}

/**
 * 工作区路径解析器
 */
export class WorkspacePathResolver {
    private cwd: string;

    constructor(cwd: string) {
        this.cwd = path.normalize(cwd);
    }

    /**
     * 更新工作目录
     */
    setCwd(cwd: string): void {
        this.cwd = path.normalize(cwd);
    }

    /**
     * 获取当前工作目录
     */
    getCwd(): string {
        return this.cwd;
    }

    /**
     * 解析文件路径为绝对路径
     *
     * 支持：
     * - 绝对路径（直接返回）
     * - 相对路径（基于 cwd 解析）
     * - ~ 开头的路径（展开为用户主目录）
     * - 带有 ./ 或 ../ 的路径
     *
     * @param filePath 输入路径
     * @returns 规范化的绝对路径
     */
    resolveToAbsolute(filePath: string): string {
        if (!filePath || typeof filePath !== 'string') {
            return this.cwd;
        }

        // 去除首尾空白
        filePath = filePath.trim();

        // 空路径返回 cwd
        if (!filePath) {
            return this.cwd;
        }

        // 展开 ~ 为用户主目录
        if (filePath.startsWith('~')) {
            filePath = path.join(os.homedir(), filePath.slice(1));
        }

        // 如果已经是绝对路径，直接规范化返回
        if (path.isAbsolute(filePath)) {
            return path.normalize(filePath);
        }

        // 相对路径：基于 cwd 解析
        return path.normalize(path.join(this.cwd, filePath));
    }

    /**
     * 将绝对路径转换为相对路径（用于展示）
     *
     * @param absolutePath 绝对路径
     * @returns 相对路径（如果在工作区内）或原绝对路径
     */
    toRelative(absolutePath: string): string {
        if (!absolutePath) {
            return '';
        }

        const normalized = path.normalize(absolutePath);
        const normalizedCwd = path.normalize(this.cwd);

        // 检查是否在工作区内
        if (normalized.startsWith(normalizedCwd + path.sep)) {
            return normalized.substring(normalizedCwd.length + 1);
        }

        // 如果就是工作区根目录
        if (normalized === normalizedCwd) {
            return path.basename(normalizedCwd);
        }

        // 不在工作区内，返回绝对路径
        return normalized;
    }

    /**
     * 转换为 POSIX 风格路径（用于展示给 AI 和用户）
     */
    toPosix(filePath: string): string {
        if (!filePath) {
            return '';
        }
        // Windows 扩展长度路径不转换
        if (filePath.startsWith('\\\\?\\')) {
            return filePath;
        }
        return filePath.replace(/\\/g, '/');
    }

    /**
     * 安全的路径比较（Windows 不区分大小写）
     */
    arePathsEqual(path1?: string, path2?: string): boolean {
        if (!path1 && !path2) return true;
        if (!path1 || !path2) return false;

        const normalized1 = path.normalize(path1);
        const normalized2 = path.normalize(path2);

        if (process.platform === 'win32') {
            return normalized1.toLowerCase() === normalized2.toLowerCase();
        }
        return normalized1 === normalized2;
    }

    /**
     * 检查路径是否在工作区内
     */
    isInWorkspace(filePath: string): boolean {
        const absolute = this.resolveToAbsolute(filePath);
        const normalizedCwd = path.normalize(this.cwd);
        return absolute.startsWith(normalizedCwd + path.sep) || absolute === normalizedCwd;
    }

    /**
     * 检查路径是否存在
     */
    async pathExists(filePath: string): Promise<boolean> {
        try {
            const absolute = this.resolveToAbsolute(filePath);
            await fs.promises.access(absolute, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 同步检查路径是否存在
     */
    pathExistsSync(filePath: string): boolean {
        try {
            const absolute = this.resolveToAbsolute(filePath);
            fs.accessSync(absolute, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 完整的路径解析（包含验证）
     */
    async resolve(filePath: string): Promise<PathResolutionResult> {
        const originalPath = filePath;
        let wasFixed = false;
        let fixDescription: string | undefined;

        // 基本解析
        const absolutePath = this.resolveToAbsolute(filePath);
        const relativePath = this.toRelative(absolutePath);
        const exists = await this.pathExists(absolutePath);

        // 验证路径格式
        const isValid = this.isValidPath(absolutePath);

        return {
            absolutePath,
            relativePath,
            isValid,
            exists,
            originalPath,
            wasFixed,
            fixDescription
        };
    }

    /**
     * 验证路径格式是否有效
     */
    isValidPath(filePath: string): boolean {
        if (!filePath || typeof filePath !== 'string') {
            return false;
        }

        // 检查是否包含非法字符
        const invalidChars = process.platform === 'win32'
            ? /[<>:"|?*\x00-\x1F]/
            : /[\x00]/;

        return !invalidChars.test(filePath);
    }

    /**
     * 修复工具调用中的路径参数
     *
     * 这是核心方法，用于在 Hook 中自动修复路径问题：
     * 1. 如果是相对路径，转换为绝对路径
     * 2. 如果路径不存在但可以推断，尝试修复
     * 3. 规范化路径格式
     *
     * @param filePath 原始路径
     * @param toolName 工具名称（用于日志）
     * @returns 修复后的路径和修复信息
     */
    fixToolPath(filePath: string | undefined, toolName: string): {
        fixedPath: string;
        wasFixed: boolean;
        fixDescription: string;
    } {
        // 空路径
        if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
            return {
                fixedPath: '',
                wasFixed: false,
                fixDescription: '路径为空'
            };
        }

        const originalPath = filePath.trim();
        let fixedPath = originalPath;
        let wasFixed = false;
        const fixes: string[] = [];

        // 1. 展开 ~ 路径
        if (fixedPath.startsWith('~')) {
            fixedPath = path.join(os.homedir(), fixedPath.slice(1));
            wasFixed = true;
            fixes.push('展开 ~ 为用户主目录');
        }

        // 2. 如果是相对路径，转换为绝对路径
        if (!path.isAbsolute(fixedPath)) {
            fixedPath = path.normalize(path.join(this.cwd, fixedPath));
            wasFixed = true;
            fixes.push(`相对路径转换为绝对路径 (cwd: ${this.cwd})`);
        } else {
            // 规范化绝对路径
            fixedPath = path.normalize(fixedPath);
        }

        // 3. 确保路径不以分隔符结尾（除非是根目录）
        if (fixedPath.endsWith(path.sep) && fixedPath !== path.parse(fixedPath).root) {
            fixedPath = fixedPath.slice(0, -1);
            wasFixed = true;
            fixes.push('移除尾部分隔符');
        }

        return {
            fixedPath,
            wasFixed,
            fixDescription: fixes.length > 0 ? fixes.join('; ') : '无需修复'
        };
    }

    /**
     * 批量修复工具参数中的路径
     *
     * @param params 工具参数对象
     * @param pathKeys 需要修复的路径字段名
     * @param toolName 工具名称
     * @returns 修复后的参数和修复报告
     */
    fixToolParams<T extends Record<string, unknown>>(
        params: T,
        pathKeys: string[],
        toolName: string
    ): {
        fixedParams: T;
        wasFixed: boolean;
        report: string[];
    } {
        const fixedParams = { ...params };
        let wasFixed = false;
        const report: string[] = [];

        for (const key of pathKeys) {
            const value = params[key];
            if (typeof value === 'string') {
                const result = this.fixToolPath(value, toolName);
                if (result.wasFixed) {
                    (fixedParams as Record<string, unknown>)[key] = result.fixedPath;
                    wasFixed = true;
                    report.push(`${key}: ${result.fixDescription}`);
                }
            }
        }

        return {
            fixedParams,
            wasFixed,
            report
        };
    }

    /**
     * 获取可读的路径展示（用于 UI）
     *
     * @param filePath 文件路径
     * @returns 可读的路径字符串
     */
    getReadablePath(filePath: string): string {
        if (!filePath) {
            return '';
        }

        const absolute = this.resolveToAbsolute(filePath);

        // 工作区根目录显示 basename
        if (this.arePathsEqual(absolute, this.cwd)) {
            return path.basename(this.cwd);
        }

        // 工作区内显示相对路径
        if (this.isInWorkspace(absolute)) {
            return this.toPosix(this.toRelative(absolute));
        }

        // 工作区外显示绝对路径
        return this.toPosix(absolute);
    }
}

/**
 * 创建工作区路径解析器的工厂函数
 */
export function createWorkspacePathResolver(cwd: string): WorkspacePathResolver {
    return new WorkspacePathResolver(cwd);
}

/**
 * 默认的路径解析器实例（使用 process.cwd()）
 */
let defaultResolver: WorkspacePathResolver | null = null;

/**
 * 获取默认的路径解析器
 */
export function getDefaultResolver(): WorkspacePathResolver {
    if (!defaultResolver) {
        defaultResolver = new WorkspacePathResolver(process.cwd());
    }
    return defaultResolver;
}

/**
 * 设置默认解析器的工作目录
 */
export function setDefaultResolverCwd(cwd: string): void {
    if (defaultResolver) {
        defaultResolver.setCwd(cwd);
    } else {
        defaultResolver = new WorkspacePathResolver(cwd);
    }
}
