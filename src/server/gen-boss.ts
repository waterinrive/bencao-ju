// 今日 BOSS 生成核心 —— 知乎搜索真实病证 → 直答提取病机 → 校验 → data/today-boss.json
// 由 scripts/gen-today-boss.ts（CLI）和 server（cron + regen 路由）共用。
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchZhihuSearch, chatCompletion, type SearchItem } from './zhihu.js';
import { validateBoss, difficultyOk, bossConsistent, BossValidationError } from '../shared/validate.js';
import {
  ZHIFA as ZHIFA_ARR, GONGXIAO as GONGXIAO_ARR,
  BIAOLI as BIAOLI_ARR, HANRE as HANRE_ARR, XUSHI as XUSHI_ARR,
  YITU as YITU_ARR, GUIJING as GUIJING_ARR,
} from '../shared/enums.js';
import type { BossCard } from '../shared/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', '..', 'data', 'today-boss.json');

// 证型主题池：按 day-of-year 轮转，每天一种，覆盖八纲常见证
const QUERY_POOL = [
  '风寒 医案 辨证',
  '风热 医案 辨证',
  '湿热 医案 辨证',
  '气虚 医案 辨证',
  '阴虚 医案 辨证',
  '血瘀 医案 辨证',
  '肝郁 医案 辨证',
  '痰湿 医案 辨证',
  '实热 医案 辨证',
  '阳虚 医案 辨证',
];

export function todayQuery(): string {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return QUERY_POOL[dayOfYear % QUERY_POOL.length]!;
}

// 受控词表从 enums 契约取，不手抄——见 mentor.ts 同理。
const GONGXIAO = GONGXIAO_ARR.join('/');
const ZHIFA = ZHIFA_ARR.join('/');
const BIAOLI = BIAOLI_ARR.join('/');
const HANRE = HANRE_ARR.join('/');
const XUSHI = XUSHI_ARR.join('/');
const GUIJING = GUIJING_ARR.join('/');
const YITU = YITU_ARR.join('/');

function buildPrompt(item: SearchItem, query: string): string {
  const content = item.contentText.slice(0, 1200);
  return `你是中医病机设计师。下面是一段真实的中医病证/医案内容。请从中提取病机，做成一张"病证BOSS卡"。
不要编造隐喻，只从内容里提取真实病机；内容不足处用该证型的标准病机补全。

搜索主题：${query}
内容标题：${item.title}
内容摘要：${content}

输出一个 JSON 对象（只输出 JSON，不要解释、不要 markdown 代码围栏）：
{
  "id": "kebab-case-id",
  "name": "病证名4-8字（用真实病证名）",
  "flavor": "一句证候描述",
  "bagang": { "biaoli": "${BIAOLI}选一", "hanre": "${HANRE}选一", "xushi": "${XUSHI}选一" },
  "zhuzheng": { "requireZhifa": "${ZHIFA}选一", "requireGongxiao": "${GONGXIAO}选一", "desc": "病机一句话" },
  "jianzheng": [ { "name": "兼证名", "requireGongxiao": "${GONGXIAO}选一", "worsen": "${YITU}选一" } ],
  "targetGuijing": "${GUIJING}选一",
  "hp": "25到40的整数",
  "yitu": { "type": "${YITU}选一", "value": "1到3的整数" }
}
规则：功效只能选自「${GONGXIAO}」；兼证 0-2 个；HP 25-40、意图值 1-3（这是新手教学游戏，默认难度要可解：未治兼证每回合流血不超过4，9回合内药池能组出3剂可解之方）。
寒热须与治法一致：清热泻火/辛凉解表→热证；温里散寒/发汗解表→寒证。`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('模型输出无 JSON 对象');
  return JSON.parse(candidate.slice(start, end + 1));
}

function pickBestSearchItem(items: SearchItem[]): SearchItem {
  return [...items].sort((a, b) => b.voteUpCount - a.voteUpCount)[0]!;
}

export interface GenResult {
  boss: BossCard;
  log: Record<string, unknown>;
}

/** 生成今日 BOSS 并写入 data/today-boss.json。失败抛错，不写脏文件。 */
export async function generateBoss(): Promise<GenResult> {
  const query = todayQuery();
  const items = await fetchZhihuSearch(query, 10);
  if (!items.length) throw new Error(`知乎搜索「${query}」无结果`);
  const top = pickBestSearchItem(items);

  const raw = await chatCompletion('zhida-fast-1p5', [{ role: 'user', content: buildPrompt(top, query) }]);
  const obj = extractJson(raw);
  const boss = validateBoss(obj);
  if (!difficultyOk(boss)) {
    throw new BossValidationError(`难度超标：hp${boss.hp}+yitu${boss.yitu.value}×5+兼证${boss.jianzheng.length}×5 > 60`);
  }
  if (!bossConsistent(boss)) {
    throw new BossValidationError(`病机自相矛盾：寒热(${boss.bagang.hanre})与治法(${boss.zhuzheng.requireGongxiao})不符`);
  }
  const generatedAt = new Date().toISOString();
  boss.source = { topic: top.title, hotUrl: top.url, generatedAt, searchQuery: query };

  const log = {
    searchQuery: query,
    topic: top.title,
    searchUrl: top.url,
    authorName: top.authorName,
    contentSnippet: top.contentText.slice(0, 300),
    model: 'zhida-fast-1p5',
    generatedAt,
    rawInference: raw,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ boss, log }, null, 2));
  return { boss, log };
}
