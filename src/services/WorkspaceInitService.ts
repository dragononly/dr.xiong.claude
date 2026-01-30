/**
 * 工作区初始化服务
 * 负责检查并创建工作区必要的配置文件
 */

import * as vscode from 'vscode';
import * as path from 'path';

const TASKS_DIR = '.tasks';
const TASKS_FILE = 'current.md';
const SUMMARY_FILE = '.claude-summary.md';
const CLAUDE_MD_FILE = 'CLAUDE.md';

// 需要检查的规则关键词
const TASK_RULE_KEYWORD = '.tasks/current.md';
const SUMMARY_RULE_KEYWORD = '.claude-summary.md';

// 要追加到 CLAUDE.md 的规则（简化版，详细规则在系统提示词中）
const CLAUDE_MD_RULES = `

## 项目上下文

每次会话开始时，先读取以下文件了解项目状态：

1. 读取 \`.claude-summary.md\` 了解项目概述
2. 读取 \`.tasks/current.md\` 了解当前任务状态
`;

const TASKS_TEMPLATE = `# 当前任务

> 这个文件用于跟踪项目的当前任务状态。Claude 会读取和更新这个文件。

## 进行中

- [ ]

## 待办

- [ ]

## 已完成

- [x]

---

## 使用说明

### 任务状态
- \`- [ ]\` 待办/进行中
- \`- [x]\` 已完成

### 分类
- **进行中**: 当前正在处理的任务
- **待办**: 计划要做但还没开始的任务
- **已完成**: 已经完成的任务

### 更新方式
1. Claude 会在工作时自动更新这个文件
2. 你也可以直接编辑这个文件
3. 下次会话时，Claude 会读取这个文件来了解任务状态
`;

/**
 * 清理后的任务模板（只保留待办）
 */
const TASKS_CLEANED_TEMPLATE = `# 当前任务

> 这个文件用于跟踪项目的当前任务状态。Claude 会读取和更新这个文件。

## 进行中

- [ ]

## 待办

{PENDING_TASKS}

## 已完成

- [x]

---

## 使用说明

### 任务状态
- \`- [ ]\` 待办/进行中
- \`- [x]\` 已完成

### 分类
- **进行中**: 当前正在处理的任务
- **待办**: 计划要做但还没开始的任务
- **已完成**: 已经完成的任务

### 更新方式
1. Claude 会在工作时自动更新这个文件
2. 你也可以直接编辑这个文件
3. 下次会话时，Claude 会读取这个文件来了解任务状态
`;

const SUMMARY_TEMPLATE = `# 项目概述

> 这个文件用于记录项目的概述信息，帮助 Claude 快速了解项目。

## 项目名称

<!-- 填写项目名称 -->

## 项目描述

<!-- 简要描述项目的目的和功能 -->

## 技术栈

<!-- 列出主要使用的技术 -->

## 目录结构

<!-- 描述主要的目录结构 -->

## 开发说明

<!-- 开发相关的注意事项 -->
`;

