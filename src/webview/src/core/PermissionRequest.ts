import type { PermissionUpdate, PermissionResult } from '../../../shared/permissions';
import { EventEmitter } from '../utils/events';

/**
 * 将对象深拷贝为普通 JavaScript 对象
 * 用于去除 Vue Proxy 等不可序列化的包装
 * 
 * 注意：这里的 inputs 只包含简单的 file_path 和 content 字符串，
 * 不会有复杂类型，所以使用 JSON 序列化是安全的。
 */
function toPlainObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  // 使用 JSON 序列化/反序列化来去除 Proxy 包装
  // 对于权限请求的 inputs（只包含 file_path 和 content），这是安全的
  return JSON.parse(JSON.stringify(obj));
}

export class PermissionRequest {
  readonly channelId: string;
  readonly toolName: string;
  readonly inputs: Record<string, unknown>;
  readonly suggestions: PermissionUpdate[];

  private readonly resolved: EventEmitter<PermissionResult> = new EventEmitter();

  constructor(
    channelId: string,
    toolName: string,
    inputs: Record<string, unknown>,
    suggestions: PermissionUpdate[] = []
  ) {
    this.channelId = channelId;
    this.toolName = toolName;
    this.inputs = inputs;
    this.suggestions = suggestions;
  }

  accept(
    updatedInput: Record<string, unknown> = this.inputs,
    updatedPermissions: PermissionUpdate[] = this.suggestions
  ): void {
    console.log('[PermissionRequest] accept() 被调用, channelId:', this.channelId);
    console.log('[PermissionRequest] updatedInput:', updatedInput);
    // 将对象转换为普通 JavaScript 对象，确保可以通过 postMessage 传递
    const plainInput = toPlainObject(updatedInput);
    const plainPermissions = toPlainObject(updatedPermissions);
    console.log('[PermissionRequest] plainInput:', plainInput);
    console.log('[PermissionRequest] 准备 emit resolved 事件, 监听器数量:', this.resolved.listenerCount);
    this.resolved.emit({ behavior: 'allow', updatedInput: plainInput, updatedPermissions: plainPermissions });
    console.log('[PermissionRequest] resolved 事件已 emit');
  }

  reject(message: string = 'Denied by user', interrupt: boolean = true): void {
    this.resolved.emit({ behavior: 'deny', message, interrupt });
  }

  onResolved(callback: (resolution: PermissionResult) => void): () => void {
    return this.resolved.add(callback);
  }
}

