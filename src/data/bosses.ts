import type { BossCard } from '../shared/types.js';

// 固定教学关：风寒表实证（麻黄汤）
export const FENGHAN_BIAOSHI: BossCard = {
  id: 'fenghan_biaoshi',
  name: '风寒表实证',
  flavor: '恶寒发热，无汗头身疼痛，咳喘。',
  bagang: { biaoli: '表', hanre: '寒', xushi: '实' },
  zhuzheng: {
    requireZhifa: '汗',
    requireGongxiao: '发汗解表',
    desc: '风寒袭表，卫阳被遏。',
  },
  jianzheng: [
    { name: '咳喘', requireGongxiao: '降逆平喘', worsen: 'DEBUFF' },
  ],
  targetGuijing: '肺',
  hp: 40,
  yitu: { type: 'ATTACK', value: 3 },
};
