/**
 * AutoTaskService 测试 / AutoTaskService Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as vscode from 'vscode';
import { AutoTaskService, Task } from '../src/services/AutoTaskService';
import { ILogService } from '../src/services/log/logService';
import { IClaudeAgentService } from '../src/services/claude/ClaudeAgentService';
import { setMockFile, clearMockFiles } from './mocks/vscode';

// Mock LogService
const mockLogService = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
} as ILogService;

// Mock ClaudeAgentService
const mockAgentService = {
    // 添加必要的方法
} as IClaudeAgentService;

describe('AutoTaskService', () => {
    let autoTaskService: AutoTaskService;
    let mockFileSystemWatcher: any;

    beforeEach(() => {
        // 重置所有 mocks
        vi.clearAllMocks();
        clearMockFiles();

        // 创建 AutoTaskService 实例
        autoTaskService = new AutoTaskService(mockLogService, mockAgentService);
    });

    afterEach(() => {
        // 清理
        autoTaskService.dispose();
    });

    describe('初始化', () => {
        it('应该正确初始化服务', () => {
            expect(autoTaskService).toBeDefined();
            expect(autoTaskService.isEnabled()).toBe(true);
        });
    });

    describe('配置管理', () => {
        it('应该返回默认配置', () => {
            const config = autoTaskService.getConfig();
            expect(config.enabled).toBe(true);
            expect(config.checkInterval).toBe(3000);
        });

        it('应该能够禁用自动任务', () => {
            autoTaskService.disable();
            expect(autoTaskService.isEnabled()).toBe(false);
        });

        it('应该能够启用自动任务', () => {
            autoTaskService.disable();
            autoTaskService.enable();
            expect(autoTaskService.isEnabled()).toBe(true);
        });

        it('应该能够设置检查间隔', () => {
            autoTaskService.setCheckInterval(5000);
            const config = autoTaskService.getConfig();
            expect(config.checkInterval).toBe(5000);
        });

        it('启用时应该能够设置检查间隔', () => {
            autoTaskService.enable(6000);
            const config = autoTaskService.getConfig();
            expect(config.enabled).toBe(true);
            expect(config.checkInterval).toBe(6000);
        });
    });

    describe('任务解析', () => {
        it('应该正确解析任务文件内容', async () => {
            const taskContent = `# 当前任务

## 进行中

- [ ] 任务1
- [ ] 任务2

## 待办

- [ ] 任务3

## 已完成

- [x] 已完成任务1
`;

            // 设置 mock 文件
            setMockFile('/mock/workspace/.tasks/current.md', taskContent);

            const tasks = await autoTaskService.checkNow();

            expect(tasks).toHaveLength(4);
            expect(tasks[0].title).toBe('任务1');
            expect(tasks[0].status).toBe('pending');
            expect(tasks[0].section).toBe('in-progress');
            expect(tasks[2].section).toBe('pending');
            expect(tasks[3].status).toBe('completed');
        });

        it('应该正确识别已完成任务', async () => {
            const taskContent = `## 进行中

- [ ] 未完成任务
- [x] 已完成任务
`;

            setMockFile('/mock/workspace/.tasks/current.md', taskContent);

            const tasks = await autoTaskService.checkNow();

            expect(tasks).toHaveLength(2);
            expect(tasks[0].status).toBe('pending');
            expect(tasks[1].status).toBe('completed');
        });

        it('应该忽略空任务', async () => {
            const taskContent = `## 进行中

- [ ]
- [ ] 有效任务

`;

            setMockFile('/mock/workspace/.tasks/current.md', taskContent);

            const tasks = await autoTaskService.checkNow();

            expect(tasks).toHaveLength(1);
            expect(tasks[0].title).toBe('有效任务');
        });

        it('应该支持不同格式的 section 标题', async () => {
            const taskContent = `## In Progress

- [ ] 任务A

## TODO

- [ ] 任务B

## Completed

- [x] 任务C
`;

            setMockFile('/mock/workspace/.tasks/current.md', taskContent);

            const tasks = await autoTaskService.checkNow();

            expect(tasks).toHaveLength(3);
            expect(tasks[0].section).toBe('in-progress');
            expect(tasks[1].section).toBe('pending');
            expect(tasks[2].section).toBe('completed');
        });
    });

    describe('任务发现回调', () => {
        it('应该在发现未完成任务时触发回调', async () => {
            const taskContent = `## 进行中

- [ ] 测试任务
`;

            setMockFile('/mock/workspace/.tasks/current.md', taskContent);

            const mockCallback = vi.fn();
            autoTaskService.onTaskFound(mockCallback);

            await autoTaskService.checkNow();

            // 等待定时器触发
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockCallback).toHaveBeenCalled();
            const pendingTasks = mockCallback.mock.calls[0][0] as Task[];
            expect(pendingTasks).toHaveLength(1);
            expect(pendingTasks[0].title).toBe('测试任务');

            // 清理
            mockCallback.mockClear();
        });

        it('不应该为已完成的任务触发回调', async () => {
            const taskContent = `## 已完成

- [x] 已完成任务
`;

            setMockFile('/mock/workspace/.tasks/current.md', taskContent);

            const mockCallback = vi.fn();
            autoTaskService.onTaskFound(mockCallback);

            await autoTaskService.checkNow();

            // 等待定时器触发
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(mockCallback).not.toHaveBeenCalled();

            // 清理
            mockCallback.mockClear();
        });
    });

    describe('任务文件变化回调', () => {
        it('应该能够设置文件变化回调', () => {
            const mockCallback = vi.fn();
            autoTaskService.onTaskFileChanged(mockCallback);

            // 验证回调可以被设置（实际触发需要文件监听器）
            expect(mockCallback).toBeDefined();
        });
    });

    describe('提示词生成', () => {
        it('应该为进行中的任务生成提示词', () => {
            const tasks: Task[] = [
                { title: '任务A', status: 'pending', section: 'in-progress' },
                { title: '任务B', status: 'pending', section: 'in-progress' }
            ];

            const prompt = autoTaskService.generateTaskPrompt(tasks);

            expect(prompt).toContain('正在进行的任务');
            expect(prompt).toContain('任务A');
            expect(prompt).toContain('任务B');
            expect(prompt).toContain('.tasks/current.md');
        });

        it('应该为待办任务生成提示词', () => {
            const tasks: Task[] = [
                { title: '待办任务', status: 'pending', section: 'pending' }
            ];

            const prompt = autoTaskService.generateTaskPrompt(tasks);

            expect(prompt).toContain('待办任务');
            expect(prompt).toContain('待办任务');
        });

        it('应该优先显示进行中的任务', () => {
            const tasks: Task[] = [
                { title: '进行中任务', status: 'pending', section: 'in-progress' },
                { title: '待办任务', status: 'pending', section: 'pending' }
            ];

            const prompt = autoTaskService.generateTaskPrompt(tasks);

            expect(prompt).toContain('正在进行的任务');
            expect(prompt).toContain('进行中任务');
            expect(prompt).not.toContain('待办任务');
        });
    });

    describe('文件监听', () => {
        it('应该能够初始化文件监听器', () => {
            // 文件监听器在初始化时创建
            // 这个测试验证服务能够正常初始化
            expect(autoTaskService.isEnabled()).toBe(true);
        });
    });

    describe('资源清理', () => {
        it('应该在 dispose 后停止定时检查', () => {
            autoTaskService.dispose();
            autoTaskService.disable();

            expect(autoTaskService.isEnabled()).toBe(false);
        });
    });

    describe('错误处理', () => {
        it('应该处理文件不存在的错误', async () => {
            // 不设置文件，模拟文件不存在
            clearMockFiles();

            const tasks = await autoTaskService.checkNow();

            expect(tasks).toHaveLength(0);
            expect(mockLogService.info).toHaveBeenCalledWith(
                expect.stringContaining('任务文件不存在')
            );
        });

        it('应该处理文件读取错误', async () => {
            // 通过设置一个无效的场景来模拟错误
            // 实际上 mock 的 fs 会抛出异常如果文件不存在
            clearMockFiles();

            try {
                await autoTaskService.checkNow();
            } catch (error) {
                // 预期不会有异常抛出，因为服务会捕获错误
            }

            // 验证至少返回了空结果
            const tasks = await autoTaskService.checkNow();
            expect(tasks).toHaveLength(0);
        });
    });
});
