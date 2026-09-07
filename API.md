# 本草·局 — 前后端接口契约（API.md）

> 后端单 Hono 服务，端口 3000。dev 下 Vite 5173 代理 `/api` → 3000；prod 下同一服务托管 `dist/`。
> 战斗结算在前端（`resolveCombat` 是 shared 纯函数，前后端都 import）。后端只管动态数据与 AI。

## 路由

### `GET /api/health`
健康检查。
- 响应：`{ "ok": true }`

### `POST /api/regen-boss`
手动触发今日 BOSS 重新生成（dev/演示用；cron 自动跑 `0 6 * * *` 每日 6 点刷新）。
- 请求：无 body。
- 响应：
  ```json
  { "ok": true, "boss": BossCard, "log": GenLog }   // 成功
  { "ok": false, "error": "难度超标：..." }            // 失败：保留旧缓存不动
  ```
- 失败不 5xx、不写脏文件，前端继续用旧 `/api/today-boss` 缓存。

### `GET /api/today-boss`
今日 BOSS 关卡。前端首屏调一次，缓存到本回合。
- 响应：
  ```json
  {
    "boss": BossCard,           // 见 src/shared/types.ts
    "log": {                     // 生成溯源（日志面板用）；兜底时为 null
      "searchQuery": "实热 医案 辨证",
      "topic": "知乎搜索结果标题",
      "searchUrl": "https://www.zhihu.com/...",
      "authorName": "作者",
      "contentSnippet": "医案内容摘要前300字",
      "model": "zhida-fast-1p5",
      "generatedAt": "2026-09-05T12:00:00.000Z",
      "rawInference": "模型原始输出（调试用，可折叠）"
    } | null,
    "fallback": false            // true=缓存不存在/解析失败，boss 是教学关 FENGHAN_BIAOSHI
  }
  ```
- 兜底：无 `data/today-boss.json` 或 JSON 坏 → `fallback:true` + 教学关。永不 5xx。

### `POST /api/ask-mentor`
太医院点拨。带当前局况，返回一句方向（不点名具体药）。
- 请求体：
  ```json
  {
    "formula": Formula,          // 当前已放药（君/臣/佐/使，可缺）
    "boss": BossCard,            // 当前 BOSS
    "feedback": ["上回合结算反馈文案..."]  // 可空数组
  }
  ```
- 响应：
  ```json
  { "hint": "君已立，缺臣。寻一味与君相须或同类者辅助主攻，增效。", "source": "zhida" | "local" }
  ```
- `source=local`：直答额度耗尽/无网络 → 本地规则兜底。覆盖全部缺位场景，足够 demo。

## 前端可直接 import 的 shared 模块（不走 HTTP）

这些是纯数据/纯函数，前后端共享，前端直接 import，无需接口化：
- `src/shared/combat.ts` — `resolveCombat(f: Formula, boss: BossCard): CombatResult`。结算在前端跑。
- `src/shared/deck.ts` — `createDeck`/`startRound`/`playCard`/`shuffle`。牌堆三层 + 心力费用纯逻辑，前端 useReducer 调用。
- `src/data/herbs.ts` — `HERBS`、`MAHUANG_TANG`、`TEACHING_DECK`、`GENERAL_DECK`。手牌池。
- `src/data/bosses.ts` — `FENGHAN_BIAOSHI`。教学关。
- `src/shared/enums.ts`、`src/shared/types.ts` — 类型契约。

## 前端所需的最小数据流

1. 进入对战 → `GET /api/today-boss`（或用固定 `FENGHAN_BIAOSHI` 教学关）→ 渲染 BOSS 卡。
2. 玩家在君臣佐使四点选指派药卡 → 组成 `Formula` → 前端 `resolveCombat(f, boss)` 结算 → 展示 `CombatResult.damage/selfDamage/curedComplaints/feedback`。
3. BOSS HP 归零 → 胜；玩家 HP 归零或 8 回合超 → 败。
4. 卡住时 → `POST /api/ask-mentor` 带局况 → 渲染 `hint`。
5. 今日 BOSS 模式展开 `log` 面板展示病证医案来源（wow 点 ①）。

## Secret 约束
- `ZHIHU_ACCESS_SECRET` 仅后端 `.env`，不进前端 bundle / 日志 / 响应。
- 部署前 `grep -r <secret> dist/` 必须无命中。
