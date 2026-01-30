/**
 * Tools - 工具系统入口
 *
 * 导出所有工具类型、注册表和工具实现
 */

// 类型定义
export * from './types';

// 工具注册表
export * from './registry';

// 文件工具
export * from './file';

// Bash 工具
export * from './bash';

// 搜索工具
export * from './search';

// 网络工具
export * from './web';

// 汇总导入
import { getFileTools } from './file';
import { getBashTools } from './bash';
import { getSearchTools } from './search';
import { getWebTools } from './web';
import type { ITool } from './types';

/**
 * 获取所有内置工具
 */
export function getAllBuiltinTools(): ITool[] {
    return [
        ...getFileTools(),
        ...getBashTools(),
        ...getSearchTools(),
        ...getWebTools(),
    ];
}

/**
 * 工具名称映射（用于快速查找）
 */
export const TOOL_NAMES = {
    // 文件工具
    FILE_READ: 'file_read',
    FILE_WRITE: 'file_write',
    FILE_EDIT: 'file_edit',

    // Bash 工具（bash_exec 和 bash_output 已禁用）
    // BASH_EXEC: 'bash_exec', // 已禁用
    // BASH_OUTPUT: 'bash_output', // 已禁用
    BASH_TERMINAL: 'bash_terminal',

    // 搜索工具
    GLOB_SEARCH: 'glob_search',
    GREP_SEARCH: 'grep_search',

    // 网络工具
    WEB_FETCH: 'web_fetch',
} as const;
