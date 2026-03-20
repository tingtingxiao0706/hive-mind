import 'dotenv/config';
import express from 'express';
import { createHiveMind } from '@ai-hivemind/core';
import type { HiveMind } from '@ai-hivemind/core';
import { createOpenAI } from '@ai-sdk/openai';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');
const PORT = Number(process.env['PORT'] ?? 3000);

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env['OPENROUTER_API_KEY'],
});

// ---------------------------------------------------------------------------
// Multi-tenant: each user gets their own HiveMind instance with different models
// ---------------------------------------------------------------------------

const SKILL_SOURCES = [{ type: 'local' as const, path: SKILLS_DIR }];
const SCRIPT_CONFIG = {
  enabled: true,
  securityLevel: 'strict' as const,
  allowedRuntimes: ['node', 'python'],
  timeout: 10000,
};

function createUserHive(config: {
  label: string;
  defaultModel: string;
  smartModel: string;
}): HiveMind {
  console.log(`  Creating HiveMind for "${config.label}": default=${config.defaultModel}, smart=${config.smartModel}`);
  return createHiveMind({
    models: {
      default: openrouter(config.defaultModel),
      smart: openrouter(config.smartModel),
    },
    skills: SKILL_SOURCES,
    loading: { strategy: 'progressive', maxActivatedSkills: 3 },
    scripts: SCRIPT_CONFIG,
    logLevel: 'debug',
  });
}

const tenants: Record<string, { hive: HiveMind; label: string; models: { default: string; smart: string } }> = {
  userA: {
    hive: createUserHive({ label: 'User A', defaultModel: 'stepfun/step-3.5-flash:free', smartModel: 'stepfun/step-3.5-flash:free' }),
    label: 'stepfun/step-3.5-flash:free',
    models: { default: 'stepfun/step-3.5-flash:free', smart: 'stepfun/step-3.5-flash:free' },
  },
  userB: {
    hive: createUserHive({ label: 'User B', defaultModel: 'nvidia/nemotron-3-super-120b-a12b:free', smartModel: 'nvidia/nemotron-3-super-120b-a12b:free' }),
    label: 'User B — Anthropic Claude 3.5 Haiku',
    models: { default: 'nvidia/nemotron-3-super-120b-a12b:free', smart: 'nvidia/nemotron-3-super-120b-a12b:free' },
  },
  userC: {
    hive: createUserHive({ label: 'User C', defaultModel: 'arcee-ai/trinity-large-preview:free', smartModel: 'arcee-ai/trinity-large-preview:free' }),
    label: 'User C — Google Gemini 2.0 Flash',
    models: { default: 'arcee-ai/trinity-large-preview:free', smart: 'arcee-ai/trinity-large-preview:free' },
  },
};

function getTenant(userId?: string) {
  return tenants[userId ?? 'userA'] ?? tenants['userA'];
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

app.get('/', (_req, res) => {
  res.type('html').send(HTML_PAGE);
});

app.get('/api/tenants', (_req, res) => {
  res.json(Object.entries(tenants).map(([id, t]) => ({
    id,
    label: t.label,
    models: t.models,
  })));
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, model, skills, userId } = req.body as {
      message?: string;
      model?: string;
      skills?: string[];
      userId?: string;
    };

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const tenant = getTenant(userId);
    console.log(`\n========== [${tenant.label}] ==========`);

    const result = await tenant.hive.run({ message, model, skills });

    res.json({
      text: result.text,
      activatedSkills: result.activatedSkills,
      usage: result.usage,
      tenant: tenant.label,
    });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Internal error',
    });
  }
});

app.get('/api/skills', async (req, res) => {
  const tenant = getTenant(req.query['userId'] as string);
  const skills = await tenant.hive.list();
  res.json(skills.map(s => ({
    name: s.name,
    description: s.description,
  })));
});

app.listen(PORT, () => {
  console.log(`
┌──────────────────────────────────────────────────────┐
│  Hive-Mind Multi-Tenant Demo                         │
│  http://localhost:${PORT}                                │
├──────────────────────────────────────────────────────┤
│  User A: OpenAI GPT-4o-mini                          │
│  User B: Anthropic Claude 3.5 Haiku                  │
│  User C: Google Gemini 2.0 Flash                     │
├──────────────────────────────────────────────────────┤
│  POST /api/chat     - Chat (with userId)             │
│  GET  /api/tenants  - List tenants                   │
│  GET  /api/skills   - List skills                    │
└──────────────────────────────────────────────────────┘
`);
});

