import { useEffect, useLayoutEffect, useRef, useState } from 'react';
// 复用后端同一套引擎与数据，零逻辑重复（DESIGN: 引擎/UI 分离）
import { resolveCombat, pairQing } from '../shared/combat.js';
import { HERBS, TEACHING_DECK, GENERAL_DECK } from '../data/herbs.js';
import { FENGHAN_BIAOSHI } from '../data/bosses.js';
import type { BossCard, HerbCard, Formula } from '../shared/types.js';
import type { Qiqing, Yitu } from '../shared/enums.js';

type Role = 'jun' | 'chen' | 'zuo' | 'shi';
const ROLES: Role[] = ['jun', 'chen', 'zuo', 'shi'];
const ROLE_NAME: Record<Role, string> = { jun: '君', chen: '臣', zuo: '佐', shi: '使' };
const SIQI_COLOR: Record<string, string> = { 寒: '#3a6ea5', 凉: '#5a9bd4', 温: '#c1440e', 热: '#8b1a1a', 平: '#6a6a6a' };
const QIQING_EXPLAIN: Record<string, string> = {
  相须: '相须·协同增效', 相使: '相使·辅佐助效', 相畏: '相畏·减毒', 相杀: '相杀·消解毒性',
  相恶: '相恶·互相削弱', 相反: '相反·禁忌同用生毒',
};

// BOSS 意图中文化 + 图标 + 配色（枚举见 enums.ts Yitu）
const INTENT: Record<Yitu, { label: string; icon: string; cls: string }> = {
  ATTACK: { label: '攻', icon: '⚔', cls: 'att' },
  DEBUFF: { label: '损', icon: '☣', cls: 'debuff' },
  SUMMON_COMPLAINT: { label: '加重', icon: '✚', cls: 'worsen' },
  HEAL_SELF: { label: '自愈', icon: '✦', cls: 'heal' },
};

// 美工接口：按顺序尝试 png → jpg → jpeg → webp，全失败回退书法字（见 public/art/README.md）
const ART_EXTS = ['png', 'jpg', 'jpeg', 'webp'];

// 生成日志结构（见 data/today-boss.json 的 log 字段）
type GenLog = {
  searchQuery?: string; topic?: string; searchUrl?: string;
  authorName?: string; contentSnippet?: string;
  model?: string; generatedAt?: string;
};
function ArtImg({ srcBase, className }: { srcBase: string; className?: string }) {
  const [idx, setIdx] = useState(0);
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <img className={className} src={`${srcBase}.${ART_EXTS[idx]}`} alt="" onError={() => {
      if (idx + 1 < ART_EXTS.length) setIdx(idx + 1); else setHidden(true);
    }} />
  );
}

const XINLI_BASE = 3;       // 每回合心力（spec: base3）；药卡按 cost 扣（平和0/峻烈2/大毒3）
const HAND_START = 5;       // 每回合补到 5 张（spec）
const PLAYER_HP = 36;      // 自由对局新手校准（原30：BOSS流血过快，+6血给容错）
const MAX_TURNS = 9;      // 自由对局新手校准（原8：+1回合多一次结算窗口；教学1-2回合结算，不受影响）
const FREE_HP_CAP = 30;   // 自由BOSS HP 上限（生成可达48；sim：补到5+弃换3次下，30→AI~52%新手可解）
const FREE_VAL_CAP = 2;   // 自由BOSS 意图值上限（3→2：未治兼证流血7→4/回合，不再第5回合必死）
const SWAP_CAP = 3;       // 每回合弃换次数：补到5的过牌量补足（sim：1次=0%、2次=30%、3次=52%）

