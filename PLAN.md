# 本草·局 — 实施方案（PLAN）

> 基于 `DEMO.md` 排期 + 已建代码盘点。每项任务带**验收标准**，可直接判定"做完没"。
> 今日 2026-09-05；提交 9/13 10:00–9/15 10:00，需公网可访问 Demo。

## 现状盘点（D1–2 已完成的部分）

| 产物 | 文件 | 状态 |
|---|---|---|
| 受控词汇契约 | `src/shared/enums.ts` | ✅ 9 类枚举 + union 类型 |
| 类型契约 | `src/shared/types.ts` | ✅ HerbCard/BossCard/Formula/CombatResult |
| 战斗引擎 | `src/shared/combat.ts` | ✅ 7 步管线 |
| 药卡种子 | `src/data/herbs.ts` | ✅ 麻黄汤 4 味 + 2 通用 |
| BOSS 种子 | `src/data/bosses.ts` | ✅ 风寒表实证 |
| 引擎自检 | `src/shared/selftest.ts` | ✅ 5 case 全过 |
| 热榜样本 | `data/fixtures/hotlist-sample.json` | ✅ 3 条真数据 |

**未完成（D1–2 欠项）**：项目骨架（Vite 前端 + Hono 后端）、Zhihu HTTP 客户端。

---

## 剩余任务

### T1. 项目骨架（D1–2 欠项）
**做**：pnpn 单包；`src/web/`（Vite+React+TS）、`src/server/`（Hono）；`pnpm dev` 并发起前后端；`pnpm build` 出静态+服务。
**验收**：
- `pnpm dev` → 前端 `localhost:5173` 显示占位"本草·局"，后端 `localhost:3000/api/health` 返 `{ok:true}`。
- `pnpm test` 仍过（selftest 不回归）。
- `pnpm build` 产物 `dist/` 存在，Hono 能托管它。
**测试**：手动访问两个 URL；`pnpm test`。

### T2. 前端对战页（D3–5）
**做**：`src/web/Battle.tsx`。四角色位（君臣佐使）点选指派卡牌（不拖拽）；调 `resolveCombat` 结算；展示伤害/反伤/兼证解除/`feedback` 因果文案；BOSS 血条 + 玩家血条 + 回合计数；麻黄汤关固定 4 味手牌。
**验收**：
- 能组成完整麻黄汤 → 伤害 18、反伤 2、咳喘解除（与 selftest case 1 一致）。
- 故意缺佐 → 反伤 3、咳喘不治，因果文案出现"佐是保险丝"（case 3）。
- 故意缺使 → 伤害 13（case 4）。
- BOSS HP 归零→胜；玩家 HP 归零或 8 回合超→败。
- 无君时引擎直接返 0 伤害 + "无君药"文案（case 2）。
**测试**：4 个场景手点过；`pnpm test` 引擎自检不回归。UI 交互不写单测（YAGNI）。

### T3. Zhihu HTTP 客户端（D6–7 前置）
**做**：`src/server/zhihu.ts`。`fetchHotList()`（`/api/v1/content/hot_list?Limit=30`）+ `chatCompletion(model,messages)`（`/v1/chat/completions`）。Bearer + `X-Request-Timestamp`（秒）。Secret 从 `.env` 读。
**验收**：
- `fetchHotList()` 用 `data/fixtures/hotlist-sample.json` mock 时返 3 条；真调用返 ≤30 条。
- `chatCompletion('zhida-fast-1p5', [...])` 迁回非空文本。
- 无网络/额度超限时 `throw` 带可读信息，不静默。
**测试**：mock 模式跑断言；真调用手跑一次（不烧额度，dev 用 fixture 兜底）。

### T4. boss 生成脚本（D6–7）
**做**：`scripts/gen-today-boss.ts`。`generateBoss()`：取热榜首条 → 直答 `zhida-thinking-1p5` 带 schema 约束 prompt → 解析 JSON → clamp 校验（HP 30–60、兼证 ≤2、意图值合理、枚举全在受控词表内）→ 写 `data/today-boss.json` + 生成日志（含热榜标题/URL/模型推理）。
**验收**：
- 跑 `pnpm gen:boss` 生成 `data/today-boss.json`，字段全符合 `BossCard` schema。
- 生成日志含：来源热榜标题、URL、生成时间。
- 校验失败时不写脏文件、报错退出非 0。
- 生成的 BOSS 能被 `resolveCombat` 接受（类型契合，不报错）。
**测试**：跑脚本看产物；把产物喂进 selftest 的引擎调一次（`resolveCombat` 不抛）。难度校验器断言 `hp*yitu.value + 兼证数*5 ≤ 60`。

