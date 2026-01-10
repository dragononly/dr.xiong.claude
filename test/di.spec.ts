/**
 * DI 框架测试 / DI Framework Tests
 */

import { describe, it, expect } from 'vitest';
import { InstantiationService } from '../src/di/instantiationService';
import { ServiceCollection } from '../src/di/serviceCollection';
import { SyncDescriptor } from '../src/di/descriptors';
import { createDecorator } from '../src/di/instantiation';

// 测试服务接口
const ITestService = createDecorator<ITestService>('testService');

interface ITestService {
	_serviceBrand: undefined;
	getValue(): string;
}

class TestService implements ITestService {
	_serviceBrand: undefined;
	getValue(): string {
		return 'test';
	}
}

describe('DI Framework', () => {
	it('should create service instance', () => {
		const services = new ServiceCollection();
		services.set(ITestService, new SyncDescriptor(TestService));

		const instantiationService = new InstantiationService(services);
		const testService = instantiationService.invokeFunction(accessor => {
			return accessor.get(ITestService);
		});

		expect(testService.getValue()).toBe('test');
	});

	it('should inject dependencies', () => {
		const IDepService = createDecorator<IDepService>('depService');

		interface IDepService {
			_serviceBrand: undefined;
			getName(): string;
		}

		class DepService implements IDepService {
			_serviceBrand: undefined;
			getName(): string {
				return 'dependency';
			}
		}

		class ConsumerService {
			constructor(@IDepService private dep: IDepService) { }

			getMessage(): string {
				return `Using: ${this.dep.getName()}`;
			}
		}

		const services = new ServiceCollection();
		services.set(IDepService, new SyncDescriptor(DepService));

		const instantiationService = new InstantiationService(services);
		const consumer = instantiationService.createInstance(ConsumerService);

		expect(consumer.getMessage()).toBe('Using: dependency');
	});
});