// —— 教学演示关：用真实引擎 + 引导层，手把手过一遍麻黄汤 ——
type TutStep = {
  t: string;
  btn?: string;                                   // 叙述步：按钮文案（有则显示按钮）
  glow?: { card?: string; slot?: Role; btn?: 'play'; area?: 'hand' | 'boss' | 'battle' };
  gate?: { type: 'place'; role: Role; key: string } | { type: 'play' };
  milestone?: string;                             // 门控满足时弹出的成就感提示
  act?: 'resetExp';                               // 离开此步时执行的动作（复原实验台）
  done?: boolean;
};
const TUT_HAND = ['mahuang', 'guizhi', 'xingren', 'gancao', 'jinyinhua']; // 固定手牌（4味麻黄汤+1干扰）
const TUT_XINLI = 10;                                                    // 教学不卡资源，专注君臣佐使
const TUT_STEPS: TutStep[] = [
  // —— 认识屏幕 ——
  { t: '欢迎来到本草·局。你是太医，要开方剂治一个病证 BOSS。一剂方分君臣佐使四位。跟着我过一遍麻黄汤，4 分钟学会。', btn: '开始' },
  { t: '这是病证 BOSS「风寒表实」。看它的主证要『发汗解表』——你要找主功效是发汗解表的药当君。看归经『肺』——使药要归肺。', btn: '看懂了', glow: { area: 'boss' } },
  { t: '下方是你的药牌，中间四个空槽就是君臣佐使位。点一张药牌会自动进第一个空位。', btn: '明白', glow: { area: 'hand' } },
  // —— 君：力专主攻 ——
  { t: '主证要『发汗解表』。点【麻黄】放进第一位（君）。麻黄主功效正是发汗解表、且药力专(12)，直取主证——力专主攻者为君。', glow: { card: 'mahuang', slot: 'jun' }, gate: { type: 'place', role: 'jun', key: 'mahuang' }, milestone: '✓ 君药已立！力专主攻，是方的灵魂。' },
  // —— 臣 + 主从原理 ——
  { t: '单味君药力薄。加【桂枝】进臣位。桂枝与麻黄**同是发汗解表**——但麻黄力专主攻=君，桂枝助之=臣。相须是同类增效，仍有主从。', glow: { card: 'guizhi', slot: 'chen' }, gate: { type: 'place', role: 'chen', key: 'guizhi' }, milestone: '✓ 相须已成！同类增效，力 ×1.5。' },
  { t: '看两牌间金色【相须】连线。要点：君臣之分不在功效不同，在主从——主攻者君，助力者臣。两味同功效也能成君臣。', btn: '继续', glow: { area: 'battle' } },
  // —— 佐：还在「治」（治兼证/减毒） ——
  { t: '接下来佐。佐还在『治』：要么治兼证，要么减毒。麻黄峻烈(毒性1)，缺佐反伤满=3；有佐减半。佐是保险丝。', btn: '懂了' },
  { t: '放【杏仁】进佐位。它降逆平喘，治兼证咳喘(佐助)，又监制麻黄减反伤(佐制)。', glow: { card: 'xingren', slot: 'zuo' }, gate: { type: 'place', role: 'zuo', key: 'xingren' }, milestone: '✓ 佐药护航！治兼证 + 减毒。' },
  { t: '看 BOSS 区兼证『咳喘』chip 变 ✓——杏仁治了它。判别口诀：**药在治兼证/减毒 → 佐；药在引路/调和不治症状 → 使**。', btn: '继续', glow: { area: 'boss' } },
  // —— 使：引路（不治症状） ——
  { t: '最后放使药【甘草】。它归肺经，把全方引达病所(引经)——不治咳喘也不减毒，是引路的，故为使。', glow: { card: 'gancao', slot: 'shi' }, gate: { type: 'place', role: 'shi', key: 'gancao' }, milestone: '✓ 引经命中！全方全额。' },
  // —— 出牌 ——
  { t: '君臣佐使齐备。点【出牌结算】，看完整麻黄汤。', glow: { btn: 'play' }, gate: { type: 'play' }, milestone: '✓ 经方大成！18 伤害。' },
  // —— 换君试错：让好奇心变成教学钩子 ——
  { t: '麻黄为君打了 18。换桂枝为君会怎样？我把牌复原，你来摆一剂『桂枝为君』的方，对比看。', btn: '好，复原重摆', act: 'resetExp' },
  { t: '这次桂枝当君。放【桂枝】进君位。', glow: { card: 'guizhi', slot: 'jun' }, gate: { type: 'place', role: 'jun', key: 'guizhi' }, milestone: '✓ 桂枝为君' },
  { t: '麻黄退居臣位——这次它当臣，助桂枝发汗。', glow: { card: 'mahuang', slot: 'chen' }, gate: { type: 'place', role: 'chen', key: 'mahuang' } },
  { t: '佐仍是【杏仁】——治兼证咳喘。', glow: { card: 'xingren', slot: 'zuo' }, gate: { type: 'place', role: 'zuo', key: 'xingren' } },
  { t: '使仍是【甘草】——引经入肺。', glow: { card: 'gancao', slot: 'shi' }, gate: { type: 'place', role: 'shi', key: 'gancao' } },
  { t: '点【出牌结算】，对比伤害。', glow: { btn: 'play' }, gate: { type: 'play' }, milestone: '✓ 对比！' },
  { t: '桂枝为君：15 伤害(麻黄君是 18)，力缓；但反伤 0 更安全。证是表实，麻黄力专才是对的君；桂枝为君更像治表虚的桂枝汤——换君=换治法。进自由对局挑战今日病证。', btn: '进入自由对局', done: true },
];

function shuffle<T>(a: T[]): T[] { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j]!, r[i]!]; } return r; }

// 牌库：教学关=麻黄汤4+通用干扰；今日BOSS关=通用池19。常用药加倍提密度。
function buildDeck(b: BossCard): string[] {
  const pool = b.id === FENGHAN_BIAOSHI.id ? TEACHING_DECK : GENERAL_DECK;
  const extras = ['mahuang', 'guizhi', 'gancao', 'jinyinhua', 'huangqin', 'chenpi', 'fuling'];
  return shuffle([...pool, ...extras]);
}

function buildFormula(f: Partial<Record<Role, string>>): Formula {
  const out: Formula = {};
  for (const r of ROLES) if (f[r]) out[r] = HERBS[f[r] as string];
  return out;
}

// 从 drawPile 抽一张；空则洗弃牌堆回牌库
function drawOne(drawPile: string[], discard: string[]): { card: string | null; draw: string[]; disc: string[] } {
  let dp = drawPile, dc = discard;
  if (dp.length === 0) { dp = shuffle(dc); dc = []; }
  const card = dp.pop() ?? null;
  return { card, draw: dp, disc: dc };
}

