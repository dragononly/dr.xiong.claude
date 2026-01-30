/**
 * SecretStorage Migration Tests
 * 测试从 ~/.claude/settings.json 迁移到 VSCode SecretStorage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClaudeConfigService, IClaudeConfigService } from '../src/services/claudeConfigService';
import * as vscode from 'vscode';

// Mock vscode.SecretStorage
class MockSecretStorage implements vscode.SecretStorage {
    private _storage = new Map<string, string>();

    async get(key: string): Promise<string | undefined> {
        return this._storage.get(key);
    }

    async store(key: string, value: string): Promise<void> {
        this._storage.set(key, value);
    }

    async delete(key: string): Promise<void> {
        this._storage.delete(key);
    }

    onDidChange = vi.fn();
}

// Mock vscode.Memento (GlobalState)
class MockMemento implements vscode.Memento {
    private _storage = new Map<string, any>();

    keys(): readonly string[] {
        return Array.from(this._storage.keys());
    }

    get<T>(key: string): T | undefined;
    get<T>(key: string, defaultValue: T): T;
    get<T>(key: string, defaultValue?: T): T | undefined {
        const value = this._storage.get(key);
        return value !== undefined ? value : defaultValue;
    }

    async update(key: string, value: any): Promise<void> {
        if (value === undefined) {
            this._storage.delete(key);
        } else {
            this._storage.set(key, value);
        }
    }

    setKeysForSync(_keys: readonly string[]): void {
        // Not needed for tests
    }
}

describe('ClaudeConfigService - SecretStorage', () => {
    let secretStorage: MockSecretStorage;
    let globalState: MockMemento;
    let configService: IClaudeConfigService;

    beforeEach(() => {
        secretStorage = new MockSecretStorage();
        globalState = new MockMemento();
        configService = new ClaudeConfigService(secretStorage as any, globalState as any);
    });

    describe('API Key Management', () => {
        it('should store API key in secretStorage', async () => {
            const apiKey = 'sk-ant-api03-test-key';
            await configService.setApiKey(apiKey);

            const retrieved = await secretStorage.get('xiong.apiKey');
            expect(retrieved).toBe(apiKey);
        });

        it('should retrieve API key from secretStorage', async () => {
            const apiKey = 'sk-ant-api03-test-key';
            await secretStorage.store('xiong.apiKey', apiKey);

            const retrieved = await configService.getApiKey();
            expect(retrieved).toBe(apiKey);
        });

        it('should return null when API key is not set', async () => {
            const retrieved = await configService.getApiKey();
            expect(retrieved).toBeNull();
        });

        it('should mask API key correctly', async () => {
            const apiKey = 'sk-ant-api03-1234567890abcdef';
            await configService.setApiKey(apiKey);

            const masked = await configService.getMaskedApiKey();
            expect(masked).toBe('sk-a****cdef');
        });

        it('should mask short API key correctly', async () => {
            const apiKey = 'short';
            await configService.setApiKey(apiKey);

            const masked = await configService.getMaskedApiKey();
            expect(masked).toBe('****');
        });

        it('should return null for masked key when not set', async () => {
            const masked = await configService.getMaskedApiKey();
            expect(masked).toBeNull();
        });
    });

    describe('Base URL Management', () => {
        it('should get base URL from VSCode config', async () => {
            // Mock vscode.workspace.getConfiguration
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'baseUrl') return 'http://example.com';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const baseUrl = await configService.getBaseUrl();
            expect(baseUrl).toBe('http://example.com');
        });

        it('should return null when base URL is empty', async () => {
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'baseUrl') return '';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const baseUrl = await configService.getBaseUrl();
            expect(baseUrl).toBeNull();
        });
    });

    describe('Model Management', () => {
        it('should get model from VSCode config', async () => {
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'selectedModel') return 'claude-sonnet-4-5';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const model = await configService.getModel();
            expect(model).toBe('claude-sonnet-4-5');
        });

        it('should return null when model is default', async () => {
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'selectedModel') return 'default';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const model = await configService.getModel();
            expect(model).toBeNull();
        });
    });

    describe('GLM Configuration', () => {
        it('should reuse Claude API key for GLM', async () => {
            const apiKey = 'sk-ant-api03-test-key';
            await configService.setApiKey(apiKey);

            const glmApiKey = await configService.getGlmApiKey();
            expect(glmApiKey).toBe(apiKey);
        });

        it('should get GLM base URL from config', async () => {
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'glmBaseUrl') return 'http://glm.example.com';
                    if (key === 'baseUrl') return 'http://claude.example.com';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const glmBaseUrl = await configService.getGlmBaseUrl();
            expect(glmBaseUrl).toBe('http://glm.example.com');
        });

        it('should fallback to Claude base URL for GLM', async () => {
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'glmBaseUrl') return '';
                    if (key === 'baseUrl') return 'http://claude.example.com';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const glmBaseUrl = await configService.getGlmBaseUrl();
            expect(glmBaseUrl).toBe('http://claude.example.com');
        });

        it('should get GLM model from config', async () => {
            const mockConfig = {
                get: vi.fn((key: string) => {
                    if (key === 'glmModel') return 'glm-4.6v-flashx';
                    return undefined;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const glmModel = await configService.getGlmModel();
            expect(glmModel).toBe('glm-4.6v-flashx');
        });

        it('should use default GLM model when not configured', async () => {
            const mockConfig = {
                get: vi.fn(() => undefined)
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const glmModel = await configService.getGlmModel();
            expect(glmModel).toBe('glm-4.6v-flashx');
        });

        it('should check image preprocessing status', async () => {
            const mockConfig = {
                get: vi.fn((key: string, defaultValue: any) => {
                    if (key === 'enableImagePreprocessing') return true;
                    return defaultValue;
                })
            };
            vi.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

            const enabled = await configService.isImagePreprocessingEnabled();
            expect(enabled).toBe(true);
        });
    });

    describe('No File System Dependencies', () => {
        it('should not have getSettings method', () => {
            expect((configService as any).getSettings).toBeUndefined();
        });

        it('should not have saveSettings method', () => {
            expect((configService as any).saveSettings).toBeUndefined();
        });
    });
});
