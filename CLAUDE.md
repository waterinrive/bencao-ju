# 本草·局 项目指令

## 搜索工具优先级（强制）

**优先使用 AnySearch，不要跳到 WebSearch/WebFetch。**

- 需要联网信息、查资料、事实核查、结构化查询 → 先 AnySearch CLI：
  `node ~/.claude/skills/anysearch/scripts/anysearch_cli.js <command>`
  命令：`search` / `batch_search` / `extract` / `get_sub_domains`。
- **extract 抓取某 URL 失败时**（反爬/不支持）→ 换可抓取的源、或回 `search`/`batch_search` 用更精准的 query 从摘要拿要点。**不要因此切到 WebSearch/WebFetch。**
- 垂直领域（finance/health/code/academic…）查询前先 `get_sub_domains`。
- 只有 AnySearch 完全无法覆盖的纯百科查询才考虑 WebSearch；WebFetch 仅作最后兜底。
- 调用失败先跑 `anysearch_cli.js doc` 查用法，不要静默切工具。

理由：用户已配置 AnySearch 并付费，跳到 WebFetch 会绕过既有通道且常被网络策略拦截。

## 项目背景

本草·局 — 中医方剂学卡牌策略对战游戏。BOSS=病证，卡牌=中药，组方=出牌。
核心目标：玩家在打牌中自然学会君臣佐使。spec 驱动开发：先理清认知与 spec，确认后再写代码。

设计/研究文档见 `DESIGN.md`、`RESEARCH.md`。
