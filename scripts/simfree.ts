// 自由对局试玩模拟：对 today-boss 跑贪心 AI，看新手难度。
// 跑：tsx scripts/simfree.ts
import { resolveCombat } from '../src/shared/combat.js';
import { HERBS, GENERAL_DECK } from '../src/data/herbs.js';
import type { BossCard, Formula, HerbCard } from '../src/shared/types.js';
import * as fs from 'fs';

type Role = 'jun' | 'chen' | 'zuo' | 'shi';
const ROLES: Role[] = ['jun', 'chen', 'zuo', 'shi'];
// 新手校准参数（可 env 覆盖），扫难度甜点
const HP_CAP = Number(process.env.HP_CAP ?? 32);
const VAL_CAP = Number(process.env.VAL_CAP ?? 2);
const PHP = Number(process.env.PHP ?? 36);
const XINLI_BASE = 3, HAND_START = 5, PLAYER_HP = PHP, MAX_TURNS = Number(process.env.TURNS ?? 9), SWAP_CAP = Number(process.env.SWAP_CAP ?? 3);
const H = HERBS;
const data = JSON.parse(fs.readFileSync(new URL('../data/today-boss.json', import.meta.url), 'utf8'));
const RAW = data.boss as BossCard;
const BOSS: BossCard = { ...RAW, hp: Math.min(RAW.hp, HP_CAP), yitu: { ...RAW.yitu, value: Math.min(RAW.yitu.value, VAL_CAP) } };
const PLAYER_HP_TUNE = 36;

