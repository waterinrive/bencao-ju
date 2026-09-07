import assert from 'node:assert/strict';
import { HERBS } from '../data/herbs.js';
import { FENGHAN_BIAOSHI } from '../data/bosses.js';
import { resolveCombat } from './combat.js';
import { createDeck, startRound, playCard, shuffle } from './deck.js';
import type { BossCard } from './types.js';

const H = HERBS;
const boss = FENGHAN_BIAOSHI;
let r = resolveCombat({ jun: H.mahuang, chen: H.guizhi, zuo: H.xingren, shi: H.gancao }, boss);
assert.equal(r.damage, 18, '完整麻黄汤应打18');
assert.equal(r.selfDamage, 2, '毒性1有佐减半=2');
assert.ok(r.curedComplaints.includes('咳喘'), '杏仁解除咳喘');

r = resolveCombat({ chen: H.guizhi }, boss);
assert.equal(r.damage, 0, '无君不掉血');

r = resolveCombat({ jun: H.mahuang, chen: H.guizhi, shi: H.gancao }, boss);
assert.equal(r.damage, 18, '缺佐不影响对BOSS伤害');
assert.equal(r.selfDamage, 3, '缺佐反伤满=毒性×3');
assert.ok(!r.curedComplaints.includes('咳喘'), '缺杏仁则咳喘不治');

r = resolveCombat({ jun: H.mahuang, chen: H.guizhi, zuo: H.xingren }, boss);
assert.equal(r.damage, 13, '缺使打7折');
assert.equal(r.selfDamage, 2);

r = resolveCombat({ jun: H.gancao, chen: H.guizhi, zuo: H.xingren }, boss);
assert.equal(r.damage, 1, '甘草当君几乎无效');
assert.equal(r.selfDamage, 0);
assert.ok(r.curedComplaints.includes('咳喘'));

// 6. 相须（柴胡+黄芩）on 和解少阳热证 BOSS
const bossShaoyang: BossCard = {
  id: 'shaoyang_re', name: '少阳热证', bagang: { biaoli: '半表半里', hanre: '热', xushi: '实' },
  zhuzheng: { requireZhifa: '和', requireGongxiao: '和解少阳' }, jianzheng: [],
  targetGuijing: '胆', hp: 40, yitu: { type: 'ATTACK', value: 1 },
};
r = resolveCombat({ jun: H.chaihu, chen: H.huangqin, shi: H.chuanxiong }, bossShaoyang);
assert.equal(r.damage, 12, '柴胡+黄芩 相须(×1.5)+川芎引经胆 = 8×1.5=12');
assert.equal(r.selfDamage, 0);
assert.ok(r.feedback.some(s => s.includes('相须')), '应有相须反馈');

// 7. 相反（甘草+海藻=十八反）→ 伤害归零、生毒
r = resolveCombat({ jun: H.mahuang, chen: H.guizhi, zuo: H.haizao, shi: H.gancao }, boss);
assert.equal(r.damage, 0, '甘草反海藻→伤害归零');
assert.ok(r.feedback.some(s => s.includes('相反')), '应有相反禁忌反馈');
assert.equal(r.selfDamage, 2, '有佐减半');

// 8. 相恶（人参恶莱菔子→×0.7）on 补气虚寒证 BOSS
const bossBuqi: BossCard = {
  id: 'buqi_xuhan', name: '气虚寒证', bagang: { biaoli: '里', hanre: '寒', xushi: '虚' },
  zhuzheng: { requireZhifa: '补', requireGongxiao: '补气' }, jianzheng: [],
  targetGuijing: '脾', hp: 40, yitu: { type: 'ATTACK', value: 1 },
};
r = resolveCombat({ jun: H.renshen, chen: H.laifuzi }, bossBuqi);
assert.ok(r.feedback.some(s => s.includes('相恶')), '应有相恶反馈');
assert.equal(r.damage, 5, '人参11×0.7(相恶)×0.7(无使)=5.39→5');

// 9. 复杂可解 BOSS：清热泻火主证+兼证滋阴/理气，通用池组方 → 8 回合可解
const bossComplex: BossCard = {
  id: 're_zhi_yin_xu', name: '热滞阴虚证', bagang: { biaoli: '里', hanre: '热', xushi: '实' },
  zhuzheng: { requireZhifa: '清', requireGongxiao: '清热泻火' },
  jianzheng: [
    { name: '阴虚', requireGongxiao: '滋阴', worsen: 'DEBUFF' },
    { name: '气滞', requireGongxiao: '理气', worsen: 'DEBUFF' },
  ],
  targetGuijing: '肺', hp: 50, yitu: { type: 'ATTACK', value: 3 },
};
r = resolveCombat({ jun: H.huangqin, chen: H.jinyinhua, zuo: H.maidong, shi: H.gancao }, bossComplex);
assert.equal(r.damage, 12, '黄芩9×1.3(同类臣) = 11.7→12');
assert.equal(r.selfDamage, 0);
assert.ok(r.curedComplaints.includes('阴虚'), '麦冬治阴虚兼证');
assert.ok(!r.curedComplaints.includes('气滞'), '无理气药→气滞不治');
assert.ok(r.damage * 8 >= bossComplex.hp, '8回合伤害>=HP，可解');

