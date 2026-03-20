# 模型切换

Hive-Mind 基于 [Vercel AI SDK](https://sdk.vercel.ai/docs) 构建，天然支持 30+ LLM 供应商。

## 配置多模型

```typescript
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';

const hive = createHiveMind({
  models: {
    default: openai('gpt-4o'),
    fast: openai('gpt-4o-mini'),
    reasoning: anthropic('claude-sonnet-4-20250514'),
    vision: google('gemini-2.0-flash'),
  },
  skills: [{ type: 'local', path: './skills' }],
});
```

## 按需选择模型

```typescript
// 使用快速模型
await hive.run({ message: '快速翻译', model: 'fast' });

// 使用推理模型
await hive.run({ message: '分析代码架构', model: 'reasoning' });
```

## 技能声明模型偏好

在 SKILL.md 中通过 `x-hive.models` 声明：

```yaml
x-hive:
  models:
    preferred: reasoning    # 首选模型
    fallback: default       # 备选模型
```

当技能被激活时，引擎会自动选择技能声明的首选模型。

## 多租户模型切换

不同用户可以使用不同的模型 — 为每个用户创建独立的 HiveMind 实例：

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

// 用户 A 偏好 GPT
const hiveUserA = createHiveMind({
  models: { default: openrouter('openai/gpt-4o-mini') },
  skills: [{ type: 'local', path: './skills' }],
});

// 用户 B 偏好 Claude
const hiveUserB = createHiveMind({
  models: { default: openrouter('anthropic/claude-3.5-haiku') },
  skills: [{ type: 'local', path: './skills' }],
});
```

## 支持的 Provider

| Provider | 包名 | 环境变量 |
|----------|------|---------|
| OpenAI | `@ai-sdk/openai` | `OPENAI_API_KEY` |
| Anthropic | `@ai-sdk/anthropic` | `ANTHROPIC_API_KEY` |
| Google | `@ai-sdk/google` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Azure OpenAI | `@ai-sdk/azure` | `AZURE_OPENAI_API_KEY` |
| Mistral | `@ai-sdk/mistral` | `MISTRAL_API_KEY` |
| DeepSeek | `@ai-sdk/deepseek` | `DEEPSEEK_API_KEY` |
| OpenRouter | `@ai-sdk/openai`（自定义 baseURL） | `OPENROUTER_API_KEY` |

所有 Provider 均为 `peerDependencies`，按需安装即可。
