/**
 * 自动任务执行服务
 *
 * 职责：
 * 1. 监听 .tasks/current.md 文件变化
 * 2. 定时检查任务文件（作为备用方案）
 * 3. 解析未完成的任务
 * 4. 当有未完成任务时，自动发送给 Claude 执行
 */

import * as vscode from 'vscode';
import { ILogService } from './logService';
import { IClaudeAgentService } from './claude/ClaudeAgentService';

const TASKS_DIR = '.tasks';
const TASKS_FILE = 'current.md';
const DEFAULT_CHECK_INTERVAL = 3000; // 默认 3 秒检查一次

export interface Task {
    title: string;
    status: 'pending' | 'in-progress' | 'completed';
    section: 'in-progress' | 'pending' | 'completed';
}

export interface AutoTaskConfig {
    enabled: boolean;
    checkInterval: number; // 毫秒
}

export class AutoTaskService {
    private checkTimer: ReturnType<typeof setInterval> | null = null;
    private isRunning: boolean = false;
    private config: AutoTaskConfig = {
        enabled: false,  // 默认关闭自动任务，用户需要手动启用
        checkInterval: DEFAULT_CHECK_INTERVAL
    };
    private lastTaskContent: string = '';
    private onTaskFoundCallback: ((tasks: Task[]) => void) | null = null;
    private onTaskFileChangedCallback: ((tasks: Task[]) => void) | null = null;
    private fileWatcher: vscode.FileSystemWatcher | null = null;

    constructor(
        private readonly logService: ILogService,
        private readonly agentService: IClaudeAgentService
    ) {
        // 初始化文件监听（仅用于 UI 更新，不自动执行任务）
        this.initFileWatcher();

        // 不再自动启动任务检查，用户需要手动启用
        this.logService.info('[AutoTaskService] 已初始化（默认禁用，需要用户手动启用）');

        // 延迟加载初始任务列表（给 ClaudeAgentService 时间注册回调）
        setTimeout(() => this.loadInitialTasks(), 100);
    }

