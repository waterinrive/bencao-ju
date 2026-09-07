// 试玩模拟：镜像 Game.tsx 新经济（base3/cost/exhaust/手牌5 + 跨回合攒方），贪心 AI。
// 跑：tsx scripts/sim.ts
import { resolveCombat } from '../src/shared/combat.js';
import { HERBS, TEACHING_DECK, GENERAL_DECK } from '../src/data/herbs.js';
import { FENGHAN_BIAOSHI } from '../src/data/bosses.js';
import type { BossCard, Formula, HerbCard } from '../src/shared/types.js';

type Role = 'jun' | 'chen' | 'zuo' | 'shi';
const XINLI_BASE = 3, HAND_START = 5, PLAYER_HP = 30, MAX_TURNS = 8;
const ROLES: Role[] = ['jun', 'chen', 'zuo', 'shi'];
const H = HERBS;

function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; }
function buildDeck(b: BossCard): string[] {
  const pool = b.id === FENGHAN_BIAOSHI.id ? TEACHING_DECK : GENERAL_DECK;
  const extras = ['mahuang', 'guizhi', 'gancao', 'jinyinhua', 'huangqin', 'chenpi', 'fuling'];
  return shuffle([...pool, ...extras]);
}
function drawOne(dp: string[], dc: string[]) { let d = dp, c = dc; if (d.length === 0) { d = shuffle(c); c = []; } const card = d.pop() ?? null; return { card, dp: d, dc: c }; }

// 贪心给角色位挑药：君(对主证)→臣(与君相须/同类)→佐(治兼证或减毒)→使(归经命中)
function pickFor(role: Role, formula: Partial<Record<Role, string>>, hand: string[], b: BossCard): string | null {
  const used = new Set(Object.values(formula).filter(Boolean));
  const jun = formula.jun ? H[formula.jun] : null;
  const want = (pred: (h: HerbCard) => boolean) => hand.find(k => !used.has(k) && H[k] && pred(H[k]!)) ?? null;
  if (role === 'jun') return want(h => h.mainGongxiao === b.zhuzheng.requireGongxiao);
  if (role === 'chen' && jun) return want(h => jun.peiwu?.some(p => p.drug === h.name) ?? false) ?? want(h => h.mainGongxiao === jun.mainGongxiao);
  if (role === 'zuo') {
    for (const jz of b.jianzheng) { const z = want(h => h.mainGongxiao === jz.requireGongxiao || h.subGongxiao === jz.requireGongxiao); if (z) return z; }
    if (jun && jun.toxicity > 0) return want(h => h.mainGongxiao !== jun.mainGongxiao);
    return null;
  }
  if (role === 'shi') return want(h => h.guiJing.includes(b.targetGuijing));
  return null;
}

