import type { PermissionRequest } from '../core/PermissionRequest';

/**
 * Tool UI 上下文接口
 * 用于 Tool 渲染时访问文件操作等功能
 */
export interface ToolContext {
  fileOpener: {
    open: (filePath: string, location?: { startLine?: number; endLine?: number }) => void;
    openContent: (content: string, fileName: string, editable: boolean) => void;
  };
  /**
   * 当前待处理的权限请求列表
   * 用于在工具消息中显示内联确认按钮
   */
  permissionRequests?: PermissionRequest[];
  /**
   * 会话是否正忙（流式输出中）
   * 用于在流式输出期间保持工具展开，完成后再折叠
   */
  isBusy?: boolean;
}

/**
 * Tool 权限请求渲染器接口
 * 不同的 Tool 可以实现自定义的权限请求 UI
 */
export interface ToolPermissionRenderer {
  /**
   * 渲染权限请求 UI
   * @param context Tool 上下文
   * @param inputs Tool 输入参数
   * @param onModify 修改输入的回调
   */
  renderPermissionRequest(
    context: ToolContext,
    inputs: any,
    onModify?: (newInputs: any) => void
  ): any;
}