### T5. 后端路由（D6–7）
**做**：`GET /api/today-boss`（读缓存 JSON + 日志）；`POST /api/ask-mentor`（太医院：带局况上下文调 `zhida-fast-1p5`，本地规则兜底——按 `feedback` 文案给方向，不点名药）。
**验收**：
- `GET /api/today-boss` 在缓存存在时返 BOSS JSON + 生成日志；不存在时返教学关 `FENGHAN_BIAOSHI` 兜底。
- `POST /api/ask-mentor` 真调用返非空方向文案；额度超限走本地规则兜底（按当前 `Formula` 缺位给"缺X则Y"方向）。
- Secret 不出现在任何响应/日志。
**测试**：curl 两路由；mock 直答失败时确认兜底分支；检查响应不含 Secret。

### T6. 今日热榜 BOSS 链路（D8）
**做**：前端 `Battle.tsx` 支持"今日 BOSS"模式：读 `/api/today-boss` 渲染；生成日志做可展开面板（"这关怎么来的"）；通用解药池（金银花/连翘 + D6 扩）兜底可打。
**验收**：
- 切到"今日 BOSS"模式能渲染 AI 生成的 BOSS，四角色位可出牌结算。
- 生成日志面板展示热榜来源。
- 即便今日 BOSS 证型不在麻黄池覆盖范围，也不崩（给通用解药池兜底或显式提示"无解药池，请用教学关"）。
**测试**：跑 `pnpm gen:boss` 后访问；结算一回合看数值合理。

### T7. 部署（D9）
**做**：单 Hono 服务同时托管 `dist/` 静态 + API；` railway up`（或 Render/Fly）。
**验收**：
- 公网 URL 可访问，能打完一局麻黄汤。
- `/api/today-boss` 公网可访问。
- Secret 只在服务端环境变量，不在前端 bundle。
**测试**：公网 URL 手动打一局；`grep -r Secret dist/` 确认无泄漏。

### T8. 打磨 + 演示视频（D10）
**做**：文案/教学引导润色；录 60–90s 演示视频兜底（防现场翻车）。
**验收**：视频跑通麻黄汤完整一局 + 今日 BOSS 一局；提交材料齐。
**测试**：人眼看视频。

---

## 整体验收标准（Demo 提交门槛）

1. **三 wow 点全到**：① AI 从热榜生成 BOSS（`pnpm gen:boss` 产物 + 日志面板可见）② 四角色位出牌（君臣佐使点选 + 结算）③ 麻黄汤完整一局可通关。
2. **"缺哪个痛哪个"闭环**：缺君=0伤害、缺佐=反伤满、缺使=7折、缺兼证治=咳喘不治——四个反馈文案引擎已产出，前端展示。
3. **公网可访问**：部署 URL 评委能打开。
4. **不翻车兜底**：预缓存今日 BOSS + 录播视频。
5. **Secret 不泄漏**：知乎 Access Secret 仅后端 .env，前端 bundle grep 不到。

## 测试策略（分层，零测试框架）

| 层 | 方式 | 范围 |
|---|---|---|
| 引擎 | `src/shared/selftest.ts`（node:assert） | 5 case 已覆盖核心路径，T2/T4 后追加 today-boss 喂引擎 case |
| 类型 | `tsc --noEmit`（strict + noUncheckedIndexedAccess） | 全量编译期契约 |
| HTTP 客户端 | mock fixture + 一次真调用 | T3 |
| 路由 | curl + mock 直答失败 | T5 |
| 前端 | 手点 4 场景 | T2/T6，不写 UI 单测 |
| 部署 | 公网手打一局 + grep Secret | T7 |

**不做的测试**（YAGNI）：UI 单测、E2E 框架、覆盖率统计、性能压测。

## 风险触发条件 → 动作
- 知乎直答额度耗尽 → 切本地规则兜底 + 预缓存 BOSS。
- 生成 BOSS 不可解 → 难度校验器拦截 + 通用解药池兜底。
- 10 天不够 → 砍副功效/五味/相使相杀（已标"看工期"项）。
- 部署被墙 → Railway 不行切 Render/Fly。

## 立即可执行的下一步
T1 项目骨架。装 Vite + Hono，建 `src/web/` `src/server/`，通 `pnpm dev`。
