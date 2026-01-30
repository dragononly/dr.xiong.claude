/**
 * Claude 配置服务
 *
 * 职责：
 * 1. 管理配置：使用 Claude Code 配置文件 (~/.claude/settings.json)
 * 2. 提供配置的读写操作
 * 3. 调用代理站 API 查询订阅/使用量
 * 4. 提供 GLM 图片识别配置
 *
 * 存储策略：
 * - 统一使用 ~/.claude/settings.json（与 Claude Code CLI 共享配置）
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';

export const IClaudeConfigService = createDecorator<IClaudeConfigService>('claudeConfigService');

// 代理站 Billing API 地址
const BILLING_API_BASE = 'http://aiapi3.moono.vip:3010/v1';

// Claude Code 配置文件路径
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

/**
 * Claude Code 配置文件结构
 */
interface ClaudeSettings {
    apiKey?: string;
    primaryApiKey?: string;
    baseUrl?: string;
    model?: string;
    env?: Record<string, string>;
    [key: string]: unknown;
}

/**
 * 订阅信息
 */
export interface SubscriptionInfo {
    plan: string;
    hardLimit: number;
    softLimit: number;
    expiresAt?: string;
}

/**
 * 使用量信息
 */
export interface UsageInfo {
    totalUsage: number;
    dailyUsage: Array<{ date: string; usage: number }>;
}

/**
 * Claude 配置服务接口
 */
export interface IClaudeConfigService {
    readonly _serviceBrand: undefined;

    /** 获取 API Key */
    getApiKey(): Promise<string | null>;

    /** 获取脱敏的 API Key */
    getMaskedApiKey(): Promise<string | null>;

    /** 设置 API Key */
    setApiKey(apiKey: string): Promise<void>;

    /** 获取 Base URL */
    getBaseUrl(): Promise<string | null>;

    /** 设置 Base URL */
    setBaseUrl(baseUrl: string): Promise<void>;

    /** 获取模型名称 */
    getModel(): Promise<string | null>;

    /** 设置模型名称 */
    setModel(model: string): Promise<void>;

    /** 查询订阅信息 */
    getSubscription(): Promise<SubscriptionInfo | null>;

    /** 查询使用量 */
    getUsage(startDate: string, endDate: string): Promise<UsageInfo | null>;

    // ========== GLM 配置 ==========

    /** 获取 GLM API Key */
    getGlmApiKey(): Promise<string | null>;

    /** 获取 GLM Base URL */
    getGlmBaseUrl(): Promise<string | null>;

    /** 获取 GLM 模型名称 */
    getGlmModel(): Promise<string | null>;

    /** 检查是否启用图片预处理 */
    isImagePreprocessingEnabled(): Promise<boolean>;

    /** 获取配置文件路径 */
    getSettingsPath(): string;
}

/**
 * Claude 配置服务实现
 *
 * 统一使用 ~/.claude/settings.json 存储配置
 * 与 Claude Code CLI 共享配置文件
 */
export class ClaudeConfigService implements IClaudeConfigService {
    readonly _serviceBrand: undefined;

    constructor() {
        console.log('[ClaudeConfigService] 初始化完成，使用 Claude Code 配置文件:', CLAUDE_SETTINGS_PATH);
    }

    /**
     * 获取配置文件路径
     */
    getSettingsPath(): string {
        return CLAUDE_SETTINGS_PATH;
    }

    /**
     * 读取 Claude Code 配置文件
     */
    private readSettings(): ClaudeSettings {
        try {
            if (!fs.existsSync(CLAUDE_SETTINGS_PATH)) {
                console.log('[ClaudeConfigService] 配置文件不存在，返回空配置');
                return {};
            }

            const content = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
            const settings = JSON.parse(content) as ClaudeSettings;
            return settings;
        } catch (e) {
            console.error('[ClaudeConfigService] 读取配置文件失败:', e);
            return {};
        }
    }

