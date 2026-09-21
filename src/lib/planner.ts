/**
 * 四轮耦合离散搜索。
 *
 * 决策变量：每个车轮的径向进刀 d_i（只能去料 ⇒ d_i ≥ dMin_i；不越最小轮径 ⇒ d_i ≤ dMax_i），
 * 取值为进刀步长的整数倍。镟后直径 D_i(d_i)=D实测_i − 2(d_i + tapingY_i)。
 *
 * 约束：
 *  - 同轴径差 |D_M1−D_M2| ≤ axleDiffLimit，|D_T1−D_T2| ≤ axleDiffLimit；
 *  - 转向架径差 max D − min D ≤ bogieDiffLimit。
 * 枚举（每轮层数受“无需比最小需求再深 bogie/2+步长”剪枝），按
 * 总去除量 → 最大单轮切深 → 剩余寿命排序。无解时逐约束松弛定位控制车轮。
 */
import type {
  Candidate,
  Infeasibility,
  PlanResult,
  PlannerSettings,
  WheelPos,
} from './types';
import { AXLE_PAIRS, WHEEL_POS } from './types';
import type { WheelComputed } from './pipeline';

export type { WheelComputed };

const TOP_N = 20;

interface RelaxFlags {
  minDiameter: boolean;
  axle: boolean;
  bogie: boolean;
}

