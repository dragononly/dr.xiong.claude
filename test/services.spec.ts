/**
 * 服务测试 / Services Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { InstantiationService } from '../src/di/instantiationService';
import { ServiceCollection } from '../src/di/serviceCollection';
import { registerServices } from '../src/services/serviceRegistry';
import { ILogService } from '../src/services/logService';

describe('Services', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should register and retrieve log service', () => {
		const services = new ServiceCollection();

		// 创建一个简单的 mock context
		const mockContext = {
			extensionMode: vscode.ExtensionMode.Test,
			extensionPath: '/mock/extension',
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
				keys: []
			},
			workspaceState: {
				get: vi.fn(),
				update: vi.fn(),
				keys: []
			},
			subscriptions: []
		} as any;

		registerServices(services, mockContext);

		const instantiationService = new InstantiationService(services);

		instantiationService.invokeFunction(accessor => {
			const logService = accessor.get(ILogService);
			expect(logService).toBeDefined();

			// 测试日志方法不抛出异常
			expect(() => {
				logService.info('Test message');
				logService.warn('Warning');
				logService.error('Error');
			}).not.toThrow();
		});
	});
});
