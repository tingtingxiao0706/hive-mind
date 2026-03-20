# 快速开始

## 安装

```bash
npm install hive-mind ai @ai-sdk/openai
```

Hive-Mind 依赖 [Vercel AI SDK](https://sdk.vercel.ai/docs)，LLM Provider 包是 peer dependency，按需安装。

## 5 分钟上手

### 1. 创建技能

创建 `skills/translator/SKILL.md`：

```markdown
---
name: translator
description: Translate text between languages
metadata:
  tags: [translate, i18n, multilingual]
---

# Translator

Translate the user's text to the requested target language.
Keep the original formatting and tone.
```

### 2. 编写代码

```typescript
import { createHiveMind } from 'hive-mind';
import { openai } from '@ai-sdk/openai';

const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});

// 自动路由到 translator 技能
const result = await hive.run({
  message: '翻译成英文：今天天气真好',
});

console.log(result.text);
console.log(result.activatedSkills); // ['translator']
console.log(result.usage);          // { promptTokens: 461, ... }
```

### 3. 流式输出

```typescript
const stream = await hive.stream({
  message: '翻译成日文：你好世界',
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
}
```

## 环境变量

```bash
# .env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxx
```

Vercel AI SDK Provider 自动从对应的环境变量中读取 API Key，无需在代码中硬编码。

## 使用 OpenRouter

如果想通过 OpenRouter 访问多种模型：

```bash
npm install @ai-sdk/openai
```

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const hive = createHiveMind({
  models: {
    default: openrouter('openai/gpt-4o-mini'),
    reasoning: openrouter('anthropic/claude-sonnet-4-20250514'),
  },
  skills: [{ type: 'local', path: './skills' }],
});
```

## 下一步

- [核心概念](/guide/core-concepts) — 理解三阶段渐进式加载
- [编写技能](/guide/writing-skills) — 学习 SKILL.md 格式和 x-hive 扩展
- [API 参考](/api/create-hive-mind) — 完整配置选项
