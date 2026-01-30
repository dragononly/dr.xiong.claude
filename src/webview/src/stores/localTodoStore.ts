/**
 * 本地 Todo 状态管理
 *
 * 使用 alien-signals 管理本地 Todo 的状态
 */

import { signal, computed } from 'alien-signals';
import type { LocalTodo } from '../../../shared/todos';
import type { BaseTransport } from '../transport/BaseTransport';

class LocalTodoStore {
  private transport: BaseTransport | null = null;

  // 状态
  readonly todos = signal<LocalTodo[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  // 计算属性
  readonly pendingTodos = computed(() =>
    this.todos().filter(t => t.status === 'pending')
  );

  readonly inProgressTodos = computed(() =>
    this.todos().filter(t => t.status === 'in_progress')
  );

  readonly completedTodos = computed(() =>
    this.todos().filter(t => t.status === 'completed')
  );

  readonly stats = computed(() => ({
    total: this.todos().length,
    pending: this.pendingTodos().length,
    inProgress: this.inProgressTodos().length,
    completed: this.completedTodos().length
  }));

  readonly hasTodos = computed(() => this.todos().length > 0);

  /**
   * 设置 Transport
   */
  setTransport(transport: BaseTransport): void {
    this.transport = transport;
  }

  /**
   * 加载所有 Todo
   */
  async load(): Promise<void> {
    if (!this.transport) {
      console.warn('[LocalTodoStore] Transport not set');
      return;
    }

    this.isLoading(true);
    this.error(null);

    try {
      const response = await (this.transport as any).sendRequest({
        type: 'get_local_todos'
      });
      this.todos(response.todos || []);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error(errorMsg);
      console.error('[LocalTodoStore] Failed to load todos:', err);
    } finally {
      this.isLoading(false);
    }
  }

  /**
   * 添加 Todo
   */
  async add(content: string, priority?: LocalTodo['priority']): Promise<LocalTodo | null> {
    if (!this.transport || !content.trim()) {
      return null;
    }

    try {
      const response = await (this.transport as any).sendRequest({
        type: 'add_local_todo',
        todo: {
          content: content.trim(),
          status: 'pending',
          priority
        }
      });

      const newTodo = response.todo;
      this.todos([newTodo, ...this.todos()]);
      return newTodo;
    } catch (err) {
      console.error('[LocalTodoStore] Failed to add todo:', err);
      return null;
    }
  }

  /**
   * 更新 Todo 状态
   */
  async updateStatus(id: string, status: LocalTodo['status']): Promise<boolean> {
    if (!this.transport) {
      return false;
    }

    try {
      const response = await (this.transport as any).sendRequest({
        type: 'update_local_todo',
        id,
        updates: { status }
      });

      const updatedTodo = response.todo;
      this.todos(this.todos().map(t => t.id === id ? updatedTodo : t));
      return true;
    } catch (err) {
      console.error('[LocalTodoStore] Failed to update todo status:', err);
      return false;
    }
  }

  /**
   * 更新 Todo 内容
   */
  async updateContent(id: string, content: string): Promise<boolean> {
    if (!this.transport || !content.trim()) {
      return false;
    }

    try {
      const response = await (this.transport as any).sendRequest({
        type: 'update_local_todo',
        id,
        updates: { content: content.trim() }
      });

      const updatedTodo = response.todo;
      this.todos(this.todos().map(t => t.id === id ? updatedTodo : t));
      return true;
    } catch (err) {
      console.error('[LocalTodoStore] Failed to update todo content:', err);
      return false;
    }
  }

  /**
   * 删除 Todo
   */
  async delete(id: string): Promise<boolean> {
    if (!this.transport) {
      return false;
    }

    try {
      await (this.transport as any).sendRequest({
        type: 'delete_local_todo',
        id
      });

      this.todos(this.todos().filter(t => t.id !== id));
      return true;
    } catch (err) {
      console.error('[LocalTodoStore] Failed to delete todo:', err);
      return false;
    }
  }

  /**
   * 清除已完成的 Todo
   */
  async clearCompleted(): Promise<number> {
    if (!this.transport) {
      return 0;
    }

    try {
      const response = await (this.transport as any).sendRequest({
        type: 'clear_completed_todos'
      });

      this.todos(this.todos().filter(t => t.status !== 'completed'));
      return response.deletedCount || 0;
    } catch (err) {
      console.error('[LocalTodoStore] Failed to clear completed todos:', err);
      return 0;
    }
  }

  /**
   * 从 Claude TodoWrite 同步
   */
  async syncFromClaude(
    claudeTodos: Array<{ content: string; status: string; activeForm?: string }>,
    sessionId?: string
  ): Promise<void> {
    if (!this.transport) {
      return;
    }

    try {
      const response = await (this.transport as any).sendRequest({
        type: 'import_claude_todos',
        todos: claudeTodos,
        sessionId
      });

      this.todos(response.todos || []);
    } catch (err) {
      console.error('[LocalTodoStore] Failed to sync from Claude:', err);
    }
  }

  /**
   * 切换 Todo 状态（循环：pending -> in_progress -> completed -> pending）
   */
  async toggleStatus(id: string): Promise<boolean> {
    const todo = this.todos().find(t => t.id === id);
    if (!todo) {
      return false;
    }

    const nextStatus: Record<LocalTodo['status'], LocalTodo['status']> = {
      'pending': 'in_progress',
      'in_progress': 'completed',
      'completed': 'pending'
    };

    return this.updateStatus(id, nextStatus[todo.status]);
  }

  /**
   * 重置状态
   */
  reset(): void {
    this.todos([]);
    this.isLoading(false);
    this.error(null);
  }
}

// 导出单例
export const localTodoStore = new LocalTodoStore();
