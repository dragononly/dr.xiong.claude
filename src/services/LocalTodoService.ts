/**
 * 本地 Todo 持久化服务
 *
 * 职责：管理本地 Todo 的 CRUD 操作和持久化存储
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type { LocalTodo, TodoStore, CreateTodoInput, UpdateTodoInput } from '../shared/todos';

/**
 * 生成简单的 UUID
 */
function generateId(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class LocalTodoService {
    private readonly storageFile: string;
    private cache: TodoStore | null = null;
    private saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly SAVE_DEBOUNCE_MS = 500;

    constructor(context: vscode.ExtensionContext) {
        // 存储在 VSCode 的 globalStorage 目录
        this.storageFile = path.join(
            context.globalStorageUri.fsPath,
            'local-todos.json'
        );
    }

    /**
     * 初始化服务
     */
    async initialize(): Promise<void> {
        // 确保存储目录存在
        const dir = path.dirname(this.storageFile);
        await fs.mkdir(dir, { recursive: true });
        await this.load();
    }

    /**
     * 加载存储数据
     */
    private async load(): Promise<TodoStore> {
        if (this.cache) {
            return this.cache;
        }

        try {
            const content = await fs.readFile(this.storageFile, 'utf-8');
            this.cache = JSON.parse(content);

            // 数据迁移检查
            if (this.cache && this.cache.version < 1) {
                this.cache.version = 1;
                await this.save();
            }
        } catch {
            // 文件不存在，创建默认存储
            this.cache = {
                version: 1,
                todos: [],
                lastModified: Date.now()
            };
        }

        return this.cache!;
    }

    /**
     * 保存存储数据（带防抖）
     */
    private async save(): Promise<void> {
        if (!this.cache) return;

        // 清除之前的定时器
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
        }

        // 设置新的定时器
        this.saveDebounceTimer = setTimeout(async () => {
            if (!this.cache) return;
            this.cache.lastModified = Date.now();
            try {
                await fs.writeFile(
                    this.storageFile,
                    JSON.stringify(this.cache, null, 2),
                    'utf-8'
                );
            } catch (error) {
                console.error('[LocalTodoService] Failed to save:', error);
            }
        }, this.SAVE_DEBOUNCE_MS);
    }

    /**
     * 立即保存（用于关键操作）
     */
    private async saveImmediately(): Promise<void> {
        if (!this.cache) return;

        // 清除防抖定时器
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }

        this.cache.lastModified = Date.now();
        await fs.writeFile(
            this.storageFile,
            JSON.stringify(this.cache, null, 2),
            'utf-8'
        );
    }

    /**
     * 获取所有 Todo
     */
    async getAll(): Promise<LocalTodo[]> {
        const store = await this.load();
        return store.todos;
    }

    /**
     * 添加 Todo
     */
    async add(input: CreateTodoInput): Promise<LocalTodo> {
        const store = await this.load();
        const now = Date.now();

        const newTodo: LocalTodo = {
            ...input,
            id: generateId(),
            createdAt: now,
            updatedAt: now
        };

        // 新任务放在最前面
        store.todos.unshift(newTodo);
        await this.save();

        return newTodo;
    }

    /**
     * 更新 Todo
     */
    async update(id: string, updates: UpdateTodoInput): Promise<LocalTodo | null> {
        const store = await this.load();
        const index = store.todos.findIndex(t => t.id === id);

        if (index === -1) {
            return null;
        }

        const existing = store.todos[index];
        const updated: LocalTodo = {
            ...existing,
            ...updates,
            updatedAt: Date.now()
        };

        // 如果状态变为 completed，记录完成时间
        if (updates.status === 'completed' && existing.status !== 'completed') {
            updated.completedAt = Date.now();
        }

        // 如果从 completed 变为其他状态，清除完成时间
        if (updates.status && updates.status !== 'completed' && existing.status === 'completed') {
            updated.completedAt = undefined;
        }

        store.todos[index] = updated;
        await this.save();

        return updated;
    }

    /**
     * 删除 Todo
     */
    async delete(id: string): Promise<boolean> {
        const store = await this.load();
        const index = store.todos.findIndex(t => t.id === id);

        if (index === -1) {
            return false;
        }

        store.todos.splice(index, 1);
        await this.save();

        return true;
    }

    /**
     * 清除已完成的 Todo
     */
    async clearCompleted(): Promise<number> {
        const store = await this.load();
        const before = store.todos.length;

        store.todos = store.todos.filter(t => t.status !== 'completed');

        const deleted = before - store.todos.length;
        if (deleted > 0) {
            await this.saveImmediately();
        }

        return deleted;
    }

    /**
     * 从 Claude TodoWrite 导入
     * 合并策略：按 content 去重，保留最新状态
     * 
     * 注意：会过滤掉空内容的任务，防止程序陷入死循环
     */
    async importFromClaude(
        todos: Array<{ content: string; status: string; activeForm?: string }>,
        sessionId?: string
    ): Promise<LocalTodo[]> {
        const store = await this.load();
        const now = Date.now();

        for (const todo of todos) {
            // 过滤空任务：content 为空、undefined、null、纯空白、或者是 "无" 这种占位符
            const content = todo.content?.trim();
            if (!content || content === '无' || content === 'null' || content === 'undefined') {
                console.warn('[LocalTodoService] 忽略空任务:', todo);
                continue;
            }

            const existing = store.todos.find(t => t.content === todo.content);

            if (existing) {
                // 更新现有任务
                existing.status = todo.status as LocalTodo['status'];
                existing.activeForm = todo.activeForm;
                existing.updatedAt = now;
                existing.sessionId = sessionId;

                if (todo.status === 'completed' && existing.status !== 'completed') {
                    existing.completedAt = now;
                }
            } else {
                // 添加新任务
                const newTodo: LocalTodo = {
                    id: generateId(),
                    content: todo.content,
                    status: todo.status as LocalTodo['status'],
                    activeForm: todo.activeForm,
                    createdAt: now,
                    updatedAt: now,
                    sessionId
                };

                if (todo.status === 'completed') {
                    newTodo.completedAt = now;
                }

                store.todos.unshift(newTodo);
            }
        }

        await this.saveImmediately();
        return store.todos;
    }

    /**
     * 按状态获取 Todo
     */
    async getByStatus(status: LocalTodo['status']): Promise<LocalTodo[]> {
        const store = await this.load();
        return store.todos.filter(t => t.status === status);
    }

    /**
     * 获取统计信息
     */
    async getStats(): Promise<{
        total: number;
        pending: number;
        inProgress: number;
        completed: number;
    }> {
        const store = await this.load();
        const todos = store.todos;

        return {
            total: todos.length,
            pending: todos.filter(t => t.status === 'pending').length,
            inProgress: todos.filter(t => t.status === 'in_progress').length,
            completed: todos.filter(t => t.status === 'completed').length
        };
    }

    /**
     * 清理资源
     */
    dispose(): void {
        if (this.saveDebounceTimer) {
            clearTimeout(this.saveDebounceTimer);
            this.saveDebounceTimer = null;
        }
    }
}