export function Game() {
  const [boss, setBoss] = useState<BossCard>(FENGHAN_BIAOSHI);
  const [bossHp, setBossHp] = useState(FENGHAN_BIAOSHI.hp);
  const [drawPile, setDrawPile] = useState<string[]>([]);
  const [discard, setDiscard] = useState<string[]>([]);
  const [exhaust, setExhaust] = useState<string[]>([]);
  const [hand, setHand] = useState<string[]>([]);
  const [formula, setFormula] = useState<Partial<Record<Role, string>>>({});
  const [xinli, setXinli] = useState(XINLI_BASE);
  const [playerHp, setPlayerHp] = useState(PLAYER_HP);
  const [round, setRound] = useState(1);
  const [over, setOver] = useState<null | 'win' | 'lose'>(null);
  const [mode, setMode] = useState<'menu' | 'tutorial' | 'free'>('menu');
  const [tutStep, setTutStep] = useState(0);
  const [tutCelebrate, setTutCelebrate] = useState<string | null>(null); // 门控满足时的成就感弹屏

  const [log, setLog] = useState<string[]>(['太医院试药台已开。组方出牌，破其病证。']);
  const [floatDmg, setFloatDmg] = useState<number | null>(null);
  const [selfDmg, setSelfDmg] = useState(0);
  const [flash, setFlash] = useState(false);
  const [mentor, setMentor] = useState<{ hint: string; source: string } | null>(null);
  const [mentorLoading, setMentorLoading] = useState(false);
  const [bossSource, setBossSource] = useState('教学关');
  // 生成日志（wow点①"这关怎么来的"）+ 兼证本回合解除状态
  const [bossLog, setBossLog] = useState<GenLog | null>(null);
  const [showGenLog, setShowGenLog] = useState(false);
  const [cured, setCured] = useState<Set<string>>(new Set());
  const [tip, setTip] = useState<{ herb: HerbCard; x: number; y: number; w: number } | null>(null);
  const [swapping, setSwapping] = useState(false);    // 弃换模式：点手牌=弃1抽1
  const [swapsLeft, setSwapsLeft] = useState(SWAP_CAP);
  const [bossTip, setBossTip] = useState<{ x: number; y: number } | null>(null);
  const bfRef = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<{ i: number; j: number; qing: Qiqing; x1: number; y1: number; x2: number; y2: number }[]>([]);

  // 起手抽 HAND_START 张，保底含对主证的君药（教学/生成关都保证可解起点）
  function dealStart(b: BossCard) {
    let dp = buildDeck(b), dc: string[] = [];
    const h: string[] = [];
    for (let i = 0; i < HAND_START; i++) { const r = drawOne(dp, dc); if (!r.card) break; h.push(r.card); dp = r.draw; dc = r.disc; }
    const need = b.zhuzheng.requireGongxiao;
    const hasJun = h.some(k => HERBS[k]?.mainGongxiao === need);
    if (!hasJun) {
      // 从牌库里找一味对证的，换进手牌
      const idx = dp.findIndex(k => HERBS[k]?.mainGongxiao === need);
      if (idx >= 0) {
        const swapOut = h[0]!;
        h[0] = dp[idx]!;
        dp[idx] = swapOut;
      }
    }
    setDrawPile(dp); setDiscard(dc); setExhaust([]); setHand(h);
  }

  // 初始化整局
  function initGame(b: BossCard) {
    setBoss(b); setBossHp(b.hp); setFormula({}); setXinli(XINLI_BASE);
    setPlayerHp(PLAYER_HP); setRound(1); setOver(null);
    setLog([`病证「${b.name}」已到。主证要「${b.zhuzheng.requireGongxiao}」，归经${b.targetGuijing}。`]);
    setSelfDmg(0); setMentor(null); setFloatDmg(null);
    setCured(new Set()); setSwapping(false); setSwapsLeft(SWAP_CAP);
    dealStart(b);
  }

  // 模式入口：菜单选「教学演示」或「自由对局」。不自动开局。
  function startTutorial() {
    setMode('tutorial'); setTutStep(0);
    const b = { ...FENGHAN_BIAOSHI, hp: 18 };   // 教学BOSS压到18：一剂麻黄汤(18伤)刚好回春
    setBoss(b); setBossHp(18); setFormula({}); setXinli(TUT_XINLI);
    setPlayerHp(PLAYER_HP); setRound(1); setOver(null);
    setLog(['教学：组麻黄汤，学君臣佐使。']);
    setSelfDmg(0); setMentor(null); setFloatDmg(null); setCured(new Set());
    setDrawPile([]); setDiscard([]); setExhaust([]); setHand([...TUT_HAND]);
    setSwapping(false); setSwapsLeft(0);   // 教学固定手牌，不开弃换
    setBossSource('教学关'); setBossLog(null); setShowGenLog(false);
  }
  // 新手校准：自由对局 BOSS 降压到可解档（hp≤FREE_HP_CAP、意图值≤FREE_VAL_CAP）。
  // 不动经济 spec（xinli3/cost/exhaust/hand5）；只调 BOSS 战斗数值，避免生成上限过难。
  function tuneBoss(b: BossCard): BossCard {
    return { ...b, hp: Math.min(b.hp, FREE_HP_CAP), yitu: { ...b.yitu, value: Math.min(b.yitu.value, FREE_VAL_CAP) } };
  }
  function startFree() {
    setMode('free'); setTutStep(0);
    fetch('/api/today-boss')
      .then(r => r.json())
      .then(j => {
        const raw = j.boss ? (j.boss as BossCard) : FENGHAN_BIAOSHI;
        initGame(tuneBoss(raw));
        setBossSource(j.fallback ? '教学关（兜底）' : '今日病证');
        setBossLog((j.log ?? null) as GenLog | null);
      })
      .catch(() => { initGame(FENGHAN_BIAOSHI); setBossSource('教学关（后端未启动）'); setBossLog(null); });
  }
  function advanceTut() {
    const cur = TUT_STEPS[tutStep];
    if (cur?.act === 'resetExp') resetExp();   // 复原实验台，进入换君试错
    if (tutStep + 1 >= TUT_STEPS.length) { setMode('free'); startFree(); return; }
    setTutStep(tutStep + 1);
  }
  // 换君试错：复原手牌/心力/方剂/BOSS，保留教学模式
  function resetExp() {
    setHand([...TUT_HAND]); setXinli(TUT_XINLI); setFormula({}); setBossHp(boss.hp);
    setPlayerHp(PLAYER_HP); setOver(null); setCured(new Set()); setRound(1);
    setLog(['实验台已复原。换君试试，对比伤害。']);
  }

  // 战场七情连线
  useLayoutEffect(() => {
    const compute = () => {
      const cont = bfRef.current; if (!cont) return;
      const els = Array.from(cont.querySelectorAll<HTMLElement>('.slot'));
      const pos = els.map(s => { const r = s.getBoundingClientRect(); const cr = cont.getBoundingClientRect(); return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2 }; });
      const filled: { idx: number; herb: HerbCard }[] = [];
      ROLES.forEach((r, idx) => { const k = formula[r]; if (k && HERBS[k]) filled.push({ idx, herb: HERBS[k] as HerbCard }); });
      const lk: typeof links = [];
      for (let a = 0; a < filled.length; a++) for (let b = a + 1; b < filled.length; b++) {
        const fa = filled[a]!, fb = filled[b]!;
        const q = pairQing(fa.herb, fb.herb);
        if (q) { const pa = pos[fa.idx]!, pb = pos[fb.idx]!; lk.push({ i: fa.idx, j: fb.idx, qing: q, x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y }); }
      }
      setLinks(lk);
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [formula]);

  const usedKeys = new Set(Object.values(formula).filter(Boolean) as string[]);
  const slotsFull = ROLES.every(r => formula[r]);

  // 教学门控：当前步是否要求 place(role,key)，且已满足
  function tutGateMet(role?: Role, key?: string): boolean {
    if (mode !== 'tutorial') return false;
    const s = TUT_STEPS[tutStep];
    if (s?.gate?.type === 'place' && role && key) return s.gate.role === role && s.gate.key === key;
    return false;
  }
  // 门控满足：弹成就感提示 + 推进一步
  function tutAdvance() {
    const s = TUT_STEPS[tutStep];
    if (s?.milestone) { setTutCelebrate(s.milestone); setTimeout(() => setTutCelebrate(null), 1800); }
    setTutStep(t => Math.min(t + 1, TUT_STEPS.length - 1));
  }

  // 弃1换1：甩掉手牌里的废牌、抽1张新牌。补足「补到5」的过牌量，避免废牌黏手。
  function swapDiscard(key: string) {
    if (over || swapsLeft <= 0 || inTutorial || !hand.includes(key)) return;
    let dp = drawPile, dc = discard;
    const r = drawOne(dp, dc); if (!r.card) return;   // 牌库空且弃牌空
    dp = r.draw; dc = r.disc;
    setHand(hand.filter(k => k !== key).concat(r.card));
    setDrawPile(dp); setDiscard([...dc, key]);   // 选中的牌进弃牌堆
    setSwapsLeft(swapsLeft - 1); setTip(null);
    if (swapsLeft - 1 <= 0) setSwapping(false);
  }
  function place(key: string) {
    if (swapping) { swapDiscard(key); return; }   // 弃换模式：点手牌=弃1抽1
    const cost = HERBS[key]?.cost ?? 1;
    if (over || xinli < cost) return;
    if (!hand.includes(key)) return;
    const role = ROLES.find(r => !formula[r]);
    if (!role) return;
    setFormula({ ...formula, [role]: key });
    setHand(hand.filter(k => k !== key));
    setXinli(xinli - cost);
    setTip(null);
    if (tutGateMet(role, key)) tutAdvance();
  }
  function placeAt(role: Role, key: string) {
    const cost = HERBS[key]?.cost ?? 1;
    if (over || xinli < cost) return;
    if (!hand.includes(key)) return;
    // 若目标位已有牌，先退回手牌（其心力已退）
    const prev = formula[role];
    setFormula({ ...formula, [role]: key });
    let newHand = hand.filter(k => k !== key);
    if (prev) newHand = [...newHand, prev];
    setHand(newHand);
    setXinli(xinli - cost + (prev ? (HERBS[prev]?.cost ?? 1) : 0));
    setTip(null);
    if (tutGateMet(role, key)) tutAdvance();
  }
  function takeBack(r: Role) {
    const k = formula[r]; if (!k) return;
    const cost = HERBS[k]?.cost ?? 1;
    setFormula({ ...formula, [r]: undefined });
    setHand([...hand, k]);
    setXinli(xinli + cost);
  }

  function play() {
    if (over) return;
    // 教学中：仅"出牌结算"步允许结算，且需四味齐
    if (mode === 'tutorial') {
      const s = TUT_STEPS[tutStep];
      if (s?.gate?.type !== 'play') { setLog([...log, '（教学：跟着提示放牌）']); return; }
      if (!ROLES.every(r => formula[r])) { setLog([...log, '（教学：先把君臣佐使四味放齐再结算）']); return; }
    }
    const f = buildFormula(formula);
    const r = resolveCombat(f, boss);
    const newBossHp = Math.max(0, bossHp - r.damage);
    const newPlayerHp = Math.max(0, playerHp - r.selfDamage);
    setLog(r.feedback.concat(newBossHp <= 0 ? ['★ 病证已解，回春。 ★'] : []));
    setSelfDmg(r.selfDamage);
    setBossHp(newBossHp);
    setPlayerHp(newPlayerHp);
    setCured(new Set(r.curedComplaints));
    if (r.damage > 0) {
      setFloatDmg(r.damage); setFlash(true);
      setTimeout(() => { setFloatDmg(null); setFlash(false); }, 950);
    }
    // 结算后方剂分流：大毒(toxicity≥2)进消耗堆不回流，其余进弃牌堆
    const played = Object.values(formula).filter(Boolean) as string[];
    const toExhaust = played.filter(k => (HERBS[k]?.toxicity ?? 0) >= 2);
    const toDiscard = played.filter(k => (HERBS[k]?.toxicity ?? 0) < 2);
    if (toExhaust.length) setExhaust(e => [...e, ...toExhaust]);
    setDiscard([...discard, ...toDiscard]);
    setFormula({}); setXinli(0);
    if (newBossHp <= 0 && mode !== 'tutorial') setOver('win');  // 教学由结业步接管，不弹通用胜利遮罩
    // 教学出牌步：结算后推进到结业步
    if (mode === 'tutorial' && TUT_STEPS[tutStep]?.gate?.type === 'play') tutAdvance();
  }

  function endTurn() {
    if (over) return;
    // BOSS 按意图行动：主意图 + 未解除兼证的恶化意图（"缺哪个痛哪个"闭环）
    const it = boss.yitu; const v = it.value;
    let pHP = playerHp, bHP = bossHp;
    const fb: string[] = [`【BOSS 行动】${boss.name} · ${it.type}×${v}`];
    if (it.type === 'HEAL_SELF') { bHP = Math.min(boss.hp, bHP + v); fb.push(`病证自愈 ${v}（HP ${bHP}）。`); }
    else { pHP = Math.max(0, pHP - v); fb.push(`玩家受创 ${v}（HP ${pHP}）。`); }
    // 兼证未治 → 按其 worsen 意图恶化
    for (const jz of boss.jianzheng) {
      if (cured.has(jz.name)) { fb.push(`兼证「${jz.name}」已治，恶化被阻。`); continue; }
      const w = jz.worsen; const wv = Math.max(1, Math.round(v * 0.6)); // ponytail: 兼证恶化量级 spec 未定，取主意图的0.6倍；平衡偏紧可调小或改 fixed 1。
      if (w === 'HEAL_SELF') { bHP = Math.min(boss.hp, bHP + wv); fb.push(`兼证「${jz.name}」未治，病证自愈 +${wv}。`); }
      else { pHP = Math.max(0, pHP - wv); fb.push(`兼证「${jz.name}」未治，加重 ${wv}（HP ${pHP}）。`); }
    }
    // 抽牌：补到 HAND_START 张（保留手牌，只抽缺的——spec：补到5，非弃光重抽）。
    // 保留手牌让攒方跨回合有意义（麻黄汤攒2回合），否则每回合洗牌纯靠运气。
    let dp = drawPile, dc = discard, h = [...hand];
    while (h.length < HAND_START && (dp.length > 0 || dc.length > 0)) {
      const r = drawOne(dp, dc); if (!r.card) break; h = [...h, r.card]; dp = r.draw; dc = r.disc;
    }
    setPlayerHp(pHP); setBossHp(bHP); setDrawPile(dp); setDiscard(dc); setHand(h);
    setXinli(XINLI_BASE); setRound(round + 1); setCured(new Set());
    setSwapping(false); setSwapsLeft(SWAP_CAP);   // 新回合重置弃换次数
    setLog([...fb, `第 ${round + 1} 回合。`]);
    if (pHP <= 0) setOver('lose');
    else if (round + 1 > MAX_TURNS) { setOver('lose'); setLog([...fb, `限时已尽（${MAX_TURNS} 回合），病证未除。`]); }
  }

  function clearFormula() {
    const back = Object.values(formula).filter(Boolean) as string[];
    if (back.length === 0) return;
    const refund = back.reduce((s, k) => s + (HERBS[k]?.cost ?? 0), 0);
    setHand([...hand, ...back]);
    setFormula({});
    setXinli(xinli + refund);
  }

  function askMentor() {
    setMentorLoading(true);
    fetch('/api/ask-mentor', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formula: buildFormula(formula), boss, feedback: log }),
    })
      .then(r => r.json()).then(j => setMentor({ hint: j.hint, source: j.source }))
      .catch(() => setMentor({ hint: '太医院暂不可达。', source: 'err' }))
      .finally(() => setMentorLoading(false));
  }

  function regen() {
    setBossSource('生成中…');
    fetch('/api/regen-boss', { method: 'POST' })
      .then(r => r.json())
      .then(j => { if (j.ok) { initGame(j.boss as BossCard); setBossSource('今日病证'); setBossLog((j.log ?? null) as GenLog | null); setShowGenLog(false); } else setBossSource('生成失败：' + (j.error || '')); })
      .catch(() => setBossSource('后端未启动'));
  }
  function reset() {
    if (mode === 'tutorial') { startTutorial(); return; }
    initGame(FENGHAN_BIAOSHI); setBossSource('教学关'); setBossLog(null); setShowGenLog(false);
  }

  const hpPct = Math.max(0, bossHp / boss.hp);
  const phpPct = Math.max(0, playerHp / PLAYER_HP);
  const tutGlow = mode === 'tutorial' ? TUT_STEPS[tutStep]?.glow : undefined;
  const inTutorial = mode === 'tutorial';
  // 兼证"已配解药"预览：只要四槽里有药的 主/副功效 命中兼证需求，chip 即显 ✓（结算前也能看到效果）
  const stagedCured = new Set(boss.jianzheng
    .filter(jz => Object.values(formula).filter(Boolean).some(k => {
      const h = HERBS[k]; return !!h && (h.mainGongxiao === jz.requireGongxiao || h.subGongxiao === jz.requireGongxiao);
    }))
    .map(jz => jz.name));

  const formulaEntries = ROLES.map(role => ({ role, key: formula[role], herb: formula[role] ? HERBS[formula[role]] : undefined })).filter(x => x.herb);
  const formulaPower = formulaEntries.reduce((sum, x) => sum + (x.herb?.power ?? 0), 0);
  const formulaCost = formulaEntries.reduce((sum, x) => sum + (x.herb?.cost ?? 0), 0);
  const synergyCount = formulaEntries.flatMap((a, i) => formulaEntries.slice(i + 1).map(b => pairQing(a.herb!, b.herb!))).filter(Boolean).length;
  const mainHit = formulaEntries.some(x => x.herb?.mainGongxiao === boss.zhuzheng.requireGongxiao);
  const meridianHit = formulaEntries.some(x => x.herb?.guiJing.includes(boss.targetGuijing));
  const toxicCount = formulaEntries.filter(x => (x.herb?.toxicity ?? 0) > 0).length;

  // 扇形手牌
  const n = hand.length;
  const mid = (n - 1) / 2;
  const spacing = Math.max(38, Math.min(108, 660 / Math.max(n, 1)));
  const arc = 18;
  const angleK = 2.5;

  return (
    <div className="board">
      <header className="topbar">
        <h1>本草·局</h1>
        <span className="sub">第 <b>{round}</b>/{MAX_TURNS} 回合 · {bossSource}</span>
        <div className="topbtns">
          {!inTutorial && (bossLog || boss.source) && <button onClick={() => setShowGenLog(s => !s)} className="btn ghost">📜 这关怎么来的</button>}
          {!inTutorial && <button onClick={regen} className="btn ghost">↻ 新病证</button>}
          {inTutorial
            ? <button onClick={() => setMode('menu')} className="btn ghost">✕ 退出教学</button>
            : <button onClick={reset} className="btn ghost">↺ 重置</button>}
        </div>
      </header>

      {/* 敌方：BOSS 英雄（顶部居中） */}
      <div className="enemy-zone">
        <div className={`boss-hero ${flash ? 'hit' : ''} ${tutGlow?.area === 'boss' ? 'tut-glow' : ''}`}
          onMouseEnter={(e) => setBossTip({ x: e.currentTarget.getBoundingClientRect().left, y: e.currentTarget.getBoundingClientRect().top })}
          onMouseLeave={() => setBossTip(null)}
        >
          <div className="boss-portrait">
            <ArtImg className="boss-img" srcBase={`/art/boss-${boss.id}`} />
            <span className="seal">证</span>
          </div>
          <div className="boss-info">
            <div className="boss-name">{boss.name}</div>
            <div className="boss-bagang">{boss.bagang.biaoli} · {boss.bagang.hanre} · {boss.bagang.xushi}</div>
            {boss.flavor && <div className="boss-flavor">{boss.flavor}</div>}
            <div className="boss-hpwrap">
              <div className="boss-hpfill" style={{ width: `${hpPct * 100}%` }} />
              <span className="boss-hptext">{bossHp} / {boss.hp}</span>
            </div>
            {boss.jianzheng.length > 0 && (
              <div className="jianzheng-row">
                {boss.jianzheng.map(j => (
                  <span key={j.name} className={`jz-chip ${stagedCured.has(j.name) ? 'cured' : ''}`} title={`需「${j.requireGongxiao}」解除 · 不治则${INTENT[j.worsen]?.label ?? j.worsen}`}>
                    {stagedCured.has(j.name) ? '✓' : '⚠'}{j.name}<sub>{j.requireGongxiao}</sub>
                  </span>
                ))}
              </div>
            )}
            {(() => { const I = INTENT[boss.yitu.type]; return <div className={`boss-intent ${I.cls}`}>下回合意图 · {I.icon} {I.label} ×{boss.yitu.value}</div>; })()}
          </div>
          {floatDmg !== null && <div key={round} className="float-dmg">-{floatDmg}</div>}
        </div>
      </div>

      {/* 战场 */}
      <div className={`battlefield ${tutGlow?.area === 'battle' ? 'tut-glow' : ''}`} ref={bfRef}>
        <svg className="qing-links" width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
          {links.map((l, k) => {
            const cls = l.qing === '相反' ? 'qing-xiangfan' : l.qing === '相恶' ? 'qing-xiangwu' : l.qing === '相须' ? 'qing-xiangxu' : 'qing-other';
            const mx = (l.x1 + l.x2) / 2, my = (l.y1 + l.y2) / 2 - 14;
            return (<g key={k}><line className={cls} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} /><text className="qing-label" x={mx} y={my} textAnchor="middle">{l.qing}</text></g>);
          })}
        </svg>
        {ROLES.map(r => (
          <Slot key={r} role={r}
            herb={formula[r] ? (HERBS[formula[r] as string] ?? null) : null}
            herbKey={formula[r] as string | undefined}
            glow={tutGlow?.slot === r}
            onClick={() => takeBack(r)}
            onDrop={(key) => placeAt(r, key)}
          />
        ))}
      </div>

      <aside className="formula-coach paper-tex" aria-label="方剂诊断">
        <div className="coach-head"><span>方剂诊断</span><b>{formulaEntries.length}/4 味</b></div>
        <div className="coach-meter"><span style={{ width: `${Math.min(100, formulaPower / 48 * 100)}%` }} /></div>
        <div className="coach-grid">
          <div><small>药力</small><strong>{formulaPower || '—'}</strong></div>
          <div><small>心力</small><strong className={formulaCost > XINLI_BASE ? 'warn' : ''}>{formulaCost}/{XINLI_BASE}</strong></div>
          <div><small>联动</small><strong>{synergyCount || '—'}</strong></div>
        </div>
        <div className="coach-checks">
          <span className={mainHit ? 'ok' : ''}>{mainHit ? '✓' : '○'} 主证·{boss.zhuzheng.requireGongxiao}</span>
          <span className={meridianHit ? 'ok' : ''}>{meridianHit ? '✓' : '○'} 归经·{boss.targetGuijing}</span>
          <span className={toxicCount === 0 || formulaEntries.length > toxicCount ? 'ok' : 'warn'}>{toxicCount === 0 ? '✓' : formulaEntries.length > toxicCount ? '◐' : '⚠'} {toxicCount ? `峻烈药 ${toxicCount} 味` : '药性平稳'}</span>
        </div>
        <div className="coach-tip">{!mainHit ? `先找主证：${boss.zhuzheng.requireGongxiao}` : synergyCount ? '七情已连线，出牌可结算' : '再添一味配伍，方力会更完整'}</div>
      </aside>

      {/* 操作按钮 */}
      <div className="actions">
        <button onClick={play} className={`btn primary ${tutGlow?.btn === 'play' ? 'tut-glow' : ''}`} disabled={!!over}>⚔ 出牌结算</button>
        <button onClick={endTurn} className="btn ghost" disabled={!!over || inTutorial}>⏭ 结束回合</button>
        <button onClick={clearFormula} className="btn ghost" disabled={!!over}>✕ 清空方</button>
        <button onClick={() => setSwapping(s => !s)} className={`btn ${swapping ? 'primary' : 'ghost'} ${swapping ? 'swap-active' : ''}`} disabled={!!over || inTutorial || swapsLeft <= 0} title="弃1张废牌、抽1张新牌（每回合2次）">↺ 弃换 {swapsLeft}/{SWAP_CAP}</button>
      </div>

      {/* 玩家区（左下）：心力 + HP */}
      <div className="player-zone">
        <div className="xinli-row">心力 {Array.from({ length: XINLI_BASE }).map((_, i) => <span key={i} className={`xinli ${i < xinli ? 'on' : ''}`}>气</span>)}</div>
        <div className="player-hpwrap"><div className="player-hpfill" style={{ width: `${phpPct * 100}%` }} /><span className="player-hptext">{playerHp} / {PLAYER_HP}</span></div>
      </div>

      {/* 牌库/弃牌/消耗（右下） */}
      <div className="piles">
        <div className="pile" title="抽牌堆"><span className="pile-n">{drawPile.length}</span><span className="pile-l">牌库</span></div>
        <div className="pile" title="弃牌堆"><span className="pile-n">{discard.length}</span><span className="pile-l">弃牌</span></div>
        {exhaust.length > 0 && <div className="pile exhaust" title="消耗堆（大毒用即耗，不回流）"><span className="pile-n">{exhaust.length}</span><span className="pile-l">消耗</span></div>}
      </div>

      {/* 角落浮层：战报（左）太医院（右） */}
      <aside className="side-panel paper-tex log-panel">
        <h2>战报</h2>
        <ul className="log">
          {log.map((s, i) => <li key={i}>{s}</li>)}
          {selfDmg > 0 && <li className="hurt">玩家反伤 {selfDmg}</li>}
        </ul>
      </aside>
      <aside className="side-panel paper-tex mentor-panel">
        <h2>太医院 <button onClick={askMentor} className="btn small" disabled={mentorLoading}>{mentorLoading ? '…' : '问'}</button></h2>
        <div className="mentor-hint">
          {mentor ? <><span className={`tag ${mentor.source}`}>{mentor.source}</span>{mentor.hint}</> : '组方后点「问」点拨方向。'}
        </div>
      </aside>

      {/* 扇形手牌 */}
      {swapping && <div className="swap-hint">弃换中 · 点一张手牌弃掉并抽1张新牌（剩 {swapsLeft} 次）</div>}
      <div className={`hand-fan ${tutGlow?.area === 'hand' ? 'tut-glow' : ''}`}>
        {hand.map((key, i) => {
          const h = HERBS[key]; if (!h) return null;
          const t = mid === 0 ? 0 : (i - mid) / mid;
          const rot = Math.max(-24, Math.min(24, (i - mid) * angleK));
          const yOff = -arc * t * t;
          const fan = `translateX(${(i - mid) * spacing}px) translateY(${yOff}px) rotate(${rot}deg)`;
          return (
            <div className={`card-wrap ${swapping ? 'swappable' : ''}`} key={i + '-' + key}>
              <HerbCardView herbKey={key} herb={h}
                onClick={() => place(key)} disabled={!!over || (!swapping && xinli < (h.cost ?? 1))}
                onHover={(rect) => setTip({ herb: h, x: rect.left, y: rect.top, w: rect.width })}
                onLeave={() => setTip(null)} fan={fan} glow={tutGlow?.card === key}
              />
            </div>
          );
        })}
      </div>

      {tip && (() => {
        const TW = 252;
        const cx = tip.x + tip.w / 2;
        const left = Math.max(8, Math.min(window.innerWidth - TW - 8, cx - TW / 2));
        return (
          <div className="herb-tip paper-tex" style={{ left, top: tip.y - 12, width: TW, transform: 'translateY(-100%)' }}>
            <div className="tip-pointer" style={{ left: Math.max(14, Math.min(TW - 14, cx - left)) }} />
            <div className="tip-name">{tip.herb.name}</div>
            <div className="tip-row">主功效 · <b style={{ color: 'var(--red)' }}>{tip.herb.mainGongxiao}</b>{tip.herb.subGongxiao ? ` · 副 ${tip.herb.subGongxiao}` : ''}</div>
            <div className="tip-row">四气 <b style={{ color: SIQI_COLOR[tip.herb.siqi] }}>{tip.herb.siqi}</b> · 五味 {tip.herb.wuwei ?? '—'}</div>
            <div className="tip-row">药力 <b>{tip.herb.power}</b>{tip.herb.toxicity > 0 ? ` · 毒性 ${tip.herb.toxicity}` : ''}{tip.herb.cost ? ` · 心力 ${tip.herb.cost}` : ' · 心力 0'}</div>
            <div className="tip-row">归经 {tip.herb.guiJing.join('、')}</div>
            {tip.herb.peiwu && tip.herb.peiwu.length > 0 && (
              <div className="tip-pw">配伍 · {tip.herb.peiwu.map(p => `${p.drug}（${QIQING_EXPLAIN[p.qing] ?? p.qing}）`).join('；')}</div>
            )}
            {tip.herb.desc && <div className="tip-desc">{tip.herb.desc}</div>}
          </div>
        );
      })()}

      {bossTip && (
        <div className="herb-tip paper-tex" style={{ left: bossTip.x, top: bossTip.y - 10, transform: 'translateY(-100%)', width: 260 }}>
          <div className="tip-name">{boss.name} <span style={{ fontSize: '.8rem' }}>病证</span></div>
          <div className="tip-row">八纲 · {boss.bagang.biaoli} · {boss.bagang.hanre} · {boss.bagang.xushi}</div>
          <div className="tip-row">主证 · 治法 <b style={{ color: 'var(--red)' }}>{boss.zhuzheng.requireGongxiao}</b> / {boss.zhuzheng.requireZhifa}</div>
          <div className="tip-row">归经 <b>{boss.targetGuijing}</b></div>
          <div className="tip-row">兼证 · {boss.jianzheng.map(j => `${j.name}（${j.requireGongxiao}）`).join('、') || '无'}</div>
          {boss.zhuzheng.desc && <div className="tip-desc">{boss.zhuzheng.desc}</div>}
        </div>
      )}

      {showGenLog && (bossLog || boss.source) && (() => {
        const lg = bossLog ?? {
          topic: boss.source?.topic, searchUrl: boss.source?.hotUrl,
          generatedAt: boss.source?.generatedAt, searchQuery: boss.source?.searchQuery,
        } as GenLog;
        return (
          <div className="genlog-overlay" onClick={() => setShowGenLog(false)}>
            <aside className="genlog paper-tex" onClick={(e) => e.stopPropagation()}>
              <h2>📜 这关怎么来的<button className="genlog-x" onClick={() => setShowGenLog(false)}>✕</button></h2>
              <p className="genlog-lead">本关 BOSS 由 AI 从知乎真实医案提取病机生成，非凭空捏造。</p>
              {lg.topic && <div className="gl-row"><span className="gl-k">来源</span><span className="gl-v">{lg.topic}</span></div>}
              {lg.authorName && <div className="gl-row"><span className="gl-k">作者</span><span className="gl-v">{lg.authorName}</span></div>}
              {lg.searchQuery && <div className="gl-row"><span className="gl-k">检索</span><span className="gl-v">「{lg.searchQuery}」</span></div>}
              {lg.contentSnippet && <div className="gl-snippet">「{lg.contentSnippet}」</div>}
              <div className="gl-meta">
                {lg.model && <span className="tag local">模型 {lg.model}</span>}
                {lg.generatedAt && <span className="gl-time">{new Date(lg.generatedAt).toLocaleString('zh-CN')}</span>}
                {lg.searchUrl && <a className="gl-link" href={lg.searchUrl} target="_blank" rel="noreferrer">查看原医案 ↗</a>}
              </div>
            </aside>
          </div>
        );
      })()}

      {over && (
        <div className="victory">
          <div className="vcard">
            <h2>{over === 'win' ? '★ 回春 ★' : '✕ 功亏一篑 ✕'}</h2>
            <p>{over === 'win' ? `病证「${boss.name}」已解。` : `病证「${boss.name}」未除（${round > MAX_TURNS ? '限时已尽' : '玩家力竭'}）。`}</p>
            <button onClick={reset} className="btn primary">再来一局</button>
          </div>
        </div>
      )}

      {/* 教学引导横幅 */}
      {inTutorial && TUT_STEPS[tutStep] && (() => {
        const s = TUT_STEPS[tutStep]!;
        return (
          <div className="tut-banner paper-tex">
            <div className="tut-prog-bar"><div className="tut-prog-fill" style={{ width: `${((tutStep + 1) / TUT_STEPS.length) * 100}%` }} /></div>
            <div className="tut-prog">{tutStep + 1} / {TUT_STEPS.length}</div>
            <div className="tut-text">{s.t}</div>
            <div className="tut-foot">
              <button className="btn ghost small" onClick={() => setMode('menu')}>跳过</button>
              {s.btn
                ? <button className="btn primary small" onClick={advanceTut}>{s.btn}</button>
                : <span className="tut-wait">→ 跟着高亮操作</span>}
            </div>
          </div>
        );
      })()}

      {/* 成就感弹屏：每次正确操作触发 */}
      {tutCelebrate && <div className="tut-celebrate" key={tutCelebrate}>{tutCelebrate}</div>}

      {/* 模式入口菜单 */}
      {mode === 'menu' && (
        <div className="menu-overlay">
          <div className="menu-card paper-tex">
            <h1>本草·局</h1>
            <p className="menu-sub">中医方剂学卡牌策略对战 · BOSS=病证，卡牌=中药，组方=出牌</p>
            <div className="menu-btns">
              <button className="btn primary" onClick={startTutorial}>教学演示<br /><small>手把手学君臣佐使</small></button>
              <button className="btn ghost" onClick={startFree}>自由对局<br /><small>今日病证 BOSS</small></button>
            </div>
            <p className="menu-hint">第一次玩？从教学演示开始，3 分钟上手。</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Slot({ role, herb, herbKey, onClick, onDrop, glow }: { role: Role; herb: HerbCard | null; herbKey?: string; onClick: () => void; onDrop: (key: string) => void; glow?: boolean }) {
  const [over, setOver] = useState(false);
  const qcol = herb ? (SIQI_COLOR[herb.siqi] ?? '#6a6a6a') : '#6a6a6a';
  return (
    <div
      className={`slot ${herb ? 'filled' : 'empty'} ${over ? 'over' : ''} ${glow ? 'tut-glow' : ''}`}
      onClick={onClick}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const k = e.dataTransfer.getData('text/plain'); if (k) onDrop(k); }}
    >
      {herb ? (
        <div className="board-card">
          <div className="bc-art">
            <ArtImg className="art-img" srcBase={`/art/${herbKey ?? herb.name}`} />
            <span className="art-char">{herb.name[0]}</span>
          </div>
          <div className="bc-foot">
            <div className="bc-name">{herb.name}</div>
            <span className="bc-gx">{herb.mainGongxiao}</span>
            <div className="bc-stat">
              <span className={`seal-num ${herb.toxicity > 0 ? 'toxic' : ''}`} title={`药力 ${herb.power}`}>{herb.power}</span>
              <span className="bc-siqi" style={{ color: qcol }}>{herb.siqi}{herb.toxicity > 0 ? `·毒${herb.toxicity}` : ''}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="slot-role">{ROLE_NAME[role]}</div>
          <div className="slot-empty-hint">拖药至此</div>
        </>
      )}
    </div>
  );
}

