// BOSS 校验/规整 —— gen-today-boss 与 server 共用。AI 产出的 JSON 必经此门。
import { ZHIFA, GONGXIAO, BIAOLI, HANRE, XUSHI, YITU, GUIJING } from './enums.js';
import type { Gongxiao } from './enums.js';
import type { BossCard, Jianzheng } from './types.js';

// 寒热须与治法一致：清/凉法主热证，温/辛温法主寒证。
// 防止 AI 生成"寒证却要清热泻火"这类自相矛盾、不可解的 BOSS。
const HOT_THERAPY = new Set<Gongxiao>(['清热泻火', '辛凉解表']);
const COLD_THERAPY = new Set<Gongxiao>(['温里散寒', '发汗解表']);

export class BossValidationError extends Error {}

function str(v: unknown, label: string): string {
  if (typeof v !== 'string' || !v) throw new BossValidationError(`${label} 缺失或非字符串`);
  return v;
}

function pick<T extends string>(arr: readonly T[], v: unknown, label: string): T {
  if (typeof v !== 'string' || !arr.includes(v as T))
    throw new BossValidationError(`${label} 不在受控词表: ${String(v)}`);
  return v as T;
}

function num(v: unknown, min: number, max: number, label: string): number {
  const x = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(x)) throw new BossValidationError(`${label} 非数: ${String(v)}`);
  return Math.max(min, Math.min(max, Math.round(x)));
}

function asArr(v: unknown, label: string): unknown[] {
  if (!Array.isArray(v)) throw new BossValidationError(`${label} 非数组`);
  return v;
}

/**
 * 把 AI 产出的任意 JSON 规整为合法 BossCard。越界值 clamp，枚举不中则抛。
 * 信任边界：这是外部 LLM 输出，必须严校。
 */
export function validateBoss(raw: unknown): BossCard {
  const o = raw as Record<string, unknown>;
  if (!o || typeof o !== 'object') throw new BossValidationError('BOSS 非对象');

  const bagangRaw = o.bagang as Record<string, unknown> ?? {};
  const zhuzhengRaw = o.zhuzheng as Record<string, unknown> ?? {};
  const yituRaw = o.yitu as Record<string, unknown> ?? {};
  const jzRaw = asArr(o.jianzheng, 'jianzheng');

  const jianzheng: Jianzheng[] = jzRaw.slice(0, 2).map((j, i) => {
    const jr = j as Record<string, unknown>;
    return {
      name: str(jr.name, `jianzheng[${i}].name`),
      requireGongxiao: pick(GONGXIAO, jr.requireGongxiao, `jianzheng[${i}].requireGongxiao`),
      worsen: pick(YITU, jr.worsen, `jianzheng[${i}].worsen`),
    };
  });

  const boss: BossCard = {
    id: str(o.id, 'id'),
    name: str(o.name, 'name'),
    flavor: typeof o.flavor === 'string' ? o.flavor : undefined,
    bagang: {
      biaoli: pick(BIAOLI, bagangRaw.biaoli, 'bagang.biaoli'),
      hanre: pick(HANRE, bagangRaw.hanre, 'bagang.hanre'),
      xushi: pick(XUSHI, bagangRaw.xushi, 'bagang.xushi'),
    },
    zhuzheng: {
      requireZhifa: pick(ZHIFA, zhuzhengRaw.requireZhifa, 'zhuzheng.requireZhifa'),
      requireGongxiao: pick(GONGXIAO, zhuzhengRaw.requireGongxiao, 'zhuzheng.requireGongxiao'),
      desc: typeof zhuzhengRaw.desc === 'string' ? zhuzhengRaw.desc : undefined,
    },
    jianzheng,
    targetGuijing: pick(GUIJING, o.targetGuijing, 'targetGuijing'),
    hp: num(o.hp, 25, 40, 'hp'),
    yitu: {
      type: pick(YITU, yituRaw.type, 'yitu.type'),
      value: num(yituRaw.value, 1, 3, 'yitu.value'),
    },
  };
  return boss;
}

/** 难度闸：加法模型，教学关 FENGHAN_BIAOSHI 正好 60（hp40 + yitu3×5 + 兼证1×5）。
 *  新手教学游戏：自由对局与教学关同档难度，阈值 60 = 教学关上限。极端组合生成期即拦截。 */
export function difficultyOk(b: BossCard): boolean {
  return b.hp + b.yitu.value * 5 + b.jianzheng.length * 5 <= 60;
}

/** 病机一致性闸：寒热 ↔ 治法方向必须一致。违者不可解（寒证下寒凉药 = ×0.4 反噬，主证却要清热），
 *  生成期即拦截，不进缓存。 */
export function bossConsistent(b: BossCard): boolean {
  if (HOT_THERAPY.has(b.zhuzheng.requireGongxiao) && b.bagang.hanre !== '热') return false;
  if (COLD_THERAPY.has(b.zhuzheng.requireGongxiao) && b.bagang.hanre !== '寒') return false;
  return true;
}
