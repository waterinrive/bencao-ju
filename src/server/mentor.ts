// 太医院陪练 —— 本地规则化兜底（点拨方向、不点名药）+ 直答升级（带局况上下文）。
// 本地规则是主路径：快、不烧额度、可控；直答仅在额度允许时升级用。
import { chatCompletion } from './zhihu.js';
import { GONGXIAO, ZHIFA, GUIJING } from '../shared/enums.js';
import type { Formula, BossCard, HerbCard } from '../shared/types.js';

// 受控词表直接从 enums 契约取，不手抄——避免 enums 改了这里静默漂移、教学失配。
const GONGXIAO_LIST = GONGXIAO.join('/');
const ZHIFA_LIST = ZHIFA.join('/');
const GUIJING_LIST = GUIJING.join('/');

function present(f: Formula): string {
  const r: string[] = [];
  if (f.jun) r.push(`君=${f.jun.name}(${f.jun.mainGongxiao})`);
  if (f.chen) r.push(`臣=${f.chen.name}`);
  if (f.zuo) r.push(`佐=${f.zuo.name}`);
  if (f.shi) r.push(`使=${f.shi.name}`);
  return r.length ? r.join('，') : '空方';
}

/**
 * 本地规则点拨。按缺位/不对证给方向，永远不点名具体药。
 * 与 feedback 文案同源（结算因果），保证"缺哪个痛哪个"的教学一致。
 */
export function mentorHintLocal(f: Formula, boss: BossCard): string {
  if (!f.jun) {
    return `方中无君。先选一味主功效「${boss.zhuzheng.requireGongxiao}」的药领方——君是全方灵魂。`;
  }
  if (f.jun.mainGongxiao !== boss.zhuzheng.requireGongxiao) {
    return `君「${f.jun.name}」功效（${f.jun.mainGongxiao}）不对主证。换一味「${boss.zhuzheng.requireGongxiao}」之药为君。`;
  }
  if (!f.chen) {
    return `君已立，缺臣。寻一味与君相须或同类者辅助主攻，增效。`;
  }
  // 兼证未治检查
  const all: HerbCard[] = [f.jun, f.chen, f.zuo, f.shi].filter((h): h is HerbCard => !!h);
  const uncured = boss.jianzheng.find(
    jz => !all.some(h => h.mainGongxiao === jz.requireGongxiao || h.subGongxiao === jz.requireGongxiao),
  );
  if (uncured) {
    return `兼证「${uncured.name}」无人治，需一味「${uncured.requireGongxiao}」之药（佐位）。`;
  }
  if (f.jun.toxicity > 0 && !f.zuo) {
    return `君药峻烈无佐监制，反伤满。需一味佐药减毒——佐是保险丝。`;
  }
  if (!f.shi) {
    return `缺使。需一味归经入「${boss.targetGuijing}」的药引达病所。`;
  }
  return `方已周全，君臣佐使俱备，可出牌。`;
}

/** 直答升级：带局况上下文调 zhida-fast。失败抛错，由路由兜底走本地规则。 */
export async function mentorHintZhida(f: Formula, boss: BossCard, feedback: string[]): Promise<string> {
  const prompt = `你是中医太医院陪练，只点拨方向、绝不点名具体药（≤45字）。
当前局况：
- BOSS：${boss.name}（${boss.bagang.hanre}${boss.bagang.xushi}证，主证要「${boss.zhuzheng.requireGongxiao}」，治法「${boss.zhuzheng.requireZhifa}」，归经${boss.targetGuijing}，兼证${boss.jianzheng.map(j => j.name).join('、') || '无'}）
- 当前方：${present(f)}
- 上回合反馈：${feedback.join('；') || '无'}

可用功效：${GONGXIAO_LIST}；治法：${ZHIFA_LIST}；归经：${GUIJING_LIST}。
一句话告诉玩家该补什么位/改什么。`;
  return (await chatCompletion('zhida-fast-1p5', [{ role: 'user', content: prompt }])).trim();
}
