import type {
  Gongxiao, Siqi, Guijing, Zhifa, Biaoli, Hanre, Xushi, Yitu, Qiqing,
} from './enums.js';

export interface Peiwu {
  drug: string;
  qing: Qiqing;
}

export interface HerbCard {
  name: string;
  mainGongxiao: Gongxiao;
  siqi: Siqi;
  guiJing: Guijing[];
  power: number;          // 药力 5-15，唯一数值
  toxicity: 0 | 1 | 2;    // 峻烈度
  cost: number;           // 心力费用（出牌扣）；平和0、峻烈2、大毒3
  wuwei?: string;         // 五味（可选）
  peiwu?: Peiwu[];        // 七情配伍标签
  subGongxiao?: Gongxiao; // 副功效（对兼证）
  desc?: string;          // 风味/典故
}

export interface Jianzheng {
  name: string;
  requireGongxiao: Gongxiao;
  worsen: Yitu;           // 恶化意图类型
}

export interface BossCard {
  id: string;
  name: string;
  flavor?: string;
  bagang: { biaoli: Biaoli; hanre: Hanre; xushi: Xushi };
  zhuzheng: { requireZhifa: Zhifa; requireGongxiao: Gongxiao; desc?: string };
  jianzheng: Jianzheng[];   // 0-2
  targetGuijing: Guijing;
  hp: number;               // 30-60
  yitu: { type: Yitu; value: number };
  // AI 生成溯源（仅展示，不参与结算）
  source?: { topic?: string; hotUrl?: string; generatedAt?: string; searchQuery?: string };
}

export interface Formula {
  jun?: HerbCard;
  chen?: HerbCard;
  zuo?: HerbCard;
  shi?: HerbCard;
}

export interface CombatResult {
  damage: number;          // 对 BOSS 伤害
  selfDamage: number;      // 玩家反伤（毒性未监制）
  curedComplaints: string[];
  feedback: string[];      // 教学因果（内联/失败即教学用）
}

// 牌堆状态 —— 纯函数操作（src/shared/deck.ts），前端 useReducer 调用。
// 不存 HerbCard 对象，只存 id；具体卡查 HERBS。
export interface DeckState {
  drawPile: string[];      // 抽牌堆（顶 = 末尾 pop）
  hand: string[];          // 手牌
  discardPile: string[];   // 弃牌堆（抽牌堆空时洗回）
  exhaustPile: string[];   // 消耗堆（永不回流）
  xingli: number;          // 本回合剩余心力
  round: number;           // 当前回合（0=未开始）
}
