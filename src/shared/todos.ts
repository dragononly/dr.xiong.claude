/**
 * 本地 Todo 数据类型定义
 */

/**
 * 本地 Todo 项
 */
export interface LocalTodo {
  /** 唯一标识 (uuid) */
  id: string;
  /** 任务内容 */
  content: string;
  /** 任务状态 */
  status: 'pending' | 'in_progress' | 'completed';
  /** 进行中时的动态描述 */
  activeForm?: string;
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
  /** 完成时间戳 */
  completedAt?: number;
  /** 关联的会话 ID（可选） */
  sessionId?: string;
  /** 优先级（可选） */
  priority?: 'low' | 'medium' | 'high';
  /** 标签（可选） */
  tags?: string[];
}

/**
 * Todo 存储结构
 */
export interface TodoStore {
  /** 数据版本，用于迁移 */
  version: number;
  /** Todo 列表 */
  todos: LocalTodo[];
  /** 最后修改时间 */
  lastModified: number;
}

/**
 * 创建 Todo 的输入参数
 */
export type CreateTodoInput = Omit<LocalTodo, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * 更新 Todo 的输入参数
 */
export type UpdateTodoInput = Partial<Omit<LocalTodo, 'id' | 'createdAt'>>;
