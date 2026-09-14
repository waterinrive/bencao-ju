// 自查截图：headless chromium 截当前页面，压成小 jpeg 供人工/模型检查。
// 用法: node scripts/shot.mjs [url] [out.jpg] [clickText]
import { chromium } from 'playwright-core';

const url = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? '/tmp/shot.jpg';
const clickText = process.argv[4];

// playwright-core 不自动下载浏览器：用 ~/.cache/ms-playwright 里的 headless shell，
// 依赖库来自 ~/.local/crlibs（无 root 时 dpkg-deb -x 解出来的）
const { execSync } = await import('node:child_process');
const exe = execSync('ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell 2>/dev/null').toString().trim().split('\n')[0];
const browser = await chromium.launch({
  executablePath: exe,
  env: { ...process.env, LD_LIBRARY_PATH: `${process.env.HOME}/.local/crlibs/usr/lib/x86_64-linux-gnu` },
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: 'networkidle' });
if (clickText) {
  await page.getByText(clickText).first().click();
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: out, type: 'jpeg', quality: 55 });
await browser.close();
console.log(out);
