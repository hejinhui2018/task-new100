import type { LinearProfile } from './interp';
import { mergeKnots } from './interp';

export interface CutAnalysis {
  /** 最小半径切深 mm（离散进给前的精确值，≥0） */
  minCutRadius: number;
  /** 对应直径削减量 2·minCutRadius mm */
  diameterReduction: number;
  /** 控制切点 x（最大过盈处） */
  governingX: number;
  /** 加工区间内两曲线交叉（符号变化）次数 */
  crossings: number;
  /** 交叉位置 x 列表 */
  crossingXs: number[];
  /** 各合并节点上的过盈量 t(x)-m(x)，用于叠图着色与稳定性判断 */
  clearance: { x: number; interference: number }[];
  /** 实测未覆盖的加工子区间（缺段）；非空时 minCutRadius 不可用 */
  uncovered: { from: number; to: number }[];
  feasible: boolean;
  notes: string[];
}

/**
 * 单轮最小切深：
 * 在加工区间 [xmin,xmax] 上求 d* = max( t(x) − m(x), 0 )，
 * 使内移后的目标 t(x)−d* 在每个 x 处都不高于实测 m(x)（只能去料）。
 *
 * 两轮廓均为分段线性，其差在合并节点集上分段线性，最大值必落在节点上，
 * 因此在合并节点上求 max 是精确的——不使用最近点/最近距离近似。
 * 实测未覆盖加工区间时直接判缺段，不外推。
 */
export function machiningMinCut(
  measured: LinearProfile,
  target: LinearProfile,
  xmin: number,
  xmax: number,
): CutAnalysis {
  const notes: string[] = [];
  const uncovered: { from: number; to: number }[] = [];

  // 加工区间必须同时被实测与目标覆盖；标记实测在两端的缺口
  if (xmin < measured.xmin - 1e-9) uncovered.push({ from: xmin, to: Math.min(measured.xmin, xmax) });
  if (xmax > measured.xmax + 1e-9) uncovered.push({ from: Math.max(measured.xmax, xmin), to: xmax });
  // 目标未覆盖（理论上不应发生）同样拦截
  if (!target.covers(xmin) || !target.covers(xmax)) {
    notes.push('目标型面未完整覆盖加工区间，请收窄加工区间或更换型面');
  }

  // 加工区间内实测点的大间距即缺段（线性折线会把缺口错误桥接，必须显式拦截）
  const GAP_LIMIT = 2.0;
  for (let i = 1; i < measured.xs.length; i++) {
    const a = Math.max(measured.xs[i - 1], xmin);
    const b = Math.min(measured.xs[i], xmax);
    if (b > a && measured.xs[i] - measured.xs[i - 1] > GAP_LIMIT) {
      uncovered.push({ from: a, to: b });
    }
  }
  uncovered.sort((u, v) => u.from - v.from);

  const feasibleNow = uncovered.length === 0 && target.covers(xmin) && target.covers(xmax);
  if (!feasibleNow) {
    return {
      minCutRadius: NaN,
      diameterReduction: NaN,
      governingX: NaN,
      crossings: 0,
      crossingXs: [],
      clearance: [],
      uncovered,
      feasible: false,
      notes: ['存在缺测段，无法保证加工后整段落在材料内，禁止以最近点估算切深', ...notes],
    };
  }

  // 合并两轮廓落在区间内的节点（差函数在其上为线性）
  const knots = mergeKnots(
    measured.xs.filter((x) => x >= xmin && x <= xmax),
    target.xs.filter((x) => x >= xmin && x <= xmax),
  ).filter((x, _i, arr) => x >= arr[0] && x <= arr[arr.length - 1]);
  if (knots[0] > xmin) knots.unshift(xmin);
  if (knots[knots.length - 1] < xmax) knots.push(xmax);

  const clearance = knots.map((x) => ({ x, interference: target.yAt(x) - measured.yAt(x) }));

  let maxInt = -Infinity;
  let governingX = knots[0];
  for (const c of clearance) {
    if (c.interference > maxInt) {
      maxInt = c.interference;
      governingX = c.x;
    }
  }
  const minCutRadius = Math.max(0, maxInt);

  // 交叉统计：过盈量变号
  const crossingXs: number[] = [];
  for (let i = 1; i < clearance.length; i++) {
    const a = clearance[i - 1].interference;
    const b = clearance[i].interference;
    if ((a < 0 && b > 0) || (a > 0 && b < 0)) {
      const t = a / (a - b);
      crossingXs.push(clearance[i - 1].x + t * (clearance[i].x - clearance[i - 1].x));
    }
  }
  if (crossingXs.length >= 2) {
    notes.push(
      `实测与目标在加工区间内交叉 ${crossingXs.length} 次（${crossingXs.map((x) => x.toFixed(1)).join(', ')} mm），曲线多次穿插时最小切深对测量噪声敏感，建议核对型面与对齐基准`,
    );
  }
  if (minCutRadius === 0) {
    notes.push('加工区间内实测处处高于目标，理论最小切深为 0（若该轮仍需镟修，通常由表面缺陷或轮缘尺寸驱动）');
  }

  return {
    minCutRadius,
    diameterReduction: 2 * minCutRadius,
    governingX,
    crossings: crossingXs.length,
    crossingXs,
    clearance,
    uncovered,
    feasible: true,
    notes,
  };
}