function HerbCardView({ herbKey, herb, onClick, disabled, onHover, onLeave, fan, glow }: { herbKey: string; herb: HerbCard; onClick: () => void; disabled?: boolean; onHover: (rect: DOMRect) => void; onLeave: () => void; fan?: string; glow?: boolean }) {
  const qcol = SIQI_COLOR[herb.siqi] ?? '#6a6a6a';
  const draggable = !disabled;
  return (
    <div
      className={`card ${disabled ? 'locked' : ''} ${glow ? 'tut-glow' : ''}`}
      style={fan ? ({ '--fan': fan } as Record<string, string>) : undefined}
      draggable={draggable}
      onDragStart={(e) => { if (!draggable) { e.preventDefault(); return; } e.dataTransfer.setData('text/plain', herbKey); e.dataTransfer.effectAllowed = 'move'; onLeave(); }}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={(e) => onHover(e.currentTarget.getBoundingClientRect())}
      onMouseLeave={onLeave}
    >  <div className="card-art">
        <ArtImg className="art-img" srcBase={`/art/${herbKey}`} />
        <span className="art-char">{herb.name[0]}</span>
      </div>
      <div className="card-foot">
        <div className="card-name">{herb.name}</div>
        <div className="seal-row">
          <span className="seal">{herb.mainGongxiao}</span>
          {herb.subGongxiao && <span className="seal sub">{herb.subGongxiao}</span>}
        </div>
        <div className="stat-row">
          <span className={`seal-num ${herb.toxicity > 0 ? 'toxic' : ''}`} title={`药力 ${herb.power}`}>{herb.power}</span>
          <span className="siqi" style={{ color: qcol }}>{herb.siqi}{herb.toxicity > 0 ? ` · 毒${herb.toxicity}` : ''}</span>
        </div>
        <div className="guijing">归 {herb.guiJing.join(' · ')}</div>
        {herb.peiwu && herb.peiwu.length > 0 && (
          <div className="peiwu">{herb.peiwu.map(p => `${p.drug}${p.qing}`).join('  ')}</div>
        )}
      </div>
    </div>
  );
}
