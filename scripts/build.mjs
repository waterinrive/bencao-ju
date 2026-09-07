// 占位构建：前端待 T2 接入 Vite。当前只产出 dist/index.html 占位，
// 让 prod 单 Hono 服务 serve dist/ 时 "/" 不至 404。
// Vite 接入后此文件替换为 `vite build`（或前置调用），dist/ 仍为本产物目录。
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist', { recursive: true });
writeFileSync(
  'dist/index.html',
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>本草·局</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:2rem auto;padding:0 1rem;color:#222}h1{color:#7a3}code{background:#eee;padding:.1em .3em;border-radius:3px}</style>
<h1>本草·局</h1>
<p>中医方剂学卡牌策略对战 — 前端待接入。</p>
<p>后端 API：<code><a href="/api/health">/api/health</a></code> · <code><a href="/api/today-boss">/api/today-boss</a></code></p>
`,
);
console.log('✓ dist/index.html (placeholder) built — Vite 待 T2 接入');
