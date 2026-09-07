// 本草·局 后端 —— 单 Hono 服务托管 API + 静态 dist/。
// 端口 3000。dev: vite 5173 代理 /api → 3000；prod: 直接 serve dist/。
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CronJob } from 'cron';
import { FENGHAN_BIAOSHI } from '../data/bosses.js';
import { mentorHintLocal, mentorHintZhida } from './mentor.js';
import { generateBoss } from './gen-boss.js';
import type { Formula, BossCard } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const TODAY_BOSS = path.join(ROOT, 'data', 'today-boss.json');
const DIST = path.join(ROOT, 'dist');

const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true }));

// GET /api/today-boss → { boss, log?, fallback }
// 缓存不存在或解析失败 → 教学关兜底，永不 5xx。
app.get('/api/today-boss', async (c) => {
  try {
    const raw = await readFile(TODAY_BOSS, 'utf8');
    const parsed = JSON.parse(raw) as { boss: BossCard; log?: unknown };
    return c.json({ boss: parsed.boss, log: parsed.log ?? null, fallback: false });
  } catch {
    return c.json({ boss: FENGHAN_BIAOSHI, log: null, fallback: true });
  }
});

// POST /api/ask-mentor  body: { formula, boss, feedback? } → { hint, source }
// 直答失败/超限 → 本地规则兜底，永不抛 5xx。
app.post('/api/ask-mentor', async (c) => {
  let body: { formula?: Formula; boss?: BossCard; feedback?: string[] };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ hint: '请先组方再问太医院。', source: 'local' as const });
  }
  const formula = body.formula ?? {};
  const boss = body.boss ?? FENGHAN_BIAOSHI;
  const feedback = body.feedback ?? [];
  // ponytail: 直答优先升级；任意失败即本地兜底——本地规则覆盖全部缺位场景，足够 demo。
  try {
    const hint = await mentorHintZhida(formula, boss, feedback);
    return c.json({ hint, source: 'zhida' as const });
  } catch {
    return c.json({ hint: mentorHintLocal(formula, boss), source: 'local' as const });
  }
});

// POST /api/regen-boss  手动触发今日 BOSS 重新生成（dev/演示用；cron 自动跑 6 点）
// 失败也返 200 + error 信息，不 5xx——保留旧缓存不动。
app.post('/api/regen-boss', async (c) => {
  try {
    const { boss, log } = await generateBoss();
    return c.json({ ok: true, boss, log });
  } catch (e) {
    return c.json({ ok: false, error: (e as Error).message });
  }
});

// 静态托管 dist/（prod 用）。dev 下 vite 自己服务前端。
app.use('/*', serveStatic({ root: DIST, rewriteRequestPath: (p) => (p === '/' ? '/index.html' : p) }));

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`本草·局 后端 :${info.port}  (dist=${DIST})`);
});

// 每日 06:00 本地时区刷新今日 BOSS。失败仅 console.error，不影响服务。
CronJob.from({
  cronTime: '0 6 * * *',
  onTick: async () => {
    try {
      const { boss } = await generateBoss();
      console.log(`[cron] 今日 BOSS 已刷新：${boss.name}`);
    } catch (e) {
      console.error('[cron] BOSS 刷新失败：', (e as Error).message);
    }
  },
  start: true,
});