function run(b: BossCard) {
  let dp = buildDeck(b), dc: string[] = [], ex: string[] = [];
  const hand: string[] = [];
  for (let i = 0; i < HAND_START; i++) { const r = drawOne(dp, dc); if (!r.card) break; hand.push(r.card); dp = r.dp; dc = r.dc; }
  // 保底君药
  const need = b.zhuzheng.requireGongxiao;
  if (!hand.some(k => H[k]?.mainGongxiao === need)) {
    const idx = dp.findIndex(k => H[k]?.mainGongxiao === need);
    if (idx >= 0) { const so = hand[0]!; hand[0] = dp[idx]!; dp[idx] = so; }
  }
  let bossHp = b.hp, playerHp = PLAYER_HP, round = 1;
  let formula: Partial<Record<Role, string>> = {};
  const full18 = false; let fired18 = 0;

  while (round <= MAX_TURNS) {
    let xinli = XINLI_BASE;
    let curedThisTurn = new Set<string>();
    // 跨回合攒方：尽量把四槽补满再结算
    let staged = true;
    while (staged) {
      staged = false;
      for (const r of ROLES) {
        if (formula[r]) continue;
        const k = pickFor(r, formula, hand, b);
        if (!k) continue;
        const cost = H[k]!.cost;
        if (xinli < cost) continue;
        formula[r] = k; hand.splice(hand.indexOf(k), 1); xinli -= cost; staged = true;
      }
    }
    const slotsFull = ROLES.every(r => formula[r]);
    const hasJun = !!formula.jun;
    // 满4味 → 结算；或后期(≥6)且有君 → 结算止损
    if (slotsFull || (hasJun && round >= 6)) {
      const f: Formula = {}; for (const r of ROLES) if (formula[r]) f[r] = H[formula[r]!];
      const res = resolveCombat(f, b);
      if (res.damage >= 17) fired18++;
      const before = bossHp;
      bossHp = Math.max(0, bossHp - res.damage);
      playerHp = Math.max(0, playerHp - res.selfDamage);
      const fn = [f.jun, f.chen, f.zuo, f.shi].filter(Boolean).map(h => h!.name).join('+');
      console.log(`回合${round} 结算[${fn}]：伤${res.damage} 反${res.selfDamage} → BOSS ${before}→${bossHp}, 玩家HP ${playerHp}`);
      if (bossHp <= 0) { console.log(`★ 第${round}回合回春。`); return { win: true, fired18 }; }
      curedThisTurn = new Set(res.curedComplaints);
      // 分流：大毒→消耗，其余→弃牌
      for (const r of ROLES) { const k = formula[r]; if (!k) continue; if ((H[k]!.toxicity) >= 2) ex.push(k); else dc.push(k); }
      formula = {}; xinli = 0;
    } else {
      console.log(`回合${round} 攒方中（手牌${hand.length}，已摆${Object.values(formula).filter(Boolean).length}）`);
    }
    // BOSS 行动 + 兼证恶化（本回合已治的兼证不恶化）
    const it = b.yitu, v = it.value;
    let act = '';
    if (it.type === 'HEAL_SELF') { bossHp = Math.min(b.hp, bossHp + v); act = `BOSS自愈${v}`; }
    else { playerHp = Math.max(0, playerHp - v); act = `玩家受创${v}`; }
    for (const jz of b.jianzheng) {
      if (curedThisTurn.has(jz.name)) { act += `+${jz.name}已治`; continue; }
      const wv = Math.max(1, Math.round(v * 0.6));
      if (jz.worsen === 'HEAL_SELF') { bossHp = Math.min(b.hp, bossHp + wv); }
      else { playerHp = Math.max(0, playerHp - wv); act += `+兼证${jz.name}${wv}`; }
    }
    // 补到5：保留手牌只抽缺的（spec：补到5，非弃光重抽——攒方跨回合才有意义）
    while (hand.length < HAND_START && (dp.length > 0 || dc.length > 0)) { const r = drawOne(dp, dc); if (!r.card) break; hand.push(r.card); dp = r.dp; dc = r.dc; }
    console.log(`  BOSS回合：${act} → 玩家HP ${playerHp}, BOSS ${bossHp}, 手${hand.length} 牌库${dp.length} 弃${dc.length} 消耗${ex.length}`);
    if (playerHp <= 0) { console.log(`✕ 第${round}回合玩家力竭。`); return { win: false, fired18 }; }
    round++;
  }
  console.log(`✕ ${MAX_TURNS}回合超时。BOSS残HP ${bossHp}, 玩家HP ${playerHp}`);
  return { win: false, fired18 };
}

let w = 0, l = 0, f18 = 0;
for (let i = 0; i < 10; i++) {
  console.log(`\n===== 第${i + 1}局：${FENGHAN_BIAOSHI.name} =====`);
  const r = run(FENGHAN_BIAOSHI);
  if (r.win) w++; else l++;
  f18 += r.fired18;
}
console.log(`\n教学关 10 局：胜${w} 负${l}；干净18伤害触发 ${f18} 次`);
