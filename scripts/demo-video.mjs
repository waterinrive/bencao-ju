// 交作品用演示录像：菜单→教学关走一遍→结算→进自由对局。产出 webm（scripts/demo-video.mjs）
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const exe = execSync('ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null').toString().trim().split('\n')[0];
const browser = await chromium.launch({
  executablePath: exe,
  env: { ...process.env, LD_LIBRARY_PATH: `${process.env.HOME}/.local/crlibs/usr/lib/x86_64-linux-gnu` },
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: '/tmp/vid', size: { width: 1280, height: 720 } } });
const page = await ctx.newPage();
const wait = (ms) => page.waitForTimeout(ms);

await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
await wait(1500);
await page.getByText('教学演示').first().click();
await wait(1500);
// 通用教学驱动器：讲解步点主按钮，place 门点高亮牌，play 门点高亮结算，直到进自由对局
for (let i = 0; i < 40; i++) {
  await wait(800);
  const btn = page.locator('.tut-foot .btn.primary');
  if (await btn.count()) {
    const t = (await btn.first().textContent()) ?? '';
    await btn.first().click();
    if (t.includes('进入自由对局')) { await wait(3000); break; }
    continue;
  }
  const glowCard = page.locator('.card.tut-glow');
  if (await glowCard.count()) { await glowCard.first().click(); continue; }
  if (await page.locator('.actions .btn.tut-glow').count()) { await page.getByText('出牌结算').first().click(); continue; }
  if (!(await page.locator('.tut-banner').count())) break;
}
await wait(1500);
const videoPath = await page.video().path();
await ctx.close();
fs.copyFileSync(videoPath, process.argv[2] ?? '/tmp/demo.webm');
await browser.close();
console.log(process.argv[2] ?? '/tmp/demo.webm');
