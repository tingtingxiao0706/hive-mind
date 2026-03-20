# 工作区隔离

Hive-Mind 支持工作区（Workspace）隔离，不同工作区拥有独立的技能集、模型配置和安全策略。

## 使用场景

- 前端项目只允许 Node.js 脚本，后端项目允许 Python
- 不同租户使用不同的模型
- 测试环境和生产环境使用不同的安全级别

## 创建工作区

每个工作区是一个独立的 `HiveMind` 实例：

```typescript
import { createHiveMind } from '@ai-hivemind/core';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';

// 前端工作区
const frontend = createHiveMind({
  workspace: 'frontend',
  models: { default: openai('gpt-4o-mini') },
  skills: [{ type: 'local', path: './skills/frontend' }],
  scripts: {
    enabled: true,
    securityLevel: 'strict',
    allowedRuntimes: ['node'],
  },
});

// 后端工作区
const backend = createHiveMind({
  workspace: 'backend',
  models: { default: anthropic('claude-sonnet-4-20250514') },
  skills: [{ type: 'local', path: './skills/backend' }],
  scripts: {
    enabled: true,
    securityLevel: 'strict',
    allowedRuntimes: ['bash', 'python', 'node'],
  },
});
```

## 多租户架构

在 SaaS 场景下，为每个租户创建独立实例：

```typescript
const tenants = new Map<string, HiveMind>();

function getHive(userId: string, config: UserConfig) {
  if (!tenants.has(userId)) {
    tenants.set(userId, createHiveMind({
      workspace: userId,
      models: { default: getModelForUser(config) },
      skills: [{ type: 'local', path: './skills' }],
      scripts: {
        enabled: true,
        securityLevel: 'sandbox',
      },
    }));
  }
  return tenants.get(userId)!;
}
```

## 技能绑定工作区

技能可以通过 `x-hive.workspace` 声明只在特定工作区中可用：

```yaml
x-hive:
  workspace: backend
```

带有 `workspace` 声明的技能只会在对应的工作区实例中被加载。
