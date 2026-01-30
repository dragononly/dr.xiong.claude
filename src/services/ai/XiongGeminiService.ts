/**
 * XiongGeminiService - XiongGemini 代理服务
 *
 * 使用 Opus 代理（Claude API）来提供 Gemini 兼容接口
 * 不使用 Gemini SDK，直接复用 ClaudeSdkService
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IClaudeSdkService } from '../claude/ClaudeSdkService';
import { AsyncStream } from '../claude/transport';
import type {
    SDKUserMessage,
    Query,
    CanUseTool,
    PermissionMode,
} from '@anthropic-ai/claude-agent-sdk';

export const IXiongGeminiService = createDecorator<IXiongGeminiService>('xiongGeminiService');

/**
 * XiongGemini 服务接口
 */
export interface IXiongGeminiService {
    readonly _serviceBrand: undefined;

    /**
     * 检查模型是否为 XiongGemini 模型
     */
    isXiongGeminiModel(model: string): boolean;

    /**
     * 调用 XiongGemini API 进行查询（接口与 ClaudeSdkService.query 一致）
     */
    query(params: XiongGeminiQueryParams): Promise<Query>;

    /**
     * 中断正在进行的查询
     */
    interrupt(query: Query): Promise<void>;
}

/**
 * 查询参数（与 ClaudeSdkService 一致）
 */
export interface XiongGeminiQueryParams {
    inputStream: AsyncStream<SDKUserMessage>;
    resume: string | null;
    canUseTool: CanUseTool;
    model: string | null;
    cwd: string;
    permissionMode: PermissionMode | string;
    maxThinkingTokens?: number;
}

/**
 * XiongGemini 模型名称映射
 * 将 xionggemini 模型 ID 映射为对应的 Claude 模型 ID
 */
const XIONGGEMINI_MODEL_MAPPING: Record<string, string> = {
    'xionggemini-opus': 'claude-opus-0-0-0',
};

/**
 * XiongGemini 服务实现
 * 实际上是通过 Claude SDK 代理的
 */
export class XiongGeminiService implements IXiongGeminiService {
    readonly _serviceBrand: undefined;

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService,
        @IClaudeSdkService private readonly claudeSdkService: IClaudeSdkService
    ) {
        this.logService.info('[XiongGeminiService] 服务初始化');
    }

    /**
     * 检查模型是否为 XiongGemini 模型
     */
    isXiongGeminiModel(model: string): boolean {
        return model.startsWith('xionggemini-');
    }

    /**
     * 映射模型名称到 Claude 模型
     */
    private mapModelName(model: string): string {
        if (XIONGGEMINI_MODEL_MAPPING[model]) {
            const mapped = XIONGGEMINI_MODEL_MAPPING[model];
            this.logService.info(`[XiongGeminiService] 模型映射: ${model} -> ${mapped}`);
            return mapped;
        }
        // 默认使用 Sonnet (平衡性能)
        return 'claude-sonnet-4-5-20250929';
    }

    /**
     * 调用 XiongGemini API 进行查询
     * 实际上是通过 Claude SDK 代理
     */
    async query(params: XiongGeminiQueryParams): Promise<Query> {
        const { model, ...otherParams } = params;

        this.logService.info('[XiongGeminiService] 使用 Opus 代理查询');

        // 将 xionggemini 模型映射为 Claude 模型
        const mappedModel = this.mapModelName(model || 'xionggemini-pro');

        // 直接调用 Claude SDK
        return this.claudeSdkService.query({
            ...otherParams,
            model: mappedModel,
        });
    }

    /**
     * 中断正在进行的查询
     */
    async interrupt(query: Query): Promise<void> {
        this.logService.info('[XiongGeminiService] 中断查询');
        return this.claudeSdkService.interrupt(query);
    }
}
