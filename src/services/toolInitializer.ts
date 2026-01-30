/**
 * 工具初始化模块
 *
 * 负责在扩展激活时注册所有内置工具
 */

import { IToolRegistry, getAllBuiltinTools } from '../tools';
import { ILogService } from './logService';

/**
 * 初始化并注册所有内置工具
 *
 * @param toolRegistry - 工具注册表实例
 * @param logService - 日志服务
 */
export function initializeBuiltinTools(
    toolRegistry: IToolRegistry,
    logService: ILogService
): void {
    logService.info('[ToolInitializer] 开始注册内置工具...');

    const tools = getAllBuiltinTools();

    for (const tool of tools) {
        toolRegistry.register(tool);
    }

    logService.info(`[ToolInitializer] 注册完成，共 ${tools.length} 个工具`);

    // 输出工具列表
    const toolNames = toolRegistry.getNames();
    logService.info(`[ToolInitializer] 可用工具: ${toolNames.join(', ')}`);
}
