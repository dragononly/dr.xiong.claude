/**
 * Bash Tools - 终端命令工具集
 *
 * 注意：BashExecTool 和 BashOutputTool 已被禁用
 * 原因：bash_exec 在后台执行命令，容易超时且用户无法干预
 * 所有命令应通过 BashTerminalTool 在 VS Code 终端中执行
 */

// 保留导出以便类型使用，但不再注册到工具列表
export * from './BashExecTool';
export * from './BashOutputTool';
export * from './BashTerminalTool';

// 只导入需要的工具
import { BashTerminalTool } from './BashTerminalTool';
import type { ITool } from '../types';

/**
 * 获取所有 Bash 工具
 *
 * 注意：已禁用 BashExecTool 和 BashOutputTool
 * 所有终端命令应通过 bash_terminal 在 VS Code 终端中执行
 */
export function getBashTools(): ITool[] {
    return [
        // BashExecTool 已禁用 - 使用 bash_terminal 代替
        // BashOutputTool 已禁用 - 依赖 BashExecTool
        new BashTerminalTool(),
    ];
}