    /**
     * 加载初始任务列表（用于 UI 显示，不触发自动执行）
     */
    private async loadInitialTasks(): Promise<void> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) return;

            const taskFilePath = vscode.Uri.joinPath(
                workspaceFolder.uri,
                TASKS_DIR,
                TASKS_FILE
            );

            try {
                const content = await vscode.workspace.fs.readFile(taskFilePath);
                const taskContent = Buffer.from(content).toString('utf-8');
                this.lastTaskContent = taskContent;

                const tasks = this.parseTaskFile(taskContent);

                // 只通知 UI 更新，不触发自动执行
                if (this.onTaskFileChangedCallback && tasks.length > 0) {
                    this.logService.info(`[AutoTaskService] 加载初始任务列表: ${tasks.length} 个任务`);
                    this.onTaskFileChangedCallback(tasks);
                }
            } catch {
                // 文件不存在，忽略
                this.logService.info('[AutoTaskService] 任务文件不存在，跳过初始加载');
            }
        } catch (error) {
            this.logService.error(`[AutoTaskService] 加载初始任务失败: ${error}`);
        }
    }

    /**
     * 初始化文件监听
     */
    private initFileWatcher(): void {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return;

        const pattern = new vscode.RelativePattern(
            workspaceFolder,
            `${TASKS_DIR}/${TASKS_FILE}`
        );

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // 监听文件变化
        this.fileWatcher.onDidChange(() => {
            this.logService.info('[AutoTaskService] 任务文件已更改');
            this.handleFileChange();
        });

        this.fileWatcher.onDidCreate(() => {
            this.logService.info('[AutoTaskService] 任务文件已创建');
            this.handleFileChange();
        });

        this.fileWatcher.onDidDelete(() => {
            this.logService.info('[AutoTaskService] 任务文件已删除');
            // 文件删除时通知清空任务
            if (this.onTaskFileChangedCallback) {
                this.onTaskFileChangedCallback([]);
            }
        });

        this.logService.info('[AutoTaskService] 文件监听已初始化');
    }

    /**
     * 处理文件变化
     */
    private async handleFileChange(): Promise<void> {
        const tasks = await this.checkTasks(true); // 强制检查，不检查内容变化

        // 通知文件变化（用于 UI 刷新）
        if (this.onTaskFileChangedCallback) {
            this.onTaskFileChangedCallback(tasks);
        }
    }

    /**
     * 设置任务文件变化回调（用于实时 UI 更新）
     */
    onTaskFileChanged(callback: (tasks: Task[]) => void): void {
        this.onTaskFileChangedCallback = callback;
    }

    /**
     * 启用自动任务检查
     */
    enable(interval?: number): void {
        this.config.enabled = true;
        if (interval) {
            this.config.checkInterval = interval;
        }

        // 重置缓存，确保能检测到任务
        this.lastTaskContent = '';

        this.startChecking();
        this.logService.info(`[AutoTaskService] 已启用自动任务检查，间隔: ${this.config.checkInterval}ms`);
    }

    /**
     * 禁用自动任务检查
     */
    disable(): void {
        this.config.enabled = false;
        this.stopChecking();

        // 立即清除缓存的任务内容，防止残留
        this.lastTaskContent = '';

        this.logService.info('[AutoTaskService] 已禁用自动任务检查');
    }

    /**
     * 设置检查间隔
     */
    setCheckInterval(interval: number): void {
        this.config.checkInterval = interval;
        if (this.config.enabled) {
            // 重启定时器以应用新间隔
            this.stopChecking();
            this.startChecking();
        }
    }

    /**
     * 设置任务发现回调
     */
    onTaskFound(callback: (tasks: Task[]) => void): void {
        this.onTaskFoundCallback = callback;
    }

    /**
     * 手动触发一次任务检查
     */
    async checkNow(): Promise<Task[]> {
        return this.checkTasks();
    }

    /**
     * 获取当前配置
     */
    getConfig(): AutoTaskConfig {
        return { ...this.config };
    }

    /**
     * 获取运行状态
     */
    isEnabled(): boolean {
        return this.config.enabled;
    }

    /**
     * 启动定时检查
     */
    private startChecking(): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
        }

        this.checkTimer = setInterval(async () => {
            if (!this.isRunning) {
                await this.checkTasks();
            }
        }, this.config.checkInterval);

        // 立即执行一次检查
        this.checkTasks();
    }

    /**
     * 停止定时检查
     */
    private stopChecking(): void {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }
    }

    /**
     * 检查任务文件
     * @param forceNotify 是否强制通知（即使内容没变化也要返回任务）
     */
    private async checkTasks(forceNotify: boolean = false): Promise<Task[]> {
        this.isRunning = true;
        const tasks: Task[] = [];

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                this.logService.info('[AutoTaskService] 没有打开的工作区');
                return tasks;
            }

            const taskFilePath = vscode.Uri.joinPath(
                workspaceFolder.uri,
                TASKS_DIR,
                TASKS_FILE
            );

            try {
                const content = await vscode.workspace.fs.readFile(taskFilePath);
                const taskContent = Buffer.from(content).toString('utf-8');

                const contentChanged = taskContent !== this.lastTaskContent;
                this.lastTaskContent = taskContent;

                // 解析任务
                const parsedTasks = this.parseTaskFile(taskContent);
                tasks.push(...parsedTasks);

                // 找出未完成的任务
                const pendingTasks = tasks.filter(
                    t => t.status === 'pending' && (t.section === 'in-progress' || t.section === 'pending')
                );

                // 当有未完成任务且满足以下条件之一时触发回调：
                // 1. 内容有变化
                // 2. 强制通知模式
                // 3. 定时检查（总是尝试触发，让前端决定是否执行）
                if (pendingTasks.length > 0 && this.config.enabled) {
                    if (contentChanged || forceNotify) {
                        this.logService.info(`[AutoTaskService] 发现 ${pendingTasks.length} 个未完成任务 (内容变化: ${contentChanged})`);
                    }

                    // 总是触发回调，让前端处理重复检测
                    if (this.onTaskFoundCallback) {
                        this.onTaskFoundCallback(pendingTasks);
                    }
                }

            } catch {
                // 文件不存在
                this.logService.info('[AutoTaskService] 任务文件不存在');
            }

        } catch (error) {
            this.logService.error(`[AutoTaskService] 检查任务失败: ${error}`);
        } finally {
            this.isRunning = false;
        }

        return tasks;
    }

    /**
     * 解析任务文件内容
     */
    private parseTaskFile(content: string): Task[] {
        const tasks: Task[] = [];
        const lines = content.split('\n');

        let currentSection: 'in-progress' | 'pending' | 'completed' | null = null;

        for (const line of lines) {
            const trimmedLine = line.trim();

            // 检测 section 标题
            if (trimmedLine.startsWith('## ')) {
                const sectionTitle = trimmedLine.substring(3).toLowerCase();
                if (sectionTitle.includes('进行中') || sectionTitle.includes('in progress') || sectionTitle.includes('in-progress')) {
                    currentSection = 'in-progress';
                } else if (sectionTitle.includes('待办') || sectionTitle.includes('todo') || sectionTitle.includes('pending')) {
                    currentSection = 'pending';
                } else if (sectionTitle.includes('已完成') || sectionTitle.includes('completed') || sectionTitle.includes('done')) {
                    currentSection = 'completed';
                }
                continue;
            }

            // 解析任务项
            if (currentSection && trimmedLine.startsWith('- ')) {
                const taskMatch = trimmedLine.match(/^- \[([ xX])\] (.+)$/);
                if (taskMatch) {
                    const isCompleted = taskMatch[1].toLowerCase() === 'x';
                    const title = taskMatch[2].trim();

                    // 忽略空任务
                    if (title) {
                        tasks.push({
                            title,
                            status: isCompleted ? 'completed' : 'pending',
                            section: currentSection
                        });
                    }
                }
            }
        }

        return tasks;
    }

    /**
     * 生成任务执行提示词
     */
    generateTaskPrompt(tasks: Task[]): string {
        const inProgressTasks = tasks.filter(t => t.section === 'in-progress' && t.status === 'pending');
        const pendingTasks = tasks.filter(t => t.section === 'pending' && t.status === 'pending');

        let prompt = '请继续执行以下任务：\n\n';

        if (inProgressTasks.length > 0) {
            prompt += '## 正在进行的任务\n';
            inProgressTasks.forEach(t => {
                prompt += `- ${t.title}\n`;
            });
            prompt += '\n';
        }

        if (pendingTasks.length > 0 && inProgressTasks.length === 0) {
            prompt += '## 待办任务\n';
            pendingTasks.forEach(t => {
                prompt += `- ${t.title}\n`;
            });
            prompt += '\n';
        }

        prompt += '完成后请更新 `.tasks/current.md` 文件，将已完成的任务标记为 `[x]` 并移到"已完成"部分。';

        return prompt;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        this.stopChecking();
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }
    }
}