    /**
     * 写入 Claude Code 配置文件（带验证）
     */
    private writeSettings(settings: ClaudeSettings): void {
        try {
            // 确保目录存在
            const dir = path.dirname(CLAUDE_SETTINGS_PATH);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log('[ClaudeConfigService] 创建目录:', dir);
            }

            // 写入配置文件
            const content = JSON.stringify(settings, null, 2);
            fs.writeFileSync(CLAUDE_SETTINGS_PATH, content, 'utf-8');

            // 验证写入成功：立即读取并比较
            const verifyContent = fs.readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8');
            if (verifyContent !== content) {
                throw new Error('写入验证失败：文件内容不匹配');
            }

            console.log('[ClaudeConfigService] 配置文件已保存并验证成功:', CLAUDE_SETTINGS_PATH);
        } catch (e) {
            console.error('[ClaudeConfigService] 写入配置文件失败:', e);
            throw new Error(`无法保存配置文件 ${CLAUDE_SETTINGS_PATH}: ${e}`);
        }
    }

    /**
     * 同步到 Xiong 环境变量配置
     */
    private async setXiongEnvVar(name: string, value: string | null): Promise<void> {
        const xiongConfig = vscode.workspace.getConfiguration('xiong');
        const customVars = xiongConfig.get<Array<{ name: string; value: string }>>('environmentVariables', []);
        const normalizedName = name.trim();
        const nextVars = customVars.filter((item) => item.name !== normalizedName);

        if (value && value.trim() !== '') {
            nextVars.push({ name: normalizedName, value: value.trim() });
        }

        await xiongConfig.update('environmentVariables', nextVars, vscode.ConfigurationTarget.Global);
    }

    /**
     * 获取 API Key
     * 仅从 VSCode 配置 (xiong.apiKey) 读取
     */
    async getApiKey(): Promise<string | null> {
        const config = vscode.workspace.getConfiguration('xiong');
        const vscodeApiKey = config.get<string>('apiKey');
        if (vscodeApiKey && vscodeApiKey.trim() !== '') {
            console.log('[ClaudeConfigService] 从 VSCode 配置 (xiong.apiKey) 读取 API Key 成功');
            return vscodeApiKey.trim();
        }

        console.log('[ClaudeConfigService] 没有找到 API Key (xiong.apiKey 未设置)');
        return null;
    }

    /**
     * 获取脱敏的 API Key
     * 显示前4位和后4位，中间用 **** 代替
     */
    async getMaskedApiKey(): Promise<string | null> {
        const key = await this.getApiKey();
        if (!key) return null;
        if (key.length <= 8) return '****';
        return `${key.slice(0, 4)}****${key.slice(-4)}`;
    }

    /**
     * 设置 API Key（带验证）
     * 同时保存到：
     * 1. VSCode 配置 (xiong.apiKey) - 主要读取来源
     * 2. ~/.claude/settings.json - 供 Claude Code CLI 使用
     */
    async setApiKey(apiKey: string): Promise<void> {
        if (!apiKey || apiKey.trim() === '') {
            throw new Error('API Key 不能为空');
        }

        const trimmedKey = apiKey.trim();

        // 1. 保存到 VSCode 配置 (xiong.apiKey)
        const config = vscode.workspace.getConfiguration('xiong');
        await config.update('apiKey', trimmedKey, vscode.ConfigurationTarget.Global);
        console.log('[ClaudeConfigService] API Key 已保存到 VSCode 配置 (xiong.apiKey)');

        // 2. 同时保存到 settings.json (供 Claude Code CLI 使用)
        const settings = this.readSettings();
        settings.apiKey = trimmedKey;
        delete settings.primaryApiKey;
        if (!settings.env || typeof settings.env !== 'object') {
            settings.env = {};
        }
        settings.env.ANTHROPIC_AUTH_TOKEN = trimmedKey;
        delete settings.ANTHROPIC_AUTH_TOKEN;
        settings.CLAUDE_CODE_ATTRIBUTION_HEADER = "0";
        this.writeSettings(settings);
        console.log('[ClaudeConfigService] API Key 已同步到 ~/.claude/settings.json');

        // 3. 同步到 Claudix 环境变量 (供 CLI/SDK 读取)
        await this.setXiongEnvVar('ANTHROPIC_AUTH_TOKEN', trimmedKey);

        // 验证：从 VSCode 配置重新读取确认
        const savedKey = await this.getApiKey();
        if (savedKey !== trimmedKey) {
            throw new Error('API Key 保存验证失败：保存后读取的值与输入不匹配');
        }

        console.log('[ClaudeConfigService] API Key 已保存并验证成功');
    }

    /**
     * 获取 Base URL
     * 仅从 VSCode 配置 (xiong.baseUrl) 读取
     */
    async getBaseUrl(): Promise<string | null> {
        const config = vscode.workspace.getConfiguration('xiong');
        const vscodeBaseUrl = config.get<string>('baseUrl');
        if (vscodeBaseUrl && vscodeBaseUrl.trim() !== '') {
            console.log('[ClaudeConfigService] 从 VSCode 配置 (xiong.baseUrl) 读取 Base URL 成功');
            return vscodeBaseUrl.trim();
        }

        console.log('[ClaudeConfigService] 没有找到 Base URL (xiong.baseUrl 未设置)');
        return null;
    }

    /**
     * 设置 Base URL（带验证）
     * 同时保存到：
     * 1. VSCode 配置 (xiong.baseUrl) - 主要读取来源
     * 2. ~/.claude/settings.json - 供 Claude Code CLI 使用
     */
    async setBaseUrl(baseUrl: string): Promise<void> {
        const trimmedUrl = baseUrl.trim();

        // 1. 保存到 VSCode 配置 (xiong.baseUrl)
        const config = vscode.workspace.getConfiguration('xiong');
        await config.update('baseUrl', trimmedUrl, vscode.ConfigurationTarget.Global);
        console.log('[ClaudeConfigService] Base URL 已保存到 VSCode 配置 (xiong.baseUrl)');

        // 2. 同时保存到 settings.json (供 Claude Code CLI 使用)
        const settings = this.readSettings();
        settings.baseUrl = trimmedUrl;
        if (!settings.env || typeof settings.env !== 'object') {
            settings.env = {};
        }
        settings.env.ANTHROPIC_BASE_URL = trimmedUrl;
        delete settings.ANTHROPIC_BASE_URL;
        settings.CLAUDE_CODE_ATTRIBUTION_HEADER = "0";
        this.writeSettings(settings);
        console.log('[ClaudeConfigService] Base URL 已同步到 ~/.claude/settings.json');

        // 3. 同步到 Claudix 环境变量 (供 CLI/SDK 读取)
        await this.setXiongEnvVar('ANTHROPIC_BASE_URL', trimmedUrl);

        // 验证：从 VSCode 配置重新读取确认
        const savedUrl = await this.getBaseUrl();
        if (savedUrl !== trimmedUrl) {
            throw new Error('Base URL 保存验证失败');
        }

        console.log('[ClaudeConfigService] Base URL 已保存并验证成功');
    }

    /**
     * 获取模型名称
     */
    async getModel(): Promise<string | null> {
        // 优先从 Claude Code 配置文件读取
        const settings = this.readSettings();
        if (settings.model && settings.model.trim() !== '' && settings.model !== 'default') {
            return settings.model.trim();
        }

        // 回退到 VSCode 配置
        const config = vscode.workspace.getConfiguration('xiong');
        const model = config.get<string>('selectedModel');
        if (!model || model.trim() === '' || model === 'default') {
            return null;
        }
        return model.trim();
    }

    /**
     * 设置模型名称（带验证）
     */
    async setModel(model: string): Promise<void> {
        const trimmedModel = model.trim();
        const settings = this.readSettings();
        settings.model = trimmedModel;

        this.writeSettings(settings);

        // 验证：重新读取确认已保存
        const savedSettings = this.readSettings();
        if (savedSettings.model !== trimmedModel) {
            throw new Error('模型设置保存验证失败');
        }

        console.log('[ClaudeConfigService] 模型已保存并验证成功');
    }

    /**
     * 查询订阅信息
     */
    async getSubscription(): Promise<SubscriptionInfo | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            return null;
        }

        try {
            const response = await fetch(
                `${BILLING_API_BASE}/dashboard/billing/subscription`,
                {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;
            return {
                plan: data.plan?.title || data.plan || 'Unknown',
                hardLimit: data.hard_limit_usd || data.hard_limit || 0,
                softLimit: data.soft_limit_usd || data.soft_limit || 0,
                expiresAt: data.access_until || data.expires_at
            };
        } catch (error) {
            console.error('[ClaudeConfigService] 查询订阅信息失败:', error);
            return null;
        }
    }

    /**
     * 查询使用量
     * @param startDate 开始日期，格式: "2024-01-01"
     * @param endDate 结束日期，格式: "2024-12-31"
     */
    async getUsage(startDate: string, endDate: string): Promise<UsageInfo | null> {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            return null;
        }

        try {
            const url = `${BILLING_API_BASE}/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`;
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json() as any;
            return {
                totalUsage: data.total_usage || 0,
                dailyUsage: data.daily_costs || []
            };
        } catch (error) {
            console.error('[ClaudeConfigService] 查询使用量失败:', error);
            return null;
        }
    }

    // ========== GLM 配置方法 ==========

    /**
     * 获取 GLM API Key
     * 复用用户的 API Key
     */
    async getGlmApiKey(): Promise<string | null> {
        return this.getApiKey();
    }

    /**
     * 获取 GLM Base URL
     * 复用用户的 Base URL
     */
    async getGlmBaseUrl(): Promise<string | null> {
        return this.getBaseUrl();
    }

    /**
     * 获取 GLM 模型名称
     * 默认使用 glm-4.6v-flashx
     */
    async getGlmModel(): Promise<string> {
        const config = vscode.workspace.getConfiguration('xiong');
        const glmModel = config.get<string>('glmModel');
        if (glmModel && glmModel.trim() !== '') {
            return glmModel.trim();
        }
        return 'glm-4.6v-flashx';
    }

    /**
     * 检查是否启用图片预处理
     */
    async isImagePreprocessingEnabled(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('xiong');
        return config.get<boolean>('enableImagePreprocessing', true);
    }
}