export class WorkspaceInitService {
	private logService: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void };

	constructor(logService?: { info: (msg: string) => void; error: (msg: string, err?: unknown) => void }) {
		this.logService = logService || {
			info: (msg: string) => console.log(msg),
			error: (msg: string, err?: unknown) => console.error(msg, err)
		};
	}

	/**
	 * 初始化工作区配置文件
	 */
	async initialize(): Promise<void> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			this.logService.info('[WorkspaceInit] 没有打开的工作区，跳过初始化');
			return;
		}

		const workspacePath = workspaceFolder.uri.fsPath;
		this.logService.info(`[WorkspaceInit] 检查工作区: ${workspacePath}`);

		try {
			// 检查并创建 .tasks/current.md
			await this.ensureTasksFile(workspacePath);

			// 检查并创建 .claude-summary.md
			await this.ensureSummaryFile(workspacePath);

			// 检查并更新 CLAUDE.md 规则
			await this.ensureClaudeMdRules(workspacePath);

			this.logService.info('[WorkspaceInit] 工作区初始化完成');
		} catch (error) {
			this.logService.error('[WorkspaceInit] 初始化失败', error);
		}
	}

	/**
	 * 确保 .tasks/current.md 存在
	 */
	private async ensureTasksFile(workspacePath: string): Promise<void> {
		const tasksDir = path.join(workspacePath, TASKS_DIR);
		const tasksFile = path.join(tasksDir, TASKS_FILE);
		const tasksDirUri = vscode.Uri.file(tasksDir);
		const tasksFileUri = vscode.Uri.file(tasksFile);

		try {
			// 检查目录是否存在
			try {
				await vscode.workspace.fs.stat(tasksDirUri);
			} catch {
				// 目录不存在，创建它
				await vscode.workspace.fs.createDirectory(tasksDirUri);
				this.logService.info(`[WorkspaceInit] 创建目录: ${TASKS_DIR}`);
			}

			// 检查文件是否存在
			try {
				await vscode.workspace.fs.stat(tasksFileUri);
				this.logService.info(`[WorkspaceInit] ${TASKS_DIR}/${TASKS_FILE} 已存在`);
			} catch {
				// 文件不存在，创建它
				await vscode.workspace.fs.writeFile(
					tasksFileUri,
					Buffer.from(TASKS_TEMPLATE, 'utf-8')
				);
				this.logService.info(`[WorkspaceInit] 创建文件: ${TASKS_DIR}/${TASKS_FILE}`);
			}
		} catch (error) {
			this.logService.error(`[WorkspaceInit] 创建 ${TASKS_DIR}/${TASKS_FILE} 失败`, error);
		}
	}

	/**
	 * 确保 .claude-summary.md 存在
	 */
	private async ensureSummaryFile(workspacePath: string): Promise<void> {
		const summaryFile = path.join(workspacePath, SUMMARY_FILE);
		const summaryFileUri = vscode.Uri.file(summaryFile);

		try {
			// 检查文件是否存在
			try {
				await vscode.workspace.fs.stat(summaryFileUri);
				this.logService.info(`[WorkspaceInit] ${SUMMARY_FILE} 已存在`);
			} catch {
				// 文件不存在，创建它
				await vscode.workspace.fs.writeFile(
					summaryFileUri,
					Buffer.from(SUMMARY_TEMPLATE, 'utf-8')
				);
				this.logService.info(`[WorkspaceInit] 创建文件: ${SUMMARY_FILE}`);
			}
		} catch (error) {
			this.logService.error(`[WorkspaceInit] 创建 ${SUMMARY_FILE} 失败`, error);
		}
	}

	/**
	 * 确保 CLAUDE.md 包含任务管理规则
	 */
	private async ensureClaudeMdRules(workspacePath: string): Promise<void> {
		const claudeMdFile = path.join(workspacePath, CLAUDE_MD_FILE);
		const claudeMdFileUri = vscode.Uri.file(claudeMdFile);

		try {
			// 检查 CLAUDE.md 是否存在
			let content = '';
			let fileExists = false;

			try {
				const fileContent = await vscode.workspace.fs.readFile(claudeMdFileUri);
				content = Buffer.from(fileContent).toString('utf-8');
				fileExists = true;
			} catch {
				// 文件不存在
				fileExists = false;
			}

			// 检查是否已包含规则
			const hasTaskRule = content.includes(TASK_RULE_KEYWORD);
			const hasSummaryRule = content.includes(SUMMARY_RULE_KEYWORD);

			if (hasTaskRule && hasSummaryRule) {
				this.logService.info(`[WorkspaceInit] ${CLAUDE_MD_FILE} 已包含任务管理规则`);
				return;
			}

			// 需要追加规则
			if (fileExists) {
				// 文件存在但缺少规则，追加到末尾
				const newContent = content.trimEnd() + '\n' + CLAUDE_MD_RULES;
				await vscode.workspace.fs.writeFile(
					claudeMdFileUri,
					Buffer.from(newContent, 'utf-8')
				);
				this.logService.info(`[WorkspaceInit] 已向 ${CLAUDE_MD_FILE} 追加任务管理规则`);
			} else {
				// 文件不存在，创建新文件
				const newContent = `# CLAUDE.md\n${CLAUDE_MD_RULES}`;
				await vscode.workspace.fs.writeFile(
					claudeMdFileUri,
					Buffer.from(newContent, 'utf-8')
				);
				this.logService.info(`[WorkspaceInit] 创建文件: ${CLAUDE_MD_FILE}`);
			}
		} catch (error) {
			this.logService.error(`[WorkspaceInit] 更新 ${CLAUDE_MD_FILE} 失败`, error);
		}
	}

	/**
	 * 清理任务文件：只保留待办任务，清除进行中和已完成的任务
	 * 在新会话开始时调用
	 */
	async cleanupTasksFile(workspacePath?: string): Promise<void> {
		const workspaceFolder = workspacePath
			? { uri: { fsPath: workspacePath } }
			: vscode.workspace.workspaceFolders?.[0];

		if (!workspaceFolder) {
			this.logService.info('[WorkspaceInit] 没有打开的工作区，跳过任务清理');
			return;
		}

		const wsPath = workspaceFolder.uri.fsPath;
		const tasksFile = path.join(wsPath, TASKS_DIR, TASKS_FILE);
		const tasksFileUri = vscode.Uri.file(tasksFile);

		try {
			// 读取当前任务文件
			let content: string;
			try {
				const fileContent = await vscode.workspace.fs.readFile(tasksFileUri);
				content = Buffer.from(fileContent).toString('utf-8');
			} catch {
				this.logService.info('[WorkspaceInit] 任务文件不存在，跳过清理');
				return;
			}

			// 提取待办任务
			const pendingTasks = this.extractPendingTasks(content);

			// 生成清理后的内容
			const cleanedContent = TASKS_CLEANED_TEMPLATE.replace(
				'{PENDING_TASKS}',
				pendingTasks.length > 0 ? pendingTasks.join('\n') : '- [ ]'
			);

			// 写回文件
			await vscode.workspace.fs.writeFile(
				tasksFileUri,
				Buffer.from(cleanedContent, 'utf-8')
			);

			this.logService.info(`[WorkspaceInit] 任务文件已清理，保留 ${pendingTasks.length} 个待办任务`);
		} catch (error) {
			this.logService.error('[WorkspaceInit] 任务文件清理失败', error);
		}
	}

	/**
	 * 从任务文件内容中提取待办任务
	 */
	private extractPendingTasks(content: string): string[] {
		const lines = content.split('\n');
		const pendingTasks: string[] = [];

		let inPendingSection = false;

		for (const line of lines) {
			// 检测待办区域开始
			if (line.trim() === '## 待办') {
				inPendingSection = true;
				continue;
			}

			// 检测其他区域开始（结束待办区域）
			if (line.startsWith('## ') && line.trim() !== '## 待办') {
				inPendingSection = false;
				continue;
			}

			// 在待办区域内，收集任务项
			if (inPendingSection) {
				const trimmed = line.trim();
				// 匹配未完成的任务项 - [ ]
				if (trimmed.startsWith('- [ ]') && trimmed.length > 5) {
					pendingTasks.push(line);
				}
			}
		}

		return pendingTasks;
	}
}
