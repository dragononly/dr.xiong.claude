/**
 * Web Tools - 网络工具集
 */

export * from './WebFetchTool';

import { WebFetchTool } from './WebFetchTool';
import type { ITool } from '../types';

/**
 * 获取所有网络工具
 */
export function getWebTools(): ITool[] {
    return [
        new WebFetchTool(),
    ];
}
