/**
 * Search Tools - 搜索工具集
 */

export * from './GlobSearchTool';
export * from './GrepSearchTool';

import { GlobSearchTool } from './GlobSearchTool';
import { GrepSearchTool } from './GrepSearchTool';
import type { ITool } from '../types';

/**
 * 获取所有搜索工具
 */
export function getSearchTools(): ITool[] {
    return [
        new GlobSearchTool(),
        new GrepSearchTool(),
    ];
}