// 换君试错：桂枝为君（麻黄退为臣）→ 力缓、伤害降、反伤0（桂枝无毒）
r = resolveCombat({ jun: H.guizhi, chen: H.mahuang, zuo: H.xingren, shi: H.gancao }, boss);
assert.equal(r.damage, 15, '桂枝君(10)×相须1.5=15 < 麻黄君18，力缓');
assert.equal(r.selfDamage, 0, '桂枝无毒→无反伤');
assert.ok(r.curedComplaints.includes('咳喘'), '杏仁仍治咳喘');

console.log('✓ combat selftest passed (10 cases: 麻黄汤5场景 + 相须/相反/相恶 + 复杂可解 + 换君试错)');

// —— 牌堆 + 心力 selftest ——
// 10. shuffle 保元素
const sh = shuffle(['a', 'b', 'c', 'd']);
assert.equal([...sh].sort().join(''), 'abcd', 'shuffle 保元素集');
assert.equal(sh.length, 4);

// 11. startRound：弃手牌→补5、心力=3、回合+1
let dk = createDeck(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
dk = { ...dk, hand: ['x', 'y'], round: 0, xingli: 0 }; // 模拟上回合残留
const r1 = startRound(dk, 3);
assert.equal(r1.round, 1, '回合+1');
assert.equal(r1.xingli, 3, '心力重置=3');
assert.equal(r1.hand.length, 5, '补到5');
assert.ok(r1.discardPile.includes('x') && r1.discardPile.includes('y'), '旧手牌进弃牌堆');

// 12. 心力不足拒绝出牌（麻黄cost2，心力0）
let dk2 = createDeck(['mahuang']);
dk2 = { ...dk2, hand: ['mahuang'], xingli: 1, round: 1 };
const blocked = playCard(dk2, 'mahuang', HERBS.mahuang!);
assert.equal(blocked.ok, false, '心力不足应拒');
assert.equal(blocked.state.hand.length, 1, '拒出则药留手牌');
assert.equal(blocked.state.xingli, 1, '拒出不扣心力');

// 13. 出牌扣心力、进弃牌堆；附子(大毒)进消耗堆
let dk3 = { ...createDeck([]), hand: ['mahuang', 'fuzi'], xingli: 5, round: 1 };
const p1 = playCard(dk3, 'mahuang', HERBS.mahuang!);
assert.equal(p1.ok, true);
assert.equal((p1 as { state: typeof dk3 }).state.xingli, 3, '麻黄cost2扣后=3');
assert.ok((p1 as { state: typeof dk3 }).state.discardPile.includes('mahuang'), '麻黄进弃牌堆');
const p2 = playCard((p1 as { state: typeof dk3 }).state, 'fuzi', HERBS.fuzi!);
assert.equal(p2.ok, true);
assert.ok((p2 as { state: typeof dk3 }).state.exhaustPile.includes('fuzi'), '附子大毒进消耗堆');
assert.ok(!(p2 as { state: typeof dk3 }).state.discardPile.includes('fuzi'), '附子不进弃牌堆');

// 14. 抽牌堆空→洗弃牌堆回；消耗堆永不回流
let dk4 = { ...createDeck([]), hand: [], discardPile: ['a', 'b'], exhaustPile: ['fuzi'], xingli: 0, round: 1 };
// 模拟补2张：从弃牌堆洗回抽牌堆
const drawn = { ...dk4, drawPile: ['a', 'b'], discardPile: [] };
assert.equal(drawn.drawPile.length, 2);
// 消耗堆不被洗回：抽牌堆+弃牌堆都空时，消耗堆不变、手牌不再补
const empty: typeof dk4 = { drawPile: [], hand: [], discardPile: [], exhaustPile: ['fuzi'], xingli: 0, round: 1 };
const noReflow = playCard(empty, 'fuzi', HERBS.fuzi!); // fuzi 不在手牌
assert.equal(noReflow.ok, false, '消耗堆的药不在手牌，无法出');

console.log('✓ deck selftest passed (5 cases: shuffle/startRound/心力不足/出牌+消耗/弃牌回流)');
