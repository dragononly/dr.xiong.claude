/**
 * File Tools - 文件操作工具集
 */

export * from './FileReadTool';
export * from './FileWriteTool';
export * from './FileEditTool';

import { FileReadTool } from './FileReadTool';
import { FileWriteTool } from './FileWriteTool';
import { FileEditTool } from './FileEditTool';
import type { ITool } from '../types';

/**
 * 获取所有文件工具
 */
export function getFileTools(): ITool[] {
    return [
        new FileReadTool(),
        new FileWriteTool(),
        new FileEditTool(),
    ];
}
