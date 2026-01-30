/**
 * BashOutputTool - 获取后台命令输出
 *
 * 功能：
 * - 获取后台进程的输出
 * - 支持正则过滤
 */

import {
    ITool,
    ToolContext,
    ToolResult,
    JSONSchema,
    successResult,
    errorResult,
} from '../types';
import { BackgroundProcessManager } from './BashExecTool';

/**
 * Bash 输出获取输入参数
 */
export interface BashOutputInput {
    /** 后台进程 ID */
    bash_id: string;
    /** 可选的正则过滤器 */
    filter?: string;
}

/**
 * Bash 输出获取输出
 */
export interface BashOutputOutput {
    /** 标准输出 */
    stdout: string;
    /** 标准错误 */
    stderr: string;
    /** 退出码（null 表示仍在运行） */
    exitCode: number | null;
    /** 是否仍在运行 */
    running: boolean;
}

/**
 * BashOutputTool 实现
 */
export class BashOutputTool implements ITool<BashOutputInput, BashOutputOutput> {
    readonly name = 'bash_output';

    readonly description = `Get the output from a background shell command. Use the bash_id returned by bash_exec with run_in_background=true.`;

    readonly inputSchema: JSONSchema = {
        type: 'object',
        properties: {
            bash_id: {
                type: 'string',
                description: 'The ID of the background shell to retrieve output from.',
            },
            filter: {
                type: 'string',
                description: 'Optional regex pattern to filter output lines. Only matching lines are returned.',
            },
        },
        required: ['bash_id'],
    };

    validate(input: BashOutputInput): string | undefined {
        if (!input.bash_id || typeof input.bash_id !== 'string') {
            return 'bash_id 是必需参数';
        }
        if (input.filter !== undefined) {
            try {
                new RegExp(input.filter);
            } catch {
                return 'filter 不是有效的正则表达式';
            }
        }
        return undefined;
    }

    async execute(input: BashOutputInput, context: ToolContext): Promise<ToolResult<BashOutputOutput>> {
        const { bash_id, filter } = input;
        const { logService } = context;

        logService.info(`[BashOutputTool] 获取后台进程输出: ${bash_id}`);

        const manager = BackgroundProcessManager.getInstance();
        const output = manager.getOutput(bash_id);

        if (!output) {
            return errorResult(`未找到后台进程: ${bash_id}`);
        }

        let { stdout, stderr } = output;

        // 应用过滤器
        if (filter) {
            const regex = new RegExp(filter);
            stdout = stdout
                .split('\n')
                .filter(line => regex.test(line))
                .join('\n');
            stderr = stderr
                .split('\n')
                .filter(line => regex.test(line))
                .join('\n');
        }

        return successResult({
            stdout,
            stderr,
            exitCode: output.exitCode,
            running: output.running,
        });
    }
}
