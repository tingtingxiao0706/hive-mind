# Next.js 集成

## App Router (Route Handler)

```typescript
// app/api/chat/route.ts
import { createHiveMind } from 'hive-mind';
import { openai } from '@ai-sdk/openai';

const hive = createHiveMind({
  models: { default: openai('gpt-4o') },
  skills: [{ type: 'local', path: './skills' }],
});

export async function POST(req: Request) {
  const { message } = await req.json();

  const result = await hive.run({ message });

  return Response.json({
    text: result.text,
    skills: result.activatedSkills,
    usage: result.usage,
  });
}
```

## 流式响应

```typescript
// app/api/stream/route.ts
export async function POST(req: Request) {
  const { message } = await req.json();

  const stream = await hive.stream({ message });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    },
  );
}
```

## 技能列表 API

```typescript
// app/api/skills/route.ts
export async function GET() {
  const skills = await hive.list();
  return Response.json(skills);
}
```

## 与 Vercel AI SDK useChat 配合

如果你使用 `ai/react` 的 `useChat`，可以让 Hive-Mind 在 API 端处理技能逻辑，前端保持标准 chat 界面：

```tsx
// app/page.tsx
'use client';
import { useChat } from 'ai/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat',
  });

  return (
    <div>
      {messages.map(m => (
        <div key={m.id}>{m.content}</div>
      ))}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
```

::: tip
Hive-Mind 实例应在模块级别创建（而非在请求处理函数内），以利用技能索引缓存，避免每次请求重新扫描。
:::
