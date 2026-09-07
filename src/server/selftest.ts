// 后端规则自检 —— mentor 本地规则覆盖四缺位场景，validateBoss clamp 枚举。
// 跑：pnpm test:server （tsx）
import assert from 'node:assert/strict';
import { HERBS } from '../data/herbs.js';
import { FENGHAN_BIAOSHI } from '../data/bosses.js';
import { mentorHintLocal } from './mentor.js';
import { validateBoss, difficultyOk, bossConsistent, BossValidationError } from '../shared/validate.js';
import type { BossCard } from '../shared/types.js';

const H = HERBS;
const boss = FENGHAN_BIAOSHI;

// 1. 空方 → 缺君
assert.ok(mentorHintLocal({}, boss).includes('无君'), '空方应提示缺君');

// 2. 君不对证 → 换君
const h2 = mentorHintLocal({ jun: H.gancao }, boss); // 甘草补气 ≠ 发汗解表
assert.ok(h2.includes('不对主证'), `应提示君不对证，实际：${h2}`);

// 3. 君对、缺臣 → 缺臣
const h3 = mentorHintLocal({ jun: H.mahuang }, boss);
assert.ok(h3.includes('缺臣'), `应提示缺臣，实际：${h3}`);

// 4. 君臣齐、缺使 → 缺使（兼证由杏仁治，但这里没佐，先走兼证检查——杏仁未入方，咳喘未治）
const h4 = mentorHintLocal({ jun: H.mahuang, chen: H.guizhi }, boss);
assert.ok(h4.includes('兼证'), `应提示兼证未治，实际：${h4}`);

// 5. 完整方 → 可出牌
const h5 = mentorHintLocal({ jun: H.mahuang, chen: H.guizhi, zuo: H.xingren, shi: H.gancao }, boss);
assert.ok(h5.includes('周全'), `应提示可出牌，实际：${h5}`);

// 6. validateBoss: 合法对象通过
const valid: BossCard = {
  id: 'test', name: '测试证', bagang: { biaoli: '表', hanre: '寒', xushi: '实' },
  zhuzheng: { requireZhifa: '汗', requireGongxiao: '发汗解表' },
  jianzheng: [], targetGuijing: '肺', hp: 40, yitu: { type: 'ATTACK', value: 1 },
};
assert.equal(validateBoss(valid).hp, 40);

// 7. validateBoss: 越界 hp clamp
const clamped = validateBoss({ ...valid, hp: 999 });
assert.equal(clamped.hp, 60, 'hp 越界应 clamp 到 60');

// 8. validateBoss: 非法枚举抛
assert.throws(
  () => validateBoss({ ...valid, zhuzheng: { requireZhifa: '飞', requireGongxiao: '发汗解表' } }),
  BossValidationError,
);
assert.throws(
  () => validateBoss({ ...valid, yitu: { type: 'PUNCH', value: 1 } }),
  BossValidationError,
);

// 9. 难度闸：加法模型，教学关 40+15+5=60 通过
assert.ok(difficultyOk(valid), '教学级难度应通过');
assert.ok(!difficultyOk({ ...valid, hp: 60, yitu: { type: 'ATTACK', value: 5 } }),
  '极端难度（60+25+0=85）应拦截');

// 10. 病机一致性：寒热↔治法。清热泻火必热证；温里散寒必寒证
assert.ok(bossConsistent(valid), '风寒证+发汗解表 一致');
assert.ok(!bossConsistent({ ...valid, zhuzheng: { ...valid.zhuzheng, requireGongxiao: '清热泻火' } }),
  '寒证却清热泻火 = 矛盾');
assert.ok(bossConsistent({ ...valid, bagang: { ...valid.bagang, hanre: '热' }, zhuzheng: { ...valid.zhuzheng, requireGongxiao: '清热泻火', requireZhifa: '清' } }),
  '热证+清热泻火 一致');

console.log('✓ backend selftest passed (11 cases: mentor×5 + validate×4 + 难度×1 + 一致性×1)');
