# API Reference

## DI Framework API

### createDecorator

Create a service identifier decorator.

```typescript
function createDecorator<T>(serviceId: string): ServiceIdentifier<T>
```

**Parameters:**
- `serviceId`: Unique identifier for the service

**Returns:**
- `ServiceIdentifier<T>`: Service identifier that can be used as a decorator

**Example:**
```typescript
export const IMyService = createDecorator<IMyService>('myService');
```

### InstantiationServiceBuilder

Service builder for creating the DI container with immutability protection.

#### constructor

Create a new builder instance.

```typescript
constructor(entries?: ServiceCollection | [ServiceIdentifier<unknown>, unknown][])
```

**Parameters:**
- `entries` (optional): Initial service collection or entries array

**Example:**
```typescript
const builder = new InstantiationServiceBuilder();
```

#### define

Define a service in the builder.

```typescript
define<T>(id: ServiceIdentifier<T>, instance: T | SyncDescriptor<T>): void
```

**Parameters:**
- `id`: Service identifier
- `instance`: Service instance or descriptor

**Throws:**
- Error if the builder is already sealed

**Example:**
```typescript
builder.define(ILogService, new SyncDescriptor(LogService));
builder.define(IMyService, new MyService()); // Direct instance
```

#### seal

Seal the builder and create the InstantiationService.

```typescript
seal(): IInstantiationService
```

**Returns:**
- `IInstantiationService`: The sealed instantiation service

**Throws:**
- Error if the builder is already sealed

**Example:**
```typescript
const instantiationService = builder.seal();
// builder.define(...) will now throw an error
```

### InstantiationService

DI container implementation class.

#### createInstance

Create an instance of a class with automatic dependency injection.

```typescript
createInstance<T>(ctor: Constructor<T>, ...args: any[]): T
```

**Example:**
```typescript
const instance = instantiationService.createInstance(MyClass);
```

#### invokeFunction

Execute a function with service accessor.

```typescript
invokeFunction<R>(fn: (accessor: ServicesAccessor) => R): R
```

**Example:**
```typescript
instantiationService.invokeFunction(accessor => {
    const service = accessor.get(IMyService);
    return service.doSomething();
});
```

#### createChild

Create a child container.

```typescript
createChild(services: ServiceCollection): IInstantiationService
```

### SyncDescriptor

Service descriptor for lazy instantiation.

```typescript
class SyncDescriptor<T> {
    constructor(
        ctor: Constructor<T>,
        staticArgs?: any[],
        supportsDelayedInstantiation?: boolean
    );
}
```

## Built-in Services API

### ILogService

Logging service interface.

```typescript
interface ILogService {
    trace(message: string, ...args: any[]): void;
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string | Error, ...args: any[]): void;
    setLevel(level: LogLevel): void;
}

enum LogLevel {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warning = 3,
    Error = 4
}
```

**Example:**
```typescript
logService.info('Application started');
logService.error(new Error('Something went wrong'));
logService.setLevel(LogLevel.Debug);
```

### IConfigurationService

Configuration service interface.

```typescript
interface IConfigurationService {
    getValue<T>(section: string, defaultValue?: T): T | undefined;
    updateValue(section: string, value: any, target?: ConfigurationTarget): Thenable<void>;
    onDidChangeConfiguration: Event<ConfigurationChangeEvent>;
}
```

**Example:**
```typescript
const timeout = configService.getValue<number>('myExt.timeout', 5000);
await configService.updateValue('myExt.enabled', true);
```

### IFileSystemService

File system service interface.

```typescript
interface IFileSystemService {
    readFile(uri: Uri): Thenable<Uint8Array>;
    writeFile(uri: Uri, content: Uint8Array): Thenable<void>;
    delete(uri: Uri, options?: { recursive?: boolean }): Thenable<void>;
    rename(source: Uri, target: Uri): Thenable<void>;
    createDirectory(uri: Uri): Thenable<void>;
    readDirectory(uri: Uri): Thenable<[string, FileType][]>;
    stat(uri: Uri): Thenable<FileStat>;
}
```

**Example:**
```typescript
const content = await fsService.readFile(uri);
await fsService.writeFile(uri, new TextEncoder().encode('Hello'));
await fsService.createDirectory(dirUri);
```

### IWorkspaceService

Workspace service interface.

```typescript
interface IWorkspaceService {
    getWorkspaceFolders(): readonly WorkspaceFolder[] | undefined;
    getWorkspaceFolder(uri: Uri): WorkspaceFolder | undefined;
    onDidChangeWorkspaceFolders: Event<WorkspaceFoldersChangeEvent>;
}
```

**Example:**
```typescript
const folders = workspaceService.getWorkspaceFolders();
const folder = workspaceService.getWorkspaceFolder(fileUri);
```

### ITabsAndEditorsService

Editor tabs service interface.

```typescript
interface ITabsAndEditorsService {
    getActiveTextEditor(): TextEditor | undefined;
    getVisibleTextEditors(): readonly TextEditor[];
    onDidChangeActiveTextEditor: Event<TextEditor | undefined>;
}
```

**Example:**
```typescript
const editor = tabsService.getActiveTextEditor();
const allEditors = tabsService.getVisibleTextEditors();
```

### ITerminalService

Terminal service interface.

```typescript
interface ITerminalService {
    createTerminal(options?: TerminalOptions): Terminal;
    getActiveTerminal(): Terminal | undefined;
    sendText(text: string, addNewLine?: boolean): void;
}
```

**Example:**
```typescript
const terminal = terminalService.createTerminal({ name: 'My Terminal' });
terminalService.sendText('npm install');
```

### ITelemetryService

Telemetry service interface.

```typescript
interface ITelemetryService {
    logEvent(eventName: string, data?: Record<string, any>): void;
    logError(error: Error, data?: Record<string, any>): void;
}
```

**Example:**
```typescript
telemetryService.logEvent('command.executed', { commandId: 'test' });
telemetryService.logError(error, { context: 'startup' });
```

### INotificationService

Notification service interface.

```typescript
interface INotificationService {
    showInformation(message: string, ...items: string[]): Thenable<string | undefined>;
    showWarning(message: string, ...items: string[]): Thenable<string | undefined>;
    showError(message: string, ...items: string[]): Thenable<string | undefined>;
}
```

**Example:**
```typescript
await notificationService.showInformation('Task completed');
const choice = await notificationService.showWarning('Continue?', 'Yes', 'No');
```

### IDialogService

Dialog service interface.

```typescript
interface IDialogService {
    showInputBox(options?: InputBoxOptions): Thenable<string | undefined>;
    showQuickPick(items: string[], options?: QuickPickOptions): Thenable<string | undefined>;
    showOpenDialog(options?: OpenDialogOptions): Thenable<Uri[] | undefined>;
    showSaveDialog(options?: SaveDialogOptions): Thenable<Uri | undefined>;
}
```

**Example:**
```typescript
const input = await dialogService.showInputBox({ prompt: 'Enter name' });
const choice = await dialogService.showQuickPick(['Option 1', 'Option 2']);
const files = await dialogService.showOpenDialog({ canSelectMany: true });
```

## Type Definitions

### ServiceIdentifier

```typescript
interface ServiceIdentifier<T> {
    (...args: any[]): void;
    type: T;
}
```

### ServicesAccessor

```typescript
interface ServicesAccessor {
    get<T>(id: ServiceIdentifier<T>): T;
    getIfExists<T>(id: ServiceIdentifier<T>): T | undefined;
}
```

### BrandedService

```typescript
type BrandedService = { _serviceBrand: undefined };
```

All service interfaces must include the `_serviceBrand: undefined` property.
