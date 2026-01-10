# Usage Guide

## Table of Contents

- [DI Framework Basics](#di-framework-basics)
- [Creating Custom Services](#creating-custom-services)
- [Service Registration](#service-registration)
- [Using Services](#using-services)
- [Best Practices](#best-practices)

## DI Framework Basics

### What is Dependency Injection?

Dependency Injection (DI) is a design pattern used to implement Inversion of Control (IoC). It allows you to:

- Decouple code
- Improve testability
- Manage complex dependencies
- Control object lifecycle

### Core Concepts

1. **Service Identifier** - Uniquely identifies a service
2. **Service Implementation** - Class that implements the service interface
3. **Service Container** - Container that manages all services
4. **Dependency Injection** - Automatically resolves and injects dependencies

## Creating Custom Services

### Step 1: Define Service Interface

```typescript
import { createDecorator } from '../di/instantiation';

// Create service identifier
export const IMyService = createDecorator<IMyService>('myService');

// Define service interface
export interface IMyService {
    readonly _serviceBrand: undefined;  // Required

    doSomething(input: string): Promise<string>;
}
```

### Step 2: Implement Service Class

```typescript
import { ILogService } from './logService';

export class MyService implements IMyService {
    readonly _serviceBrand: undefined;

    // Constructor dependency injection
    constructor(
        @ILogService private readonly logService: ILogService
    ) {
        this.logService.info('MyService initialized');
    }

    async doSomething(input: string): Promise<string> {
        this.logService.debug('Processing:', input);
        return `Processed: ${input}`;
    }
}
```

### Step 3: Register Service

Register in `serviceRegistry.ts`:

```typescript
import * as vscode from 'vscode';
import { SyncDescriptor } from '../di/descriptors';
import { IInstantiationServiceBuilder } from '../di/instantiationServiceBuilder';
import { IMyService, MyService } from './myService';

export function registerServices(
    builder: IInstantiationServiceBuilder,
    context: vscode.ExtensionContext
) {
    // ...other services

    builder.define(IMyService, new SyncDescriptor(MyService));
}
```

## Using Services

### Method 1: Decorator Injection (Recommended)

```typescript
class MyConsumer {
    constructor(
        @IMyService private readonly myService: IMyService,
        @ILogService private readonly logService: ILogService
    ) {
        // Dependencies are automatically injected
    }

    async process(): Promise<void> {
        const result = await this.myService.doSomething('data');
        this.logService.info('Result:', result);
    }
}
```

### Method 2: Functional Access

```typescript
instantiationService.invokeFunction(async accessor => {
    const myService = accessor.get(IMyService);
    const logService = accessor.get(ILogService);

    const result = await myService.doSomething('data');
    logService.info('Result:', result);
});
```

### Method 3: Direct Instance Creation

```typescript
const consumer = instantiationService.createInstance(MyConsumer);
await consumer.process();
```

## Service Registration

### Synchronous Services

```typescript
// Basic registration
builder.define(IMyService, new SyncDescriptor(MyService));

// Registration with arguments
builder.define(IMyService, new SyncDescriptor(MyService, [arg1, arg2]));

// Direct instance registration
builder.define(IMyService, new MyService());
```

### Conditional Registration

```typescript
export function registerServices(
    builder: IInstantiationServiceBuilder,
    context: vscode.ExtensionContext
) {
    const isTestMode = context.extensionMode === vscode.ExtensionMode.Test;

    if (isTestMode) {
        builder.define(ITelemetryService, new SyncDescriptor(NullTelemetryService));
    } else {
        builder.define(ITelemetryService, new SyncDescriptor(TelemetryService));
    }
}
```

## Best Practices

### 1. Service Interface Design

✅ **Recommended**:
```typescript
export interface IMyService {
    readonly _serviceBrand: undefined;
    doTask(): Promise<Result>;
}
```

❌ **Not Recommended**:
```typescript
export interface IMyService {
    doTask(): Promise<Result>;
    internalHelper(): void;  // Don't expose internal methods
}
```

### 2. Dependency Injection

✅ **Recommended**:
```typescript
constructor(
    @ILogService private readonly logService: ILogService
) { }
```

❌ **Not Recommended**:
```typescript
constructor(
    private logService: ILogService  // Missing decorator
) { }
```

### 3. Avoid Circular Dependencies

✅ **Recommended**:
```
ServiceA → ServiceB → ServiceC
```

❌ **Not Recommended**:
```
ServiceA → ServiceB → ServiceA  // Circular!
```

### 4. Testing

```typescript
// Create Mock service for testing
class MockLogService implements ILogService {
    readonly _serviceBrand: undefined;
    info(message: string): void {
        console.log('[TEST]', message);
    }
}

// Use in tests
const builder = new InstantiationServiceBuilder();
builder.define(ILogService, new MockLogService());
const instantiationService = builder.seal();
```

### 5. Lifecycle Management

```typescript
// Services should implement dispose to clean up resources
export class MyService implements IMyService {
    private subscription?: Disposable;

    constructor() {
        this.subscription = someEvent.subscribe();
    }

    dispose(): void {
        this.subscription?.dispose();
    }
}
```

## FAQ

### Q: How to get service instances?

Use `instantiationService.invokeFunction()` or decorator injection in constructor.

### Q: When are services created?

Services are created when first requested (lazy instantiation).

### Q: How to handle async initialization?

```typescript
export class MyService implements IMyService {
    private _initialized = false;

    async initialize(): Promise<void> {
        if (!this._initialized) {
            await this.doAsyncSetup();
            this._initialized = true;
        }
    }
}
```

### Q: How to create singleton services?

All services created through the DI container are singletons by default.