export function searchPlan(
  wheels: Record<WheelPos, WheelComputed | null>,
  settings: PlannerSettings,
): PlanResult {
  const perWheel = Object.fromEntries(
    WHEEL_POS.map((p) => [p, wheels[p]?.analysis ?? null]),
  ) as PlanResult['perWheel'];

  // 1) 致命：轮廓不可用（缺测/覆盖不足/对齐失败 → dMin 不可信）
  const missing = WHEEL_POS.filter((p) => !wheels[p]);
  const gapBlocked = WHEEL_POS.filter(
    (p) =>
      wheels[p] &&
      (!Number.isFinite(wheels[p]!.analysis.dMin) ||
        wheels[p]!.analysis.coverage === 0 ||
        wheels[p]!.analysis.notices.some(
          (n) => n.severity === 'error' && (n.code === 'gap' || n.code === 'cut-gap' || n.code === 'coverage'),
        )),
  );
  if (missing.length > 0 || gapBlocked.length > 0) {
    return {
      feasible: false,
      candidates: [],
      perWheel,
      infeasibility: {
        constraint: 'noValidProfile',
        controlling: [...missing, ...gapBlocked],
        message: `车轮 ${[...missing, ...gapBlocked].join('、')} 轮廓缺失或加工区间存在缺测，无法进行四轮搜索`,
        detail: '请补测对应车轮后重新计算；系统不会跨缺段插值硬凑切深',
      },
    };
  }

  // 2) 单轮最小轮径冲突
  const blocked = WHEEL_POS.filter((p) => {
    const a = wheels[p]!.analysis;
    return !(a.dMax >= a.dMin);
  });
  if (blocked.length > 0) {
    return {
      feasible: false,
      candidates: [],
      perWheel,
      infeasibility: {
        constraint: 'minDiameter',
        controlling: blocked,
        message: `车轮 ${blocked.join('、')} 即使按各自最小切深镟修，镟后直径仍低于最小轮径 ${settings.minDiameter} mm`,
        detail: blocked
          .map((p) => {
            const a = wheels[p]!.analysis;
            return `${p}：需要 r≥${a.dMin.toFixed(2)} mm，允许 r≤${a.dMax.toFixed(2)} mm`;
          })
          .join('；'),
      },
    };
  }

  const result = enumerate(wheels, settings, { minDiameter: false, axle: false, bogie: false });
  if (result.feasible) return { ...result, perWheel };
  if (result.searchTooLarge) {
    return {
      feasible: false,
      candidates: [],
      perWheel,
      infeasibility: {
        constraint: 'searchSpace',
        controlling: [],
        message: '离散搜索空间超过 200 万组合上限（限值差远大于进刀步长时可能出现）',
        detail: '请调大进刀步长或收紧径差/最小轮径限值后重试',
      },
    };
  }

  // 3) 逐约束松弛，判定无解由谁控制
  const relD = enumerate(wheels, settings, { minDiameter: true, axle: false, bogie: false }).feasible;
  const relA = enumerate(wheels, settings, { minDiameter: false, axle: true, bogie: false }).feasible;
  const relB = enumerate(wheels, settings, { minDiameter: false, axle: false, bogie: true }).feasible;

  // 强制最小切深下的直径分布（最浅可行状态）
  const forced = WHEEL_POS.map((p) => {
    const a = wheels[p]!.analysis;
    const d = Math.ceil(a.dMin / settings.feedStep - 1e-9) * settings.feedStep;
    return { pos: p, d, D: wheels[p]!.input.rollingDiameter - 2 * (d + a.tapingY) };
  });
  const dHi = forced.reduce((a, b) => (b.D > a.D ? b : a));
  const dLo = forced.reduce((a, b) => (b.D < a.D ? b : a));
  const spread = dHi.D - dLo.D;

  let infeas: Infeasibility;
  if (!relD) {
    // 放松最小轮径仍无解：径差结构本身冲突，报告高低两端控制轮
    infeas = {
      constraint: spread > settings.bogieDiffLimit ? 'bogieDiff' : 'axleDiff',
      controlling: [dHi.pos, dLo.pos],
      message: `即使放开最小轮径限制，径差仍无法收敛：当前最浅方案转向架径差 ${spread.toFixed(2)} mm（限值 ${settings.bogieDiffLimit}）`,
      detail: `高端 ${dHi.pos}（D=${dHi.D.toFixed(1)}）、低端 ${dLo.pos}（D=${dLo.D.toFixed(1)}）；需复核实测直径或放宽径差限值`,
    };
  } else if (!relB || spread > settings.bogieDiffLimit) {
    infeas = {
      constraint: 'bogieDiff',
      controlling: [dHi.pos, dLo.pos],
      message: `转向架径差无解：最浅方案 spread=${spread.toFixed(2)} mm > 限值 ${settings.bogieDiffLimit} mm，而高端轮受最小轮径限制不能再切深`,
      detail: `高端 ${dHi.pos} 已到最小轮径允许切深 ${wheels[dHi.pos]!.analysis.dMax.toFixed(2)} mm；考虑更换车轮或放宽限值`,
    };
  } else {
    // 定位超限轴
    const axles = AXLE_PAIRS.map(([i, j]) => {
      const fi = forced.find((f) => f.pos === i)!;
      const fj = forced.find((f) => f.pos === j)!;
      return { pair: [i, j] as [WheelPos, WheelPos], diff: Math.abs(fi.D - fj.D) };
    }).filter((a) => a.diff > settings.axleDiffLimit);
    infeas = {
      constraint: 'axleDiff',
      controlling: [dHi.pos, dLo.pos],
      message: `同轴径差无解：${axles.map((a) => `${a.pair[0]}/${a.pair[1]} 差 ${a.diff.toFixed(2)} mm`).join('；')}（限值 ${settings.axleDiffLimit}）`,
      detail: `受最小轮径约束，大径轮无法继续切深配平；控制轮为 ${dHi.pos}`,
    };
  }
  void relA;
  return { feasible: false, candidates: [], perWheel, infeasibility: infeas };
}

