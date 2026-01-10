/**
 * Claude 配置服务
 *
 * 职责：
 * 1. 管理 ~/.claude/settings.json 配置文件
 * 2. 提供 API Key 的读写操作
 * 3. 调用代理站 API 查询订阅/使用量
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createDecorator } from '../di/instantiation';

export const IClaudeConfigService = createDecorator<IClaudeConfigService>('claudeConfigService');

// Claude 配置目录和文件
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SETTINGS_FILE = path.join(CLAUDE_DIR, 'settings.json');

// 代理站 Billing API 地址
const BILLING_API_BASE = 'http://serve2.moono.vip:3011/v1';

/**
 * Claude settings.json 结构
 */
export interface ClaudeSettings {
    env?: {
        ANTHROPIC_AUTH_TOKEN?: string;
        ANTHROPIC_BASE_URL?: string;
        ANTHROPIC_MODEL?: string;
        ANTHROPIC_DEFAULT_HAIKU_MODEL?: string;
        ANTHROPIC_DEFAULT_OPUS_MODEL?: string;
        ANTHROPIC_DEFAULT_SONNET_MODEL?: string;
        [key: string]: string | undefined;
    };
    [key: string]: any;
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

    /** 读取完整配置 */
    getSettings(): Promise<ClaudeSettings>;

    /** 保存完整配置 */
    saveSettings(settings: ClaudeSettings): Promise<void>;

    /** 获取 API Key（完整） */
    getApiKey(): Promise<string | null>;

    /** 获取脱敏的 API Key */
    getMaskedApiKey(): Promise<string | null>;

    /** 设置 API Key */
    setApiKey(apiKey: string): Promise<void>;

    /** 获取 Base URL */
    getBaseUrl(): Promise<string | null>;

    /** 设置 Base URL */
    setBaseUrl(baseUrl: string): Promise<void>;

    /** 查询订阅信息 */
    getSubscription(): Promise<SubscriptionInfo | null>;

    /** 查询使用量 */
    getUsage(startDate: string, endDate: string): Promise<UsageInfo | null>;
}

/**
 * Claude 配置服务实现
 */
export class ClaudeConfigService implements IClaudeConfigService {
    readonly _serviceBrand: undefined;

    /**
     * 读取 settings.json
     */
    async getSettings(): Promise<ClaudeSettings> {
        try {
            if (!fs.existsSync(SETTINGS_FILE)) {
                return { env: {} };
            }
            const content = await fs.promises.readFile(SETTINGS_FILE, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error('[ClaudeConfigService] 读取配置失败:', error);
            return { env: {} };
        }
    }

    /**
     * 写入 settings.json
     */
    async saveSettings(settings: ClaudeSettings): Promise<void> {
        try {
            // 确保目录存在
            if (!fs.existsSync(CLAUDE_DIR)) {
                await fs.promises.mkdir(CLAUDE_DIR, { recursive: true });
            }
            await fs.promises.writeFile(
                SETTINGS_FILE,
                JSON.stringify(settings, null, 2),
                'utf8'
            );
        } catch (error) {
            console.error('[ClaudeConfigService] 保存配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取 API Key（完整）
     */
    async getApiKey(): Promise<string | null> {
        const settings = await this.getSettings();
        return settings.env?.ANTHROPIC_AUTH_TOKEN || null;
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
     * 设置 API Key
     */
    async setApiKey(apiKey: string): Promise<void> {
        const settings = await this.getSettings();
        if (!settings.env) {
            settings.env = {};
        }
        settings.env.ANTHROPIC_AUTH_TOKEN = apiKey;
        await this.saveSettings(settings);
    }

    /**
     * 获取 Base URL
     */
    async getBaseUrl(): Promise<string | null> {
        const settings = await this.getSettings();
        return settings.env?.ANTHROPIC_BASE_URL || null;
    }

    /**
     * 设置 Base URL
     */
    async setBaseUrl(baseUrl: string): Promise<void> {
        const settings = await this.getSettings();
        if (!settings.env) {
            settings.env = {};
        }
        settings.env.ANTHROPIC_BASE_URL = baseUrl;
        await this.saveSettings(settings);
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

            const data = await response.json();
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

            const data = await response.json();
            return {
                totalUsage: data.total_usage || 0,
                dailyUsage: data.daily_costs || []
            };
        } catch (error) {
            console.error('[ClaudeConfigService] 查询使用量失败:', error);
            return null;
        }
    }
}
