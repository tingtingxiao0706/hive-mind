# run / stream

## hive.run(options)

同步执行技能调用，返回完整结果。

### 签名

```typescript
async run(options: RunOptions): Promise<RunResult>
```

### RunOptions

```typescript
interface RunOptions {
  message: string;
  model?: string;
  skills?: string[];
  systemPrompt?: string;
  maxTokens?: number;
}
```

| 字段 | 必需 | 说明 |
|------|------|------|
| `message` | 是 | 用户消息 |
| `model` | 否 | 使用的模型 key（默认 `'default'`） |
| `skills` | 否 | 显式指定技能列表（跳过路由） |
| `systemPrompt` | 否 | 额外的 system prompt |
| `maxTokens` | 否 | 最大 completion tokens |

### RunResult

```typescript
interface RunResult {
  text: string;
  activatedSkills: string[];
  toolCalls: ToolCallRecord[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

| 字段 | 说明 |
|------|------|
| `text` | LLM 的文本响应 |
| `activatedSkills` | 被激活的技能名称列表 |
| `toolCalls` | 工具调用记录 |
| `usage` | Token 用量统计 |

### 示例

```typescript
// 自动路由
const result = await hive.run({
  message: '翻译成英文：你好世界',
});

// 显式指定技能
const result = await hive.run({
  message: '翻译成英文：你好世界',
  skills: ['translator'],
  model: 'fast',
});

// 自定义 system prompt
const result = await hive.run({
  message: '分析这段代码',
  systemPrompt: '你是一位资深的安全工程师。',
  maxTokens: 2048,
});
```

---

## hive.stream(options)

流式技能调用，返回异步可迭代对象。

### 签名

```typescript
async stream(options: StreamOptions): Promise<AsyncIterable<string>>
```

### StreamOptions

继承 `RunOptions`，额外支持：

```typescript
interface StreamOptions extends RunOptions {
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void;
  onScriptOutput?: (output: ScriptOutput) => void;
}
```

| 字段 | 说明 |
|------|------|
| `onToolCall` | 工具调用时的回调 |
| `onScriptOutput` | 脚本执行完成时的回调 |

### 示例

```typescript
const stream = await hive.stream({
  message: '帮我审查这段代码',
  onToolCall: (name, args) => {
    console.log(`调用工具: ${name}`, args);
  },
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

---

## hive.list()

列出所有已注册技能的元数据。

```typescript
async list(): Promise<SkillMeta[]>
```

```typescript
const skills = await hive.list();
// [
//   { name: 'translator', description: 'Translate text...', path: '...' },
//   { name: 'summarizer', description: 'Summarize text...', path: '...' },
// ]
```

---

## hive.search(query)

按关键词搜索技能。

```typescript
async search(query: string): Promise<Array<{ skill: SkillMeta; score: number }>>
```

```typescript
const results = await hive.search('代码审查');
// [
//   { skill: { name: 'code-reviewer', ... }, score: 0.42 },
// ]
```

---

## hive.runtimeStatus()

检查系统运行时状态。需要 `scripts.enabled: true`。

```typescript
async runtimeStatus(): Promise<RuntimeStatus>
```

```typescript
const status = await hive.runtimeStatus();
// {
//   bash:   { available: true,  version: '5.2.15', command: 'bash' },
//   python: { available: true,  version: '3.12.1', command: 'python3' },
//   node:   { available: true,  version: '20.11.0', command: 'node' },
// }
```
