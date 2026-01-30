/**
 * FileSnapshotService - 文件快照服务
 *
 * 用于保存和恢复文件修改前的快照，支持撤回功能
 */

import * as vscode from 'vscode';
import { ILogService } from './logService';

/**
 * 文件快照信息
 */
export interface FileSnapshot {
    /** 快照 ID（使用 tool_use_id） */
    id: string;
    /** 文件路径 */
    filePath: string;
    /** 原始内容（修改前） */
    originalContent: string;
    /** 快照时间 */
    timestamp: number;
    /** 操作类型 */
    operationType: 'write' | 'edit';
    /** 是否已被撤回 */
    reverted: boolean;
    /** 是否是新创建的文件（撤回时需要删除） */
    isNewFile: boolean;
}

/**
 * 文件快照服务接口
 */
export interface IFileSnapshotService {
    /**
     * 创建文件快照
     * @param id 快照 ID（通常使用 tool_use_id）
     * @param filePath 文件路径
     * @param operationType 操作类型
     * @returns 是否创建成功
     */
    createSnapshot(id: string, filePath: string, operationType: 'write' | 'edit'): Promise<boolean>;

    /**
     * 撤回文件修改
     * @param id 快照 ID
     * @returns 是否撤回成功
     */
    revert(id: string): Promise<{ success: boolean; message: string }>;

    /**
     * 检查快照是否存在且可撤回
     * @param id 快照 ID
     */
    canRevert(id: string): boolean;

    /**
     * 获取快照信息
     * @param id 快照 ID
     */
    getSnapshot(id: string): FileSnapshot | undefined;

    /**
     * 清除所有快照
     */
    clearAll(): void;

    /**
     * 清除过期快照
     * @param maxAge 最大保留时间（毫秒）
     */
    clearExpired(maxAge: number): void;
}

/**
 * 文件快照服务实现
 */
export class FileSnapshotService implements IFileSnapshotService {
    private static instance: FileSnapshotService | null = null;

    /** 快照存储（Map<id, snapshot>） */
    private snapshots: Map<string, FileSnapshot> = new Map();

    /** 最大快照数量 */
    private readonly maxSnapshots = 100;

    /** 日志服务 */
    private logService: ILogService;

    private constructor(logService: ILogService) {
        this.logService = logService;
    }

    /**
     * 获取单例实例
     */
    static getInstance(logService: ILogService): FileSnapshotService {
        if (!FileSnapshotService.instance) {
            FileSnapshotService.instance = new FileSnapshotService(logService);
        }
        return FileSnapshotService.instance;
    }

    /**
     * 重置单例（用于测试）
     */
    static resetInstance(): void {
        FileSnapshotService.instance = null;
    }

    async createSnapshot(
        id: string,
        filePath: string,
        operationType: 'write' | 'edit'
    ): Promise<boolean> {
        try {
            this.logService.info(`[FileSnapshotService] 创建快照: id=${id}, path=${filePath}, type=${operationType}`);

            let originalContent = '';
            let isNewFile = false;

            // 尝试读取原文件内容
            try {
                const uri = vscode.Uri.file(filePath);
                const fileContent = await vscode.workspace.fs.readFile(uri);
                originalContent = Buffer.from(fileContent).toString('utf-8');
            } catch (err: any) {
                // 文件不存在，说明是新创建的文件
                if (err.code === 'FileNotFound' || err.code === 'ENOENT') {
                    isNewFile = true;
                    this.logService.info(`[FileSnapshotService] 文件不存在，标记为新文件: ${filePath}`);
                } else {
                    throw err;
                }
            }

            const snapshot: FileSnapshot = {
                id,
                filePath,
                originalContent,
                timestamp: Date.now(),
                operationType,
                reverted: false,
                isNewFile,
            };

            this.snapshots.set(id, snapshot);

            // 清理过多的快照
            this.cleanupIfNeeded();

            this.logService.info(`[FileSnapshotService] 快照创建成功: ${id}`);
            return true;
        } catch (error) {
            this.logService.error(`[FileSnapshotService] 创建快照失败: ${error}`);
            return false;
        }
    }

    async revert(id: string): Promise<{ success: boolean; message: string }> {
        const snapshot = this.snapshots.get(id);

        if (!snapshot) {
            return { success: false, message: `快照不存在: ${id}` };
        }

        if (snapshot.reverted) {
            return { success: false, message: '该操作已被撤回' };
        }

        try {
            this.logService.info(`[FileSnapshotService] 撤回操作: id=${id}, path=${snapshot.filePath}`);

            const uri = vscode.Uri.file(snapshot.filePath);

            if (snapshot.isNewFile) {
                // 新创建的文件，撤回时删除
                await vscode.workspace.fs.delete(uri);
                this.logService.info(`[FileSnapshotService] 已删除新创建的文件: ${snapshot.filePath}`);
            } else {
                // 恢复原内容
                const content = Buffer.from(snapshot.originalContent, 'utf-8');
                await vscode.workspace.fs.writeFile(uri, content);
                this.logService.info(`[FileSnapshotService] 已恢复文件内容: ${snapshot.filePath}`);

                // 在编辑器中显示恢复后的文件
                const document = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(document);
            }

            // 标记为已撤回
            snapshot.reverted = true;

            return { success: true, message: snapshot.isNewFile ? '已删除新创建的文件' : '已恢复到修改前的状态' };
        } catch (error) {
            this.logService.error(`[FileSnapshotService] 撤回失败: ${error}`);
            return { success: false, message: `撤回失败: ${error}` };
        }
    }

    canRevert(id: string): boolean {
        const snapshot = this.snapshots.get(id);
        return snapshot !== undefined && !snapshot.reverted;
    }

    getSnapshot(id: string): FileSnapshot | undefined {
        return this.snapshots.get(id);
    }

    clearAll(): void {
        this.snapshots.clear();
        this.logService.info('[FileSnapshotService] 已清除所有快照');
    }

    clearExpired(maxAge: number): void {
        const now = Date.now();
        let cleared = 0;

        for (const [id, snapshot] of this.snapshots) {
            if (now - snapshot.timestamp > maxAge) {
                this.snapshots.delete(id);
                cleared++;
            }
        }

        if (cleared > 0) {
            this.logService.info(`[FileSnapshotService] 已清除 ${cleared} 个过期快照`);
        }
    }

    /**
     * 清理过多的快照，保留最近的
     */
    private cleanupIfNeeded(): void {
        if (this.snapshots.size > this.maxSnapshots) {
            // 按时间排序，删除最旧的
            const sortedSnapshots = Array.from(this.snapshots.entries())
                .sort((a, b) => b[1].timestamp - a[1].timestamp);

            const toDelete = sortedSnapshots.slice(this.maxSnapshots);
            for (const [id] of toDelete) {
                this.snapshots.delete(id);
            }

            this.logService.info(`[FileSnapshotService] 清理了 ${toDelete.length} 个旧快照`);
        }
    }
}
