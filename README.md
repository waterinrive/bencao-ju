---
title: 本草·局
sdk: docker
app_port: 7860
---

# 本草·局

中医方剂学卡牌策略对战：BOSS=病证，卡牌=中药，组方=出牌。打牌的过程中自然学会**君臣佐使**与**七情配伍**。

## 跑起来

```bash
pnpm install
pnpm dev            # 前端 :5173（/api 代理到 :3000）
pnpm dev:server     # 后端 :3000（需 .env，见 .env.example；缺省也能玩，教学关离线可玩）
pnpm build && pnpm start   # 生产：单进程 :3000 同时 serve dist/ + /api
# 或 Docker：docker build -t bencao . && docker run -p 3000:3000 bencao
```

## 玩什么

- **教学演示**（约 4 分钟）：引导层手把手过一遍麻黄汤——君=力专主攻、臣=相须助力、佐=治兼证/减毒、使=引经调和；结尾「换君试错」让你亲手对比桂枝为君的差别。
- **自由对局**：今日病证 BOSS（后端可用 AI 按知乎内容生成，离线回落到内置病证），9 回合内组方破证；弃换、心力、兼证恶化意图、七情连线（相须×1.5 / 相反中毒）全在这。
- **太医院**：组方后点「问」，AI  mentor 给方向点拨。

## 仓库结构

- `src/shared/` 引擎：`combat.ts` 结算、`deck.ts` 牌库回合、`selftest.ts` 自检（`npm test`）
- `src/client/Game.tsx` 全部 UI（单文件棋盘）
- `src/server/` Hono 后端：静态托管 + `/api/ask-mentor`、今日病证生成
- `src/data/` 中药/病证数据；`public/art/` 卡面贴纸
- `DESIGN.md` / `RESEARCH.md` 设计与医理考据

## 开发脚本

- `scripts/shot.mjs [url] [out.jpg] [clickText]` headless 截图自查
- `scripts/demo-video.mjs [out.webm]` 录演示视频（教学关自动走一遍）
- `scripts/trim-art.py` 裁卡面内嵌标签（一次性）