function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = r[i]!; r[i] = r[j]!; r[j] = t; } return r; }
const extras: string[] = []; // 不加冗余 extras：18张原deck循环更快，补到5能抽回君药
function buildDeck(): string[] { return shuffle([...GENERAL_DECK, ...extras]); }
function drawOne(dp: string[], dc: string[]) { let d = dp, c = dc; if (d.length === 0) { d = shuffle(c); c = []; } const card = d.pop() ?? null; return { card, dp: d, dc: c }; }
function pickFor(role: Role, f: Partial<Record<Role, string>>, hand: string[], b: BossCard): string | null {
  const used = new Set(Object.values(f).filter(Boolean));
  const jun = f.jun ? H[f.jun] : null;
  const want = (pred: (h: HerbCard) => boolean) => hand.find(k => !used.has(k) && H[k] && pred(H[k]!)) ?? null;
  if (role === 'jun') return want(h => h.mainGongxiao === b.zhuzheng.requireGongxiao);
  if (role === 'chen' && jun) return want(h => jun.peiwu?.some(p => p.drug === h.name) ?? false) ?? want(h => h.mainGongxiao === jun.mainGongxiao);
  if (role === 'zuo') { for (const jz of b.jianzheng) { const z = want(h => h.mainGongxiao === jz.requireGongxiao || h.subGongxiao === jz.requireGongxiao); if (z) return z; } if (jun && jun.toxicity > 0) return want(h => h.mainGongxiao !== jun.mainGongxiao); return want(() => true); }  // 真佐优先，无则废牌占槽（新手会填满求结算）
  if (role === 'shi') return want(h => h.guiJing.includes(b.targetGuijing)) ?? want(() => true);
  return null;
}
function run(b: BossCard): { win: boolean; dmgDealt: number } {
  let dp = buildDeck(), dc: string[] = [], ex: string[] = [];
  const hand: string[] = [];
  for (let i = 0; i < HAND_START; i++) { const r = drawOne(dp, dc); if (!r.card) break; hand.push(r.card); dp = r.dp; dc = r.dc; }
  const need = b.zhuzheng.requireGongxiao;
  if (!hand.some(k => H[k]?.mainGongxiao === need)) { const idx = dp.findIndex(k => H[k]?.mainGongxiao === need); if (idx >= 0) { const so = hand[0]!; hand[0] = dp[idx]!; dp[idx] = so; } }
  let bossHp = b.hp, playerHp = PLAYER_HP, round = 1, totalDmg = 0;
  let f: Partial<Record<Role, string>> = {};
  while (round <= MAX_TURNS) {
    let xinli = XINLI_BASE; let curedThisTurn = new Set<string>(); let staged = true;
    while (staged) { staged = false; for (const r of ROLES) { if (f[r]) continue; const k = pickFor(r, f, hand, b); if (!k) continue; const c = H[k]!.cost; if (xinli < c) continue; f[r] = k; hand.splice(hand.indexOf(k), 1); xinli -= c; staged = true; } }
    // 弃换（上限 SWAP_CAP/回合）：甩掉不匹配缺口的手牌、各抽1张——保留好牌+循环废牌
    for (let s = 0; s < SWAP_CAP && s < hand.length; s++) {
      const needs = ROLES.filter(r => !f[r]).map(r => pickFor(r, f, hand, b)).filter(Boolean) as string[];
      const dead = hand.find(k => !needs.includes(k));
      if (!dead) break;
      hand.splice(hand.indexOf(dead), 1); s--;
      const r2 = drawOne(dp, dc); if (r2.card) hand.push(r2.card); else break; dp = r2.dp; dc = r2.dc;
    }
    const slotsFull = ROLES.every(r => f[r]); const hasJun = !!f.jun; const hasChen = !!f.chen;
    // 4齐→结；或 君+臣已成且中盘→结换牌兼治兼证；或 临终有君→止损
    if (slotsFull || (hasJun && hasChen && round >= 3) || (hasJun && round >= 6)) {
      const ff: Formula = {}; for (const r of ROLES) if (f[r]) ff[r] = H[f[r]!];
      const res = resolveCombat(ff, b); const before = bossHp; bossHp = Math.max(0, bossHp - res.damage); playerHp = Math.max(0, playerHp - res.selfDamage); totalDmg += res.damage;
      console.log(`  回${round} 结算 伤${res.damage} 反${res.selfDamage} BOSS ${before}→${bossHp} HP${playerHp}`);
      if (bossHp <= 0) { console.log(`★ 第${round}回合回春`); return { win: true, dmgDealt: totalDmg }; }
      curedThisTurn = new Set(res.curedComplaints);
      for (const r of ROLES) { const k = f[r]; if (!k) continue; if (H[k]!.toxicity >= 2) ex.push(k); else dc.push(k); }
      f = {}; xinli = 0;
    } else console.log(`  回${round} 攒方 已摆${Object.values(f).filter(Boolean).length}`);
    const it = b.yitu, v = it.value; let act = '';
    if (it.type === 'HEAL_SELF') { bossHp = Math.min(b.hp, bossHp + v); act = `BOSS自愈${v}`; } else { playerHp = Math.max(0, playerHp - v); act = `玩家受创${v}`; }
    for (const jz of b.jianzheng) { if (curedThisTurn.has(jz.name)) { act += `+${jz.name}已治`; continue; } const wv = Math.max(1, Math.round(v * 0.6)); if (jz.worsen === 'HEAL_SELF') { bossHp = Math.min(b.hp, bossHp + wv); } else { playerHp = Math.max(0, playerHp - wv); act += `+兼${jz.name}${wv}`; } }
    // 补到5：保留手牌只抽缺的（spec：补到5，非弃光重抽——攒方跨回合才有意义）
    while (hand.length < HAND_START && (dp.length > 0 || dc.length > 0)) { const r = drawOne(dp, dc); if (!r.card) break; hand.push(r.card); dp = r.dp; dc = r.dc; }
    console.log(`  BOSS回合：${act} → HP${playerHp} BOSS${bossHp} 手${hand.length}`);
    if (playerHp <= 0) { console.log(`✕ 第${round}回合力竭`); return { win: false, dmgDealt: totalDmg }; }
    round++;
  }
  console.log(`✕ 超时 BOSS残${bossHp} HP${playerHp} 总伤${totalDmg}`); return { win: false, dmgDealt: totalDmg };
}

console.log(`=== ${BOSS.name} hp${BOSS.hp} 君需${BOSS.zhuzheng.requireGongxiao} 使归${BOSS.targetGuijing} 兼证${BOSS.jianzheng.map(j => j.name + '/' + j.requireGongxiao).join(',')} 意图${BOSS.yitu.type}×${BOSS.yitu.value} ===`);
let w = 0, l = 0, dmg = 0;
for (let i = 0; i < 20; i++) { const r = run(BOSS); if (r.win) w++; else l++; dmg += r.dmgDealt; }
console.log(`自由对局 20局[hp≤${HP_CAP} val≤${VAL_CAP} php${PHP}]：胜${w}负${l}；场均伤害${Math.round(dmg / 20)}（BOSS HP ${BOSS.hp}）`);
