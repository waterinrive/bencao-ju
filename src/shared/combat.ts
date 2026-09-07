import type { Hanre, Siqi, Qiqing } from './enums.js';
import type { HerbCard, BossCard, Formula, CombatResult } from './types.js';

// 四气对证系数：热证用寒凉=1.0顺；寒证用温热=1.0顺；相反=0.4逆；平/中性=0.8
function qiFactor(bossHanre: Hanre, qi: Siqi): number {
  if (bossHanre === '热') {
    if (qi === '寒' || qi === '凉') return 1.0;
    if (qi === '温' || qi === '热') return 0.4;
    return 0.8;
  }
  // 寒证
  if (qi === '温' || qi === '热') return 1.0;
  if (qi === '寒' || qi === '凉') return 0.4;
  return 0.8;
}

// 两味药构成的七情关系（基于药卡配伍标签，双向匹配）
export function pairQing(a: HerbCard, b: HerbCard): Qiqing | null {
  return a.peiwu?.find(p => p.drug === b.name)?.qing
      ?? b.peiwu?.find(p => p.drug === a.name)?.qing
      ?? null;
}

/**
 * 方剂结算 —— DESIGN 9.1/9.2 管线，demo 用宽松版佐药减毒（有佐即反伤减半）。
 * 输入：四位组方 + BOSS；输出：对BOSS伤害、玩家反伤、兼证解除、教学因果。
 */
export function resolveCombat(f: Formula, boss: BossCard): CombatResult {
  const feedback: string[] = [];
  const cured: string[] = [];

  // 1. 君药主疗效
  if (!f.jun) {
    feedback.push('方中无君药，药无主攻，BOSS 几乎不掉血。君是灵魂。');
    return { damage: 0, selfDamage: 0, curedComplaints: cured, feedback };
  }
  let dmg = f.jun.power;
  if (f.jun.mainGongxiao !== boss.zhuzheng.requireGongxiao) {
    dmg *= 0.3;
    feedback.push(`君「${f.jun.name}」功效（${f.jun.mainGongxiao}）不对主证要求（${boss.zhuzheng.requireGongxiao}），疗效大减。`);
  } else {
    feedback.push(`君「${f.jun.name}」对主证「${boss.zhuzheng.requireGongxiao}」匹配✓`);
  }

  // 2. 四气对证
  const qf = qiFactor(boss.bagang.hanre, f.jun.siqi);
  dmg *= qf;
  if (qf < 1) feedback.push(`四气${f.jun.siqi}与证（${boss.bagang.hanre}）${qf === 0.4 ? '相反反噬' : '未尽契合'}，×${qf}。`);

  // 3. 臣药
  if (f.chen) {
    const q = pairQing(f.jun, f.chen);
    if (q === '相须') {
      dmg *= 1.5;
      feedback.push(`臣「${f.chen.name}」与君相须，力×1.5。`);
    } else if (f.chen.mainGongxiao === f.jun.mainGongxiao) {
      dmg *= 1.3;
      feedback.push(`臣「${f.chen.name}」同类助君，×1.3。`);
    } else {
      feedback.push(`臣「${f.chen.name}」与君非相须，加成有限。`);
    }
  } else {
    feedback.push('无臣药，主证力度单薄。');
  }

  // 4. 七情全局（相恶削弱 / 相反禁忌）
  // ponytail: 只在此处全局扫描 相恶/相反；相须 仅在 step3 对君-臣对触发。
  //   即君-佐/臣-佐的 相须 不生效。麻黄汤（相须=麻黄+桂枝在君臣位）不受影响；
  //   非君臣位的 相须 pair 出现时再改为全局统一扫描，避免重复 ×1.5 计两次。
  const all: HerbCard[] = [f.jun, f.chen, f.zuo, f.shi].filter((h): h is HerbCard => !!h);
  let qingMul = 1.0;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const q = pairQing(all[i]!, all[j]!);
      if (q === '相恶') {
        qingMul *= 0.7;
        feedback.push(`「${all[i]!.name}」与「${all[j]!.name}」相恶，互相削弱×0.7。`);
      } else if (q === '相反') {
        feedback.push(`「${all[i]!.name}」与「${all[j]!.name}」相反（禁忌），方生毒、伤害归零！`);
        dmg = 0;
      }
    }
  }
  dmg *= qingMul;

  // 5. 使药归经命中
  if (f.shi) {
    if (f.shi.guiJing.includes(boss.targetGuijing)) {
      feedback.push(`使「${f.shi.name}」引经命中${boss.targetGuijing}，全方全额。`);
    } else {
      dmg *= 0.6;
      feedback.push(`使「${f.shi.name}」归经不中${boss.targetGuijing}，×0.6。`);
    }
  } else {
    dmg *= 0.7;
    feedback.push('无使药，药力难达病所，×0.7。');
  }

  // 6. 佐药减毒（宽松版：有佐即反伤减半）
  let selfDmg = 0;
  if (f.jun.toxicity > 0) {
    const full = f.jun.toxicity * 3;
    if (f.zuo) {
      selfDmg = Math.round(full / 2);
      feedback.push(`君「${f.jun.name}」峻烈，佐「${f.zuo.name}」监制，反伤减半→${selfDmg}。`);
    } else {
      selfDmg = full;
      feedback.push(`君「${f.jun.name}」峻烈无佐监制，反伤${selfDmg}！佐是保险丝。`);
    }
  }

  // 7. 兼证解除（任一药的主/副功效命中兼证要求即解除）
  for (const jz of boss.jianzheng) {
    const healer = all.find(h => h.mainGongxiao === jz.requireGongxiao || h.subGongxiao === jz.requireGongxiao);
    if (healer) {
      cured.push(jz.name);
      feedback.push(`兼证「${jz.name}」由「${healer.name}」解除，恶化意图被预防。`);
    } else {
      feedback.push(`兼证「${jz.name}」无人治，将按意图恶化。`);
    }
  }

  dmg = Math.max(0, Math.round(dmg));
  return { damage: dmg, selfDamage: selfDmg, curedComplaints: cured, feedback };
}
