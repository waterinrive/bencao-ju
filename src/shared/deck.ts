// 牌堆纯逻辑 —— draw/discard/exhaust 三层 + 心力费用。前端 useReducer 调用。
// 纯函数、不可变：每个操作返回新 DeckState。不 import herbs，调方传 HerbCard（解耦）。
import type { DeckState, HerbCard } from './types.js';

/** Fisher-Yates 洗牌（纯，返新数组）。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

/** 峻毒药（toxicity>=2）出过即消耗，永不回流。ponytail: 炮制升级长期版改显式 exhaust 字段。 */
function exhaustsOnPlay(h: HerbCard): boolean {
  return h.toxicity >= 2;
}

/** 开局：洗牌成抽牌堆，手牌/弃牌/消耗空，心力0，回合0。 */
export function createDeck(deckIds: string[]): DeckState {
  return {
    drawPile: shuffle(deckIds),
    hand: [],
    discardPile: [],
    exhaustPile: [],
    xingli: 0,
    round: 0,
  };
}

/** 补手牌到 n 张：抽牌堆空则洗弃牌堆回抽牌堆；都空则停（手牌 < n）。 */
function drawTo(state: DeckState, n: number): DeckState {
  const s: DeckState = {
    ...state,
    drawPile: [...state.drawPile],
    hand: [...state.hand],
    discardPile: [...state.discardPile],
  };
  while (s.hand.length < n) {
    if (s.drawPile.length === 0) {
      if (s.discardPile.length === 0) break; // 牌堆见底，无牌可补
      s.drawPile = shuffle(s.discardPile);
      s.discardPile = [];
    }
    s.hand.push(s.drawPile.pop()!);
  }
  return s;
}

/** 开新回合：手牌→弃牌堆，心力重置=base，回合+1，补到 5。 */
export function startRound(state: DeckState, base = 3): DeckState {
  const discarded: DeckState = {
    ...state,
    hand: [],
    discardPile: [...state.discardPile, ...state.hand],
    xingli: base,
    round: state.round + 1,
  };
  return drawTo(discarded, 5);
}

export type PlayResult =
  | { ok: true; state: DeckState }
  | { ok: false; state: DeckState; reason: string };

/** 出牌：扣心力，手牌移除；峻毒→消耗堆，其余→弃牌堆。心力不足/不在手牌则拒绝（状态不变）。 */
export function playCard(state: DeckState, herbId: string, herb: HerbCard): PlayResult {
  if (!state.hand.includes(herbId)) return { ok: false, state, reason: '不在手牌' };
  if (state.xingli < herb.cost) return { ok: false, state, reason: '心力不足' };
  const hand = state.hand.filter(id => id !== herbId);
  const xingli = state.xingli - herb.cost;
  if (exhaustsOnPlay(herb)) {
    return { ok: true, state: { ...state, hand, xingli, exhaustPile: [...state.exhaustPile, herbId] } };
  }
  return { ok: true, state: { ...state, hand, xingli, discardPile: [...state.discardPile, herbId] } };
}
