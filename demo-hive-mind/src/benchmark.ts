/**
 * Token Consumption Benchmark: Traditional (Eager) vs Progressive Loading
 *
 * Fair head-to-head comparison:
 *   - Traditional: Force load ALL skills into context for every query
 *   - Progressive: Only load matched skills (Hive-Mind default)
 *
 * Both modes use the SAME model and SAME queries, both get real API token counts.
 * Skill chaining (call_skill) is disabled to isolate the loading strategy difference.
 *
 * Usage: npx tsx src/benchmark.ts
 */
import 'dotenv/config';
import { createHiveMind } from 'hive-mind';
import { createOpenAI } from '@ai-sdk/openai';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env['OPENROUTER_API_KEY'],
});

const MODEL = 'stepfun/step-3.5-flash:free';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAllSkillNames(): Promise<string[]> {
  const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

async function measureAllSkillsBody(): Promise<{ totalChars: number; totalEstTokens: number; details: { name: string; chars: number; tokens: number }[] }> {
  const skillDirs = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
  const details: { name: string; chars: number; tokens: number }[] = [];
  let totalChars = 0;

  for (const dir of skillDirs) {
    if (!dir.isDirectory()) continue;
    const skillPath = path.join(SKILLS_DIR, dir.name, 'SKILL.md');
    try {
      const content = await fs.readFile(skillPath, 'utf-8');
      const bodyMatch = content.match(/^---[\s\S]*?---\s*([\s\S]*)$/);
      const body = bodyMatch ? bodyMatch[1].trim() : content;
      details.push({ name: dir.name, chars: body.length, tokens: Math.ceil(body.length / 4) });
      totalChars += body.length;
    } catch {
      // skip
    }
  }

  return { totalChars, totalEstTokens: Math.ceil(totalChars / 4), details };
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test queries — simple direct queries, no orchestration
// ---------------------------------------------------------------------------

const TEST_QUERIES = [
  { msg: '翻译成英文：今天天气真好，适合出去走走', label: '翻译任务' },
  { msg: '帮我审查这段代码有没有安全漏洞：function login(user, pass) { db.query("SELECT * FROM users WHERE name=\'" + user + "\'") }', label: '代码审查' },
  { msg: '总结以下内容的核心要点：Kubernetes 是一个开源容器编排平台，用于自动化部署、扩展和管理容器化应用程序。', label: '内容总结' },
  { msg: '分析这段文本的字数和结构', label: '文本分析' },
  { msg: '帮我格式化这个JSON：{"name":"alice","age":30,"skills":["go","rust","typescript"]}', label: 'JSON处理' },
];

// ---------------------------------------------------------------------------
// Main benchmark
// ---------------------------------------------------------------------------

async function runBenchmark() {
  const allSkillNames = await getAllSkillNames();
  const skillStats = await measureAllSkillsBody();

  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║  Token Consumption Benchmark: Traditional vs Progressive Loading   ║');
  console.log('╚' + '═'.repeat(68) + '╝');

  console.log(`\nModel: ${MODEL}`);
  console.log(`Skills directory: ${SKILLS_DIR}`);
  console.log(`Total skills: ${allSkillNames.length}`);

  // Print skill inventory
  console.log('\n┌─ Skill Inventory ─────────────────────────────────────────────┐');
  console.log(`│  ${'Skill'.padEnd(22)} ${'Body Chars'.padStart(10)} ${'Est. Tokens'.padStart(12)}  │`);
  console.log('│  ' + '─'.repeat(46) + '  │');
  for (const s of skillStats.details) {
    console.log(`│  ${s.name.padEnd(22)} ${String(s.chars).padStart(10)} ${String(s.tokens).padStart(12)}  │`);
  }
  console.log('│  ' + '─'.repeat(46) + '  │');
  console.log(`│  ${'TOTAL'.padEnd(22)} ${String(skillStats.totalChars).padStart(10)} ${String(skillStats.totalEstTokens).padStart(12)}  │`);
  console.log('└' + '─'.repeat(64) + '┘');

  // Create two HiveMind instances
  const baseConfig = {
    models: { default: openrouter(MODEL) },
    skills: [{ type: 'local' as const, path: SKILLS_DIR }],
    logLevel: 'warn' as const,
    maxCallDepth: 0, // disable skill chaining for fair comparison
  };

  const hiveProgressive = createHiveMind({
    ...baseConfig,
    loading: { strategy: 'progressive' as const, maxActivatedSkills: 3 },
  });

  const hiveTraditional = createHiveMind({
    ...baseConfig,
    loading: { strategy: 'progressive' as const, maxActivatedSkills: 999 },
  });

  console.log('\n╔' + '═'.repeat(68) + '╗');
  console.log('║  Running Queries                                                  ║');
  console.log('╚' + '═'.repeat(68) + '╝');

  interface QueryResult {
    label: string;
    tradPrompt: number;
    tradCompletion: number;
    tradTotal: number;
    tradSkills: string[];
    progPrompt: number;
    progCompletion: number;
    progTotal: number;
    progSkills: string[];
    saved: number;
    savedPct: string;
  }

  const results: QueryResult[] = [];

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const q = TEST_QUERIES[i]!;
    console.log(`\n── Query ${i + 1}/${TEST_QUERIES.length}: ${q.label} ──`);
    console.log(`   "${q.msg.slice(0, 60)}${q.msg.length > 60 ? '...' : ''}"`);

    try {
      // Traditional: force load ALL skills
      console.log('   [Traditional] Loading all skills...');
      const tradResult = await hiveTraditional.run({
        message: q.msg,
        skills: allSkillNames,
      });
      const tradP = tradResult.usage?.promptTokens ?? 0;
      const tradC = tradResult.usage?.completionTokens ?? 0;
      const tradT = tradResult.usage?.totalTokens ?? 0;
      console.log(`   [Traditional] prompt=${tradP}, completion=${tradC}, total=${tradT}, skills=[${tradResult.activatedSkills.join(', ')}]`);

      await delay(2000); // rate limit buffer

      // Progressive: only matched skills
      console.log('   [Progressive] Router selects skills...');
      const progResult = await hiveProgressive.run({
        message: q.msg,
      });
      const progP = progResult.usage?.promptTokens ?? 0;
      const progC = progResult.usage?.completionTokens ?? 0;
      const progT = progResult.usage?.totalTokens ?? 0;
      console.log(`   [Progressive] prompt=${progP}, completion=${progC}, total=${progT}, skills=[${progResult.activatedSkills.join(', ')}]`);

      const saved = tradT - progT;
      const savedPct = tradT > 0 ? ((saved / tradT) * 100).toFixed(1) : '0.0';
      console.log(`   => Saved: ${saved} tokens (${savedPct}%)`);

      results.push({
        label: q.label,
        tradPrompt: tradP, tradCompletion: tradC, tradTotal: tradT,
        tradSkills: tradResult.activatedSkills,
        progPrompt: progP, progCompletion: progC, progTotal: progT,
        progSkills: progResult.activatedSkills,
        saved,
        savedPct,
      });

      await delay(2000);
    } catch (err) {
      console.log(`   ERROR: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Summary
  console.log('\n╔' + '═'.repeat(68) + '╗');
  console.log('║  RESULTS SUMMARY                                                  ║');
  console.log('╚' + '═'.repeat(68) + '╝');

  const totalTrad = results.reduce((s, r) => s + r.tradTotal, 0);
  const totalProg = results.reduce((s, r) => s + r.progTotal, 0);
  const totalTradPrompt = results.reduce((s, r) => s + r.tradPrompt, 0);
  const totalProgPrompt = results.reduce((s, r) => s + r.progPrompt, 0);
  const totalSaved = totalTrad - totalProg;
  const totalSavedPct = totalTrad > 0 ? ((totalSaved / totalTrad) * 100).toFixed(1) : '0.0';

  console.log(`\n  Prompt token comparison (system prompt = skill content size):`);
  console.log(`    Traditional total prompt tokens: ${totalTradPrompt}`);
  console.log(`    Progressive total prompt tokens: ${totalProgPrompt}`);
  console.log(`    Prompt tokens saved: ${totalTradPrompt - totalProgPrompt} (${totalTradPrompt > 0 ? (((totalTradPrompt - totalProgPrompt) / totalTradPrompt) * 100).toFixed(1) : 0}%)`);

  console.log(`\n  Overall token comparison (prompt + completion):`);
  console.log(`    Traditional total: ${totalTrad}`);
  console.log(`    Progressive total: ${totalProg}`);
  console.log(`    Total saved: ${totalSaved} (${totalSavedPct}%)`);

  console.log('\n┌─ Per-Query Detail ─────────────────────────────────────────────┐');
  console.log(`│  ${'Query'.padEnd(14)} ${'Trad.Prompt'.padStart(11)} ${'Prog.Prompt'.padStart(11)} ${'Trad.Total'.padStart(10)} ${'Prog.Total'.padStart(10)} ${'Saved%'.padStart(7)} │`);
  console.log('│  ' + '─'.repeat(61) + ' │');
  for (const r of results) {
    console.log(`│  ${r.label.padEnd(14)} ${String(r.tradPrompt).padStart(11)} ${String(r.progPrompt).padStart(11)} ${String(r.tradTotal).padStart(10)} ${String(r.progTotal).padStart(10)} ${(r.savedPct + '%').padStart(7)} │`);
  }
  console.log('│  ' + '─'.repeat(61) + ' │');
  console.log(`│  ${'TOTAL'.padEnd(14)} ${String(totalTradPrompt).padStart(11)} ${String(totalProgPrompt).padStart(11)} ${String(totalTrad).padStart(10)} ${String(totalProg).padStart(10)} ${(totalSavedPct + '%').padStart(7)} │`);
  console.log('└' + '─'.repeat(64) + '┘');

  // Scale projection
  console.log('\n┌─ Scaling Projection ───────────────────────────────────────────┐');
  console.log('│  If you had N skills, each ~170 tokens avg body:               │');
  console.log('│  Progressive typically activates 1-3 skills per query.          │');
  console.log(`│  ${'Skills'.padStart(8)} ${'Trad.Prompt/req'.padStart(16)} ${'Prog.Prompt/req'.padStart(16)} ${'Saving/req'.padStart(12)} │`);
  console.log('│  ' + '─'.repeat(54) + ' │');
  const avgActivated = results.length > 0
    ? results.reduce((s, r) => s + r.progSkills.length, 0) / results.length
    : 2;
  const avgBodyTokens = skillStats.totalEstTokens / skillStats.details.length;
  for (const n of [10, 20, 50, 100, 200]) {
    const tradBase = Math.round(n * avgBodyTokens);
    const progBase = Math.round(avgActivated * avgBodyTokens);
    const saving = tradBase - progBase;
    const savingPct = ((saving / tradBase) * 100).toFixed(0);
    console.log(`│  ${String(n).padStart(8)} ${String(tradBase).padStart(16)} ${String(progBase).padStart(16)} ${(saving + ' (' + savingPct + '%)').padStart(12)} │`);
  }
  console.log('└' + '─'.repeat(64) + '┘');
  console.log('\n  Conclusion: Progressive loading savings scale linearly with skill count.');
  console.log('  The more skills registered, the greater the per-request savings.\n');
}

runBenchmark().catch(console.error);
