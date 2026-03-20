# Express 集成

## 基础集成

```typescript
import express from 'express';
import { createHiveMind } from '@ai-hivemind/core';
import { openai } from '@ai-sdk/openai';

const app = express();
app.use(express.json());

const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});

// 同步调用
app.post('/api/chat', async (req, res) => {
  const result = await hive.run({
    message: req.body.message,
  });
  res.json({
    text: result.text,
    skills: result.activatedSkills,
    usage: result.usage,
  });
});

// 流式调用
app.post('/api/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Transfer-Encoding', 'chunked');

  const stream = await hive.stream({
    message: req.body.message,
  });

  for await (const chunk of stream) {
    res.write(chunk);
  }
  res.end();
});

// 技能列表
app.get('/api/skills', async (_req, res) => {
  const skills = await hive.list();
  res.json(skills);
});

// 技能搜索
app.get('/api/skills/search', async (req, res) => {
  const query = req.query.q as string;
  const results = await hive.search(query);
  res.json(results);
});

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

## 多租户示例

```typescript
import { createOpenAI } from '@ai-sdk/openai';

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
});

const tenants: Record<string, ReturnType<typeof createHiveMind>> = {
  userA: createHiveMind({
    models: { default: openrouter('openai/gpt-4o-mini') },
    skills: [{ type: 'local', path: './skills' }],
  }),
  userB: createHiveMind({
    models: { default: openrouter('anthropic/claude-3.5-haiku') },
    skills: [{ type: 'local', path: './skills' }],
  }),
};

app.post('/api/chat', async (req, res) => {
  const { userId, message } = req.body;
  const hive = tenants[userId];
  if (!hive) return res.status(404).json({ error: 'Unknown user' });

  const result = await hive.run({ message });
  res.json({ text: result.text, skills: result.activatedSkills });
});
```
