// 共享受控词汇表（枚举契约）—— BOSS↔药卡↔引擎的硬契约
// boss-designer 生成 BOSS 时只能在这些枚举内填值。

export const ZHIFA = ['汗', '吐', '下', '和', '温', '清', '消', '补'] as const;
export type Zhifa = (typeof ZHIFA)[number];

export const GONGXIAO = [
  '发汗解表', '辛凉解表', '清热泻火', '温里散寒',
  '补气', '补血', '滋阴', '理气', '活血',
  '降逆平喘', '利水渗湿', '和解少阳',
] as const;
export type Gongxiao = (typeof GONGXIAO)[number];

export const SIQI = ['寒', '凉', '温', '热', '平'] as const;
export type Siqi = (typeof SIQI)[number];

export const GUIJING = [
  '肺', '大肠', '胃', '脾', '心', '小肠',
  '膀胱', '肾', '心包', '三焦', '胆', '肝',
] as const;
export type Guijing = (typeof GUIJING)[number];

export const BIAOLI = ['表', '里', '半表半里'] as const;
export type Biaoli = (typeof BIAOLI)[number];

export const HANRE = ['寒', '热'] as const;
export type Hanre = (typeof HANRE)[number];

export const XUSHI = ['虚', '实'] as const;
export type Xushi = (typeof XUSHI)[number];

export const YITU = ['ATTACK', 'DEBUFF', 'SUMMON_COMPLAINT', 'HEAL_SELF'] as const;
export type Yitu = (typeof YITU)[number];

export const QIQING = ['相须', '相使', '相畏', '相杀', '相恶', '相反'] as const;
export type Qiqing = (typeof QIQING)[number];