function enumerate(
  wheels: Record<WheelPos, WheelComputed | null>,
  settings: PlannerSettings,
  relax: RelaxFlags,
): { feasible: boolean; candidates: Candidate[]; searchTooLarge?: boolean } {
  const step = settings.feedStep;

  // 各轮最小网格切深
  const base = WHEEL_POS.map((p) => {
    const a = wheels[p]!.analysis;
    return Math.max(0, Math.ceil(a.dMin / step - 1e-9) * step);
  });
  // 剪枝上界：任何轮都不需要比全体最深需求再多切 bogie/2 + 一步（径差按直径计）
  const needCap = Math.max(...base) + settings.bogieDiffLimit / 2 + step;

  const levels: number[][] = WHEEL_POS.map((p, i) => {
    const a = wheels[p]!.analysis;
    const cap = relax.minDiameter ? needCap : Math.min(a.dMax, needCap);
    const lv: number[] = [];
    for (let d = base[i]; d <= cap + 1e-9; d += step) lv.push(+d.toFixed(6));
    return lv;
  });

  const provisional = WHEEL_POS.some((p) => wheels[p]!.analysis.unstable);

  const best: Candidate[] = [];
  const idx = [0, 0, 0, 0];
  const D = [0, 0, 0, 0];
  const cuts: Record<WheelPos, number> = { M1: 0, M2: 0, T1: 0, T2: 0 };

  const postD = (p: WheelPos, d: number): number =>
    wheels[p]!.input.rollingDiameter - 2 * (d + wheels[p]!.analysis.tapingY);

  const consider = () => {
    WHEEL_POS.forEach((p, k) => {
      const d = levels[k][idx[k]];
      cuts[p] = d;
      D[k] = postD(p, d);
    });
    if (!relax.axle) {
      for (const [i, j] of AXLE_PAIRS) {
        if (Math.abs(D[WHEEL_POS.indexOf(i)] - D[WHEEL_POS.indexOf(j)]) > settings.axleDiffLimit + 1e-9) return;
      }
    }
    const spread = Math.max(...D) - Math.min(...D);
    if (!relax.bogie && spread > settings.bogieDiffLimit + 1e-9) return;

    const postDiameters = { ...cuts } as unknown as Record<WheelPos, number>;
    WHEEL_POS.forEach((p, k) => (postDiameters[p] = D[k]));
    const axleDiffs: Record<string, number> = {};
    for (const [i, j] of AXLE_PAIRS) {
      axleDiffs[`${i}-${j}`] = Math.abs(postDiameters[i] - postDiameters[j]);
    }
    const total = WHEEL_POS.reduce((s, p) => s + 2 * cuts[p], 0);
    const maxCut = Math.max(...WHEEL_POS.map((p) => cuts[p]));
    const minRemaining = Math.min(...D) - settings.minDiameter;

    best.push({
      cuts: { ...cuts },
      postDiameters,
      axleDiffs,
      bogieSpread: spread,
      totalRemovedDiameter: total,
      maxCut,
      minRemaining,
      provisional,
    });
  };

  // 笛卡尔积
  const total = levels.reduce((s, l) => s * l.length, 1);
  if (total > 2_000_000) {
    return {
      feasible: false,
      candidates: [],
      searchTooLarge: true,
    };
  }
  const n = 4;
  const combos = levels.map((l) => l.length);
  while (true) {
    consider();
    let k = n - 1;
    idx[k]++;
    while (idx[k] === combos[k]) {
      idx[k] = 0;
      k--;
      if (k < 0) break;
      idx[k]++;
    }
    if (k < 0) break;
  }

  if (best.length === 0) return { feasible: false, candidates: [] };

  best.sort((a, b) => {
    if (a.totalRemovedDiameter !== b.totalRemovedDiameter)
      return a.totalRemovedDiameter - b.totalRemovedDiameter;
    if (a.maxCut !== b.maxCut) return a.maxCut - b.maxCut;
    return b.minRemaining - a.minRemaining;
  });
  // 去重（同一切深向量只保留一条）并截断
  const seen = new Set<string>();
  const uniq = best.filter((c) => {
    const key = WHEEL_POS.map((p) => c.cuts[p]).join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { feasible: true, candidates: uniq.slice(0, TOP_N) };
}
