/**
 * 工具注册表
 *
 * 管理所有可用工具的注册、查找和执行
 */

import { createDecorator } from '../di/instantiation';
import { ILogService } from '../services/logService';
import type {
    ITool,
    ToolContext,
    ToolResult,
    ToolDefinition,
    ToolUseRequest,
    ToolUseResponse,
    errorResultFromError,
} from './types';

export const IToolRegistry = createDecorator<IToolRegistry>('toolRegistry');

/**
 * 工具注册表接口
 */
export interface IToolRegistry {
    readonly _serviceBrand: undefined;

    /**
     * 注册工具
     */
    register(tool: ITool): void;

    /**
     * 批量注册工具
     */
    registerAll(tools: ITool[]): void;

    /**
     * 获取工具
     */
    get(name: string): ITool | undefined;

    /**
     * 检查工具是否存在
     */
    has(name: string): boolean;

    /**
     * 获取所有工具名称
     */
    getNames(): string[];

    /**
     * 获取所有工具定义（用于发送给模型）
     */
    getToolDefinitions(): ToolDefinition[];

    /**
     * 执行工具
     */
    execute(request: ToolUseRequest, context: ToolContext): Promise<ToolUseResponse>;

    /**
     * 批量执行工具（按顺序）
     */
    executeAll(requests: ToolUseRequest[], context: ToolContext): Promise<ToolUseResponse[]>;
}

/**
 * 工具注册表实现
 */
export class ToolRegistry implements IToolRegistry {
    readonly _serviceBrand: undefined;

    private readonly tools = new Map<string, ITool>();

    constructor(
        @ILogService private readonly logService: ILogService
    ) { }

    register(tool: ITool): void {
        if (this.tools.has(tool.name)) {
            this.logService.warn(`[ToolRegistry] 工具 "${tool.name}" 已存在，将被覆盖`);
        }
        this.tools.set(tool.name, tool);
        this.logService.info(`[ToolRegistry] 注册工具: ${tool.name}`);
    }

    registerAll(tools: ITool[]): void {
        for (const tool of tools) {
            this.register(tool);
        }
    }

    get(name: string): ITool | undefined {
        return this.tools.get(name);
    }

    has(name: string): boolean {
        return this.tools.has(name);
    }

    getNames(): string[] {
        return Array.from(this.tools.keys());
    }

    getToolDefinitions(): ToolDefinition[] {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.inputSchema,
        }));
    }

    async execute(request: ToolUseRequest, context: ToolContext): Promise<ToolUseResponse> {
        const startTime = Date.now();
        const { id, name, input } = request;

        this.logService.info(`[ToolRegistry] 执行工具: ${name}`);
        this.logService.info(`[ToolRegistry] 输入参数: ${JSON.stringify(input).slice(0, 500)}`);

        const tool = this.tools.get(name);

        if (!tool) {
            this.logService.error(`[ToolRegistry] 未找到工具: ${name}`);
            return {
                tool_use_id: id,
                type: 'tool_result',
                content: `错误: 未找到工具 "${name}"`,
                is_error: true,
            };
        }

        // 验证输入（如果工具提供了验证方法）
        if (tool.validate) {
            const validationError = tool.validate(input);
            if (validationError) {
                this.logService.error(`[ToolRegistry] 参数验证失败: ${validationError}`);
                return {
                    tool_use_id: id,
                    type: 'tool_result',
                    content: `参数验证失败: ${validationError}`,
                    is_error: true,
                };
            }
        }

        try {
            const result = await tool.execute(input, context);
            const duration = Date.now() - startTime;

            this.logService.info(`[ToolRegistry] 工具 ${name} 执行完成，耗时 ${duration}ms`);

            if (result.success) {
                // 成功结果
                const content = this.formatResultContent(result.data);
                const response: ToolUseResponse = {
                    tool_use_id: id,
                    type: 'tool_result',
                    content,
                };
                // 传递撤回相关元数据（如果存在）
                if (result.data && typeof result.data === 'object') {
                    if ('snapshotId' in result.data) {
                        response.snapshotId = result.data.snapshotId;
                    }
                    if ('canRevert' in result.data) {
                        response.canRevert = result.data.canRevert;
                    }
                }
                return response;
            } else {
                // 工具返回的错误
                return {
                    tool_use_id: id,
                    type: 'tool_result',
                    content: result.error || '未知错误',
                    is_error: true,
                };
            }
        } catch (error) {
            // 执行异常
            const duration = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.logService.error(`[ToolRegistry] 工具 ${name} 执行异常 (${duration}ms): ${errorMessage}`);

            return {
                tool_use_id: id,
                type: 'tool_result',
                content: `执行异常: ${errorMessage}`,
                is_error: true,
            };
        }
    }

    async executeAll(requests: ToolUseRequest[], context: ToolContext): Promise<ToolUseResponse[]> {
        const results: ToolUseResponse[] = [];

        for (const request of requests) {
            // 检查是否已取消
            if (context.abortSignal?.aborted) {
                results.push({
                    tool_use_id: request.id,
                    type: 'tool_result',
                    content: '操作已取消',
                    is_error: true,
                });
                continue;
            }

            const result = await this.execute(request, context);
            results.push(result);
        }

        return results;
    }

    /**
     * 格式化结果内容
     */
    private formatResultContent(data: any): string {
        if (data === undefined || data === null) {
            return '';
        }

        if (typeof data === 'string') {
            return data;
        }

        // 对象转 JSON
        try {
            return JSON.stringify(data, null, 2);
        } catch {
            return String(data);
        }
    }
}
