import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Hive-Mind',
  description: 'AI Agent 按需技能加载引擎',
  lang: 'zh-CN',
  base: '/hive-mind/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/hive-mind/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: '指南', link: '/guide/introduction', activeMatch: '/guide/' },
      { text: 'API', link: '/api/create-hive-mind', activeMatch: '/api/' },
      { text: '进阶', link: '/advanced/architecture', activeMatch: '/advanced/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: '入门',
          items: [
            { text: '简介', link: '/guide/introduction' },
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '核心概念', link: '/guide/core-concepts' },
          ],
        },
        {
          text: '使用指南',
          items: [
            { text: '编写技能', link: '/guide/writing-skills' },
            { text: '模型切换', link: '/guide/models' },
            { text: '脚本执行', link: '/guide/scripts' },
            { text: '安全模型', link: '/guide/security' },
            { text: '工作区隔离', link: '/guide/workspaces' },
          ],
        },
        {
          text: '集成',
          items: [
            { text: 'Express', link: '/guide/integration-express' },
            { text: 'Next.js', link: '/guide/integration-nextjs' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: 'createHiveMind', link: '/api/create-hive-mind' },
            { text: 'HiveMindConfig', link: '/api/config' },
            { text: 'run / stream', link: '/api/run-stream' },
            { text: '类型定义', link: '/api/types' },
          ],
        },
      ],
      '/advanced/': [
        {
          text: '进阶',
          items: [
            { text: '架构方案', link: '/advanced/architecture' },
            { text: '竞品分析', link: '/advanced/competitive-analysis' },
            { text: 'OpenClaw 对比', link: '/advanced/openclaw-comparison' },
            { text: '测试与验证', link: '/advanced/testing' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/tingtingxiao0706/hive-mind' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026',
    },

    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
      label: '目录',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    lastUpdated: {
      text: '最后更新',
    },

    returnToTopLabel: '返回顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '深色模式',
  },
});
