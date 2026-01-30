/**
 * VSCode API Mock for testing
 */

import { EventEmitter } from 'events';

// Enum for ExtensionMode
export enum ExtensionMode {
	Production = 1,
	Development = 2,
	Test = 3
}

// Mock Uri class
class MockUri {
	constructor(public readonly fsPath: string) {}

	static file(path: string): MockUri {
		return new MockUri(path);
	}

	static joinPath(base: MockUri, ...segments: string[]): MockUri {
		const joinedPath = segments.join('/');
		return new MockUri(`${base.fsPath}/${joinedPath}`);
	}

	toString(): string {
		return this.fsPath;
	}
}

// Mock FileSystemWatcher
class MockFileSystemWatcher extends EventEmitter {
	constructor() {
		super();
	}

	onDidChange(callback: () => void): void {
		this.on('change', callback);
	}

	onDidCreate(callback: () => void): void {
		this.on('create', callback);
	}

	onDidDelete(callback: () => void): void {
		this.on('delete', callback);
	}

	dispose(): void {
		this.removeAllListeners();
	}
}

// Mock workspace state
const mockFiles = new Map<string, Buffer>();

export const setMockFile = (path: string, content: string): void => {
	mockFiles.set(path, Buffer.from(content, 'utf-8'));
};

export const clearMockFiles = (): void => {
	mockFiles.clear();
};

export const window = {
	createOutputChannel: (name: string) => ({
		appendLine: (text: string) => console.log(text),
		show: () => { }
	}),
	showInformationMessage: (message: string) => Promise.resolve(undefined),
	showWarningMessage: (message: string) => Promise.resolve(undefined),
	showErrorMessage: (message: string) => Promise.resolve(undefined),
	createTerminal: () => ({
		sendText: (text: string) => console.log('[Terminal]', text),
		show: () => { },
		dispose: () => { }
	})
};

export const workspace = {
	workspaceFolders: [
		{ uri: new MockUri('/mock/workspace') }
	],
	getConfiguration: () => ({
		get: (key: string, defaultValue?: any) => defaultValue,
		update: () => Promise.resolve()
	}),
	fs: {
		readFile: async (uri: MockUri) => {
			const content = mockFiles.get(uri.fsPath);
			if (!content) {
				throw new Error(`File not found: ${uri.fsPath}`);
			}
			return content;
		},
		writeFile: async (uri: MockUri, content: Uint8Array) => {
			mockFiles.set(uri.fsPath, Buffer.from(content));
		}
	},
	createFileSystemWatcher: () => {
		return new MockFileSystemWatcher();
	}
};

export const commands = {
	registerCommand: () => ({ dispose: () => { } })
};

export const Uri = MockUri;

// Re-export ExtensionMode enum
export { ExtensionMode };

export const RelativePattern = class RelativePattern {
	constructor(base: any, pattern: string) {
		// Mock implementation
	}
};
