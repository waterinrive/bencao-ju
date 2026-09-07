// CLI 入口：生成今日 BOSS。逻辑在 src/server/gen-boss.ts（与 server cron 共用）。
// 用法: pnpm gen:boss   (需 .env ZHIHU_ACCESS_SECRET)
import { generateBoss } from '../src/server/gen-boss.js';

generateBoss()
  .then(({ boss, log }) => {
    console.log(`✓ 今日 BOSS 已生成：${boss.name}（hp${boss.hp} / ${boss.yitu.type}:${boss.yitu.value}）`);
    console.log(`  搜索：${log.searchQuery as string} → ${(log.topic as string).slice(0, 40)}`);
  })
  .catch((e: Error) => {
    console.error('✗ 生成失败：', e.message);
    process.exit(1);
  });
