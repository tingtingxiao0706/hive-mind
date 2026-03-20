---
layout: home

hero:
  name: Hive-Mind
  text: AI Agent 按需技能加载引擎
  tagline: 通过 npm install 即可在任意 Node.js 应用中获得 OpenClaw 级别的技能系统能力
  image:
    src: /logo.svg
    alt: Hive-Mind
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 查看 API
      link: /api/create-hive-mind
    - theme: alt
      text: GitHub
      link: https://github.com/tingtingxiao0706/hive-mind

features:
  - icon: 🔄
    title: 渐进式加载
    details: 三阶段按需加载（发现 → 激活 → 执行），20 个技能的基线开销从 ~25,000 tokens 降到 ~500 tokens，50 个技能节省 96%。
  - icon: 🤖
    title: 模型切换
    details: 基于 Vercel AI SDK，支持 OpenAI / Anthropic / Google / OpenRouter 等 30+ 供应商，不同用户可用不同模型。
  - icon: 📋
    title: SKILL.md 兼容
    details: 完全兼容 Agent Skills 标准，通过 x-hive 扩展添加 Agent 模式、脚本配置、模型偏好等高级功能。
  - icon: ⚡
    title: 跨语言脚本执行
    details: 技能可包含 Python / Bash / Node.js 脚本，自动探测运行时，支持 PEP 723 内联依赖声明。
  - icon: 🔒
    title: 分层安全
    details: basic / strict / sandbox 三级安全模型，sandbox 级提供 V8 Isolate 沙箱、CPU/内存限制和 deny-by-default 权限。
  - icon: 🏢
    title: 工作区隔离
    details: 不同工作区独立配置技能集、模型和安全策略，天然支持多租户 SaaS 场景。
---
