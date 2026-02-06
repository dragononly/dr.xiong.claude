/**
 * AIProviderFactory - AI Provider 工厂服务
 *
 * 职责：
 * 1. 管理所有注册的 AI Provider
 * 2. 根据类型或模型名称获取对应的 Provider
 * 3. 提供 Provider 列表供 UI 选择
 */

import { createDecorator } from '../../di/instantiation';
import { ILogService } from '../logService';
import { IConfigurationService } from '../configurationService';
import { IAIProvider, ProviderType } from './IAIProvider';

export const IAIProviderFactory = createDecorator<IAIProviderFactory>('aiProviderFactory');

/**
 * Provider 信息（用于 UI 显示）
 */
export interface ProviderInfo {
    type: ProviderType;
    displayName: string;
    available: boolean;
    models: Array<{ id: string; name: string }>;
}

/**
 * AI Provider 工厂接口
 */
export interface IAIProviderFactory {
    readonly _serviceBrand: undefined;

    /**
     * 获取指定类型的 Provider
     */
    getProvider(type: ProviderType): IAIProvider | undefined;

    /**
     * 根据模型 ID 获取对应的 Provider
     */
    getProviderByModel(modelId: string): IAIProvider | undefined;

    /**
     * 获取所有可用的 Provider 信息
     */
    getAvailableProviders(): Promise<ProviderInfo[]>;

    /**
     * 获取所有可用的模型列表
     */
    getAllModels(): Promise<Array<{ id: string; name: string; provider: ProviderType }>>;

    /**
     * 检查指定 Provider 是否可用
     */
    isProviderAvailable(type: ProviderType): Promise<boolean>;

    /**
     * 获取当前选中的 Provider 类型
     */
    getCurrentProviderType(): ProviderType;

    /**
     * 设置当前 Provider 类型
     */
    setCurrentProviderType(type: ProviderType): void;
}

/**
 * 模型到 Provider 的映射
 */
const MODEL_PROVIDER_MAP: Record<string, ProviderType> = {
    // Claude 模型（新版命名）
    'claude-opus-4-5-20251101': 'claude',
    'claude-opus-4.6': 'claude',
    'claude-haiku-4-5-20251001': 'claude',
    'claude-sonnet-4-5-20250929': 'claude',
    // Claude 模型（旧版命名）
    'claude-3-5-sonnet-20241022': 'claude',
    'claude-3-5-haiku-20241022': 'claude',
    'claude-3-opus-20240229': 'claude',
    'claude-3-sonnet-20240229': 'claude',
    'claude-3-haiku-20240307': 'claude',
    // Gemini 模型（通过 newapi 代理）
    'gemini-3-pro-preview': 'claude',
    'default': 'claude',

};

/**
 * AIProviderFactory 实现
 */
export class AIProviderFactory implements IAIProviderFactory {
    readonly _serviceBrand: undefined;

    private providers = new Map<ProviderType, IAIProvider>();
    private currentProviderType: ProviderType = 'claude';

    constructor(
        @ILogService private readonly logService: ILogService,
        @IConfigurationService private readonly configService: IConfigurationService
    ) {
        this.logService.info('[AIProviderFactory] Initialized with providers: ' +
            Array.from(this.providers.keys()).join(', '));
    }

    /**
     * 注册 Claude Provider（由外部调用，因为 Claude 使用现有的 SDK 服务）
     */
    registerClaudeProvider(provider: IAIProvider): void {
        this.providers.set('claude', provider);
        this.logService.info('[AIProviderFactory] Claude provider registered');
    }

    getProvider(type: ProviderType): IAIProvider | undefined {
        return this.providers.get(type);
    }

    getProviderByModel(modelId: string): IAIProvider | undefined {
        const providerType = MODEL_PROVIDER_MAP[modelId];
        if (providerType) {
            return this.providers.get(providerType);
        }

        // 尝试通过前缀匹配
        if (modelId.startsWith('claude')) {
            return this.providers.get('claude');
        }
        // 默认返回 Claude
        return this.providers.get('claude');
    }

    async getAvailableProviders(): Promise<ProviderInfo[]> {
        const result: ProviderInfo[] = [];

        for (const [type, provider] of this.providers) {
            const available = await provider.isAvailable();
            const models = await provider.getModels();

            result.push({
                type,
                displayName: provider.displayName,
                available,
                models,
            });
        }

        return result;
    }

    async getAllModels(): Promise<Array<{ id: string; name: string; provider: ProviderType }>> {
        const result: Array<{ id: string; name: string; provider: ProviderType }> = [];

        for (const [type, provider] of this.providers) {
            const available = await provider.isAvailable();
            if (!available) continue;

            const models = await provider.getModels();
            for (const model of models) {
                result.push({
                    ...model,
                    provider: type,
                });
            }
        }

        return result;
    }

    async isProviderAvailable(type: ProviderType): Promise<boolean> {
        const provider = this.providers.get(type);
        if (!provider) return false;
        return provider.isAvailable();
    }

    getCurrentProviderType(): ProviderType {
        return this.currentProviderType;
    }

    setCurrentProviderType(type: ProviderType): void {
        if (this.providers.has(type)) {
            this.currentProviderType = type;
            this.logService.info(`[AIProviderFactory] Current provider set to: ${type}`);
        } else {
            this.logService.warn(`[AIProviderFactory] Unknown provider type: ${type}`);
        }
    }
}
