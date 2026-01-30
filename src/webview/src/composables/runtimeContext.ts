import type { RuntimeInstance } from './useRuntime';
import type { PermissionRequest } from '../core/PermissionRequest';
import { InjectionKey, ComputedRef } from 'vue';

export const RuntimeKey: InjectionKey<RuntimeInstance> = Symbol('runtime');

// 权限请求管理接口
export interface PermissionRequestsContext {
    requests: ComputedRef<PermissionRequest[]>;
    add: (request: PermissionRequest) => void;
    remove: (request: PermissionRequest) => void;
}

export const PermissionRequestsKey: InjectionKey<PermissionRequestsContext> = Symbol('permissionRequests');