// ---------------------------------------------------------------------------
// Embedded HTML page with user switcher
// ---------------------------------------------------------------------------

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Hive-Mind Multi-Tenant Demo</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0a0a0a; color: #e0e0e0;
      min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      padding: 2rem;
    }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #fff; }
    .subtitle { color: #888; margin-bottom: 1.5rem; font-size: 0.9rem; }
    .container { width: 100%; max-width: 720px; }

    .user-bar {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;
    }
    .user-btn {
      background: #1a1a2e; border: 1px solid #333; padding: 0.5rem 1rem;
      border-radius: 8px; font-size: 0.85rem; cursor: pointer; transition: all 0.2s;
      color: #ccc;
    }
    .user-btn:hover { border-color: #6c63ff; color: #fff; }
    .user-btn.active { background: #6c63ff; border-color: #6c63ff; color: #fff; }
    .user-btn .model-name { display: block; font-size: 0.7rem; color: #999; margin-top: 2px; }
    .user-btn.active .model-name { color: #ddd; }

    .skills-bar {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;
    }
    .skill-tag {
      background: #1a1a2e; border: 1px solid #333; padding: 0.3rem 0.7rem;
      border-radius: 999px; font-size: 0.8rem; cursor: pointer; transition: all 0.2s;
    }
    .skill-tag:hover { border-color: #6c63ff; color: #fff; }
    .skill-tag.active { background: #6c63ff; border-color: #6c63ff; color: #fff; }

    .input-area { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
    textarea {
      flex: 1; background: #111; border: 1px solid #333; color: #e0e0e0;
      padding: 0.75rem; border-radius: 8px; font-size: 0.95rem;
      resize: vertical; min-height: 60px; font-family: inherit;
    }
    textarea:focus { outline: none; border-color: #6c63ff; }
    button#send {
      background: #6c63ff; color: #fff; border: none; padding: 0 1.5rem;
      border-radius: 8px; cursor: pointer; font-size: 0.95rem; font-weight: 500;
    }
    button#send:hover { background: #5a52d5; }
    button#send:disabled { background: #333; cursor: not-allowed; }
    .output {
      background: #111; border: 1px solid #222; border-radius: 8px;
      padding: 1.25rem; min-height: 120px; white-space: pre-wrap;
      line-height: 1.6; font-size: 0.95rem;
    }
    .meta { margin-top: 0.75rem; font-size: 0.8rem; color: #666; }
    .meta span { margin-right: 1rem; }
    .loading { color: #6c63ff; }
  </style>
</head>
<body>
  <h1>Hive-Mind Multi-Tenant Demo</h1>
  <p class="subtitle">同一平台，不同用户使用不同模型 — 切换用户查看效果</p>

  <div class="container">
    <div class="user-bar" id="user-bar">Loading tenants...</div>
    <div class="skills-bar" id="skills-bar">Loading skills...</div>

    <div class="input-area">
      <textarea id="input" placeholder="输入你的问题... 例如：翻译成英文：今天天气真好"></textarea>
      <button id="send" onclick="send()">发送</button>
    </div>

    <div class="output" id="output">选择用户身份，输入问题，观察不同模型的回复差异</div>
    <div class="meta" id="meta"></div>
  </div>

  <script>
    let currentUser = 'userA';
    let selectedSkills = [];
    let tenantsData = [];

    async function loadTenants() {
      const res = await fetch('/api/tenants');
      tenantsData = await res.json();
      renderUsers();
    }

    function renderUsers() {
      const bar = document.getElementById('user-bar');
      bar.innerHTML = tenantsData.map(t =>
        '<div class="user-btn' + (t.id === currentUser ? ' active' : '') + '" onclick="switchUser(\\'' + t.id + '\\')">' +
          t.label.split(' — ')[0] +
          '<span class="model-name">' + t.models.default + '</span>' +
        '</div>'
      ).join('');
    }

    function switchUser(id) {
      currentUser = id;
      renderUsers();
      const t = tenantsData.find(t => t.id === id);
      document.getElementById('meta').innerHTML = '<span>已切换到: ' + (t ? t.label : id) + '</span>';
    }

    async function loadSkills() {
      const res = await fetch('/api/skills');
      const skills = await res.json();
      const bar = document.getElementById('skills-bar');
      bar.innerHTML = skills.map(s =>
        '<span class="skill-tag" onclick="toggleSkill(this, \\'' + s.name + '\\')" title="' + s.description + '">' + s.name + '</span>'
      ).join('');
    }

    function toggleSkill(el, name) {
      el.classList.toggle('active');
      if (selectedSkills.includes(name)) {
        selectedSkills = selectedSkills.filter(s => s !== name);
      } else {
        selectedSkills.push(name);
      }
    }

    async function send() {
      const input = document.getElementById('input');
      const output = document.getElementById('output');
      const meta = document.getElementById('meta');
      const btn = document.getElementById('send');
      const message = input.value.trim();
      if (!message) return;

      btn.disabled = true;
      output.textContent = '思考中...';
      output.classList.add('loading');
      meta.innerHTML = '';

      try {
        const body = { message, userId: currentUser };
        if (selectedSkills.length > 0) body.skills = selectedSkills;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        output.classList.remove('loading');

        if (data.error) {
          output.textContent = 'Error: ' + data.error;
        } else {
          output.textContent = data.text;
          meta.innerHTML =
            '<span>Tenant: ' + (data.tenant || '') + '</span>' +
            '<span>Skills: ' + (data.activatedSkills?.join(', ') || 'none') + '</span>' +
            (data.usage ? '<span>Tokens: ' + data.usage.totalTokens + '</span>' : '');
        }
      } catch (err) {
        output.classList.remove('loading');
        output.textContent = 'Error: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    }

    document.getElementById('input').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });

    loadTenants();
    loadSkills();
  </script>
</body>
</html>`;
