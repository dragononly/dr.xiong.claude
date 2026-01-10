/**
 * 服务测试 / Services Tests
 */

import { describe, it, expect } from 'vitest';
import { InstantiationService } from '../src/di/instantiationService';
import { ServiceCollection } from '../src/di/serviceCollection';
import { registerServices } from '../src/services/serviceRegistry';
import { ILogService } from '../src/services/log/logService';

describe('Services', () => {
	it('should register and retrieve log service', () => {
		const services = new ServiceCollection();
		registerServices(services, true);

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
