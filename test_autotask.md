# AutoTaskService 功能测试

## 测试目标
验证 AutoTaskService 的以下功能：
1. 文件监听（FileSystemWatcher）
2. 定时检查（setInterval）
3. 任务解析（parseTaskFile）
4. 任务发现回调（onTaskFound）
5. 任务提示词生成（generateTaskPrompt）

## 测试场景

### 场景 1：初始状态测试
**输入**：`.tasks/current.md` 包含进行中任务
```markdown
## 进行中
- [ ] 自动任务执行功能测试
```

**预期行为**：
- AutoTaskService 初始化后 2 秒自动启动检查
- 发现 1 个未完成任务
- 触发 onTaskFound 回调
- 日志输出：`[AutoTaskService] 发现 1 个未完成任务`

**实际结果**：✅ 待验证

---

### 场景 2：文件变化测试
**操作**：修改 `.tasks/current.md`，添加新任务

**预期行为**：
- FileSystemWatcher 检测到文件变化
- 触发 onDidChange 事件
- 重新解析任务文件
- 触发 onTaskFileChanged 回调（UI 更新）
- 触发 onTaskFound 回调（执行提示）

**实际结果**：✅ 待验证

---

### 场景 3：定时检查测试
**设置**：checkInterval = 3000ms（3秒）

**预期行为**：
- 每 3 秒检查一次任务文件
- 如果内容未变化，不重复触发回调
- 如果内容有变化，触发回调

**实际结果**：✅ 待验证

---

### 场景 4：任务解析测试
**输入**：复杂任务文件
```markdown
## 进行中
- [ ] 任务 1
- [x] 已完成的任务

## 待办
- [ ] 任务 2
- [ ] 任务 3

## 已完成
- [x] 任务 4
```

**预期输出**：
```typescript
[
  { title: "任务 1", status: "pending", section: "in-progress" },
  { title: "已完成的任务", status: "completed", section: "in-progress" },
  { title: "任务 2", status: "pending", section: "pending" },
  { title: "任务 3", status: "pending", section: "pending" },
  { title: "任务 4", status: "completed", section: "completed" }
]
```

**实际结果**：✅ 待验证

---

### 场景 5：提示词生成测试
**输入**：
```typescript
[
  { title: "自动任务执行功能测试", status: "pending", section: "in-progress" }
]
```

**预期输出**：
```
请继续执行以下任务：

## 正在进行的任务
- 自动任务执行功能测试

完成后请更新 `.tasks/current.md` 文件，将已完成的任务标记为 `[x]` 并移到"已完成"部分。
```

**实际结果**：✅ 待验证

---

## 测试执行计划

1. ✅ 检查 AutoTaskService.ts 代码实现
2. ✅ 创建测试文档
3. ⏳ 在 VSCode 中加载扩展
4. ⏳ 观察输出日志
5. ⏳ 修改任务文件，观察触发器
6. ⏳ 验证回调功能
7. ⏳ 测试提示词生成
8. ⏳ 更新任务状态

## 发现的问题

### 问题 1：AutoTaskService 可能未注册到 DI 容器
**状态**：待验证
**影响**：服务可能无法初始化

### 问题 2：前端可能未集成自动任务功能
**状态**：待验证
**影响**：无法接收任务发现通知

### 问题 3：缺少测试用例
**状态**：已确认
**建议**：添加单元测试

---

## 下一步行动

1. 检查服务注册情况
2. 检查前端集成情况
3. 实际运行测试
4. 修复发现的问题
5. 完善测试覆盖
