import type { LinearProfile } from './interp';
import type { PlanningConfig, WheelPosition } from './types';
import type { CutAnalysis } from './cut';

export interface WheelGeom {
  id: string;
  name: string;
  position: WheelPosition;
  rollingDiameter: number;
  measured: LinearProfile | null;
  analysis: CutAnalysis | null;
  /** 校验未通过时的原因（无法构建切深分析） */
  invalidReason?: string;
}

export interface WheelCut {
  id: string;
  name: string;
  position: WheelPosition;
  /** 半径进刀量 mm */
  radiusCut: number;
  diameterReduction: number;
  finishedDiameter: number;
  /** 相对最小切深多切的量（寿命代价）mm */
  extraOverMin: number;
  /** 该轮镟后截面去除面积 mm²（加工区间积分） */
  removedArea: number;
  /** 是否为材料约束控制轮（取在最小进刀） */
  materialGoverning: boolean;
}

export interface Candidate {
  wheels: WheelCut[];
  /** 直径削减合计 mm */
  totalDiameterReduction: number;
  /** 截面去除面积合计 mm² */
  totalArea: number;
  maxRadiusCut: number;
  axleDiffs: { axle: 1 | 2; diff: number }[];
  bogieSpread: number;
  /** 镟后最小轮径余量（剩余寿命指标）mm */
  minLifeMargin: number;
}

export type DiagnosisCode = 'missing-segment' | 'min-diameter' | 'discrete-grid';

export interface Diagnosis {
  code: DiagnosisCode;
  message: string;
  /** 控制车轮 id */
  controllingWheels: string[];
  constraint?: string;
  detail?: unknown;
}

export interface SearchResult {
  feasible: boolean;
  candidates: Candidate[];
  totalFeasibleVectors: number;
  truncated: boolean;
  diagnoses: Diagnosis[];
}

const MAX_ENUMERATE = 200_000;
const KEEP = 30;

function areaRemoved(measured: LinearProfile, target: LinearProfile, d: number, xmin: number, xmax: number): number {
  // 梯形积分（两轮廓分段线性，取目标 0.5mm 网格足够精确）
  const step = 0.5;
  let area = 0;
  let prev: number | null = null;
  for (let x = xmin; x <= xmax + 1e-9; x += step) {
    const xx = Math.min(x, xmax);
    const h = Math.max(0, measured.yAt(xx) - (target.yAt(xx) - d));
    if (prev !== null) area += ((prev + h) / 2) * step;
    prev = h;
  }
  return area;
}

function buildWheelCut(g: WheelGeom & { analysis: CutAnalysis; measured: LinearProfile }, radiusCut: number, cfg: PlanningConfig, target: LinearProfile): WheelCut {
  return {
    id: g.id,
    name: g.name,
    position: g.position,
    radiusCut,
    diameterReduction: 2 * radiusCut,
    finishedDiameter: g.rollingDiameter - 2 * radiusCut,
    extraOverMin: radiusCut - g.analysis.minCutRadius,
    removedArea: areaRemoved(g.measured, target, radiusCut, cfg.machineXmin, cfg.machineXmax),
    materialGoverning: radiusCut <= g.analysis.minCutRadius + 1e-9,
  };
}

/**
 * 四轮联合离散搜索。
 * 进刀量只能取步进整数倍且 ≥ 各轮最小切深（只能去料）；
 * 约束：镟后直径 ≥ 最小轮径、同轴差、转向架极差。
 * 用配对进给窗口在 DFS 中剪枝；转向架约束做区间可达性剪枝，叶节点精校。
 */
export function searchCandidates(geoms: WheelGeom[], cfg: PlanningConfig, target: LinearProfile): SearchResult {
  const diagnoses: Diagnosis[] = [];
  const byPos = new Map<WheelPosition, WheelGeom>();
  for (const g of geoms) byPos.set(g.position, g);
  const order: WheelPosition[] = ['A1L', 'A1R', 'A2L', 'A2R'];
  const G = order.map((p) => byPos.get(p)).filter((g): g is WheelGeom => !!g);

  if (G.length < 4) {
    return {
      feasible: false,
      candidates: [],
      totalFeasibleVectors: 0,
      truncated: false,
      diagnoses: [
        {
          code: 'missing-segment',
          message: `四轮数据不完整（当前 ${G.length} 个），无法进行转向架联合搜索`,
          controllingWheels: order.filter((p) => !byPos.has(p)),
        },
      ],
    };
  }

  // —— 个体可行性：缺段/校验失败 ——
  for (const g of G) {
    if (g.invalidReason || !g.analysis) {
      diagnoses.push({
        code: 'missing-segment',
        message: `${g.name} 轮廓校验未通过（${g.invalidReason ?? '未知原因'}），不能参与联合搜索`,
        controllingWheels: [g.id],
        constraint: '方向/覆盖/点序校验',
      });
    } else if (!g.analysis.feasible) {
      diagnoses.push({
        code: 'missing-segment',
        message: `${g.name} 加工区间存在缺测段，最小切深无法成立，不能参与联合搜索`,
        controllingWheels: [g.id],
        constraint: '加工区间完整覆盖',
        detail: g.analysis.uncovered,
      });
    }
  }
  // —— 个体可行性：最小轮径（连续意义下） ——
  for (const g of G) {
    if (g.analysis?.feasible) {
      const finishedAtMin = g.rollingDiameter - 2 * g.analysis.minCutRadius;
      if (finishedAtMin < cfg.minDiameter - 1e-9) {
        diagnoses.push({
          code: 'min-diameter',
          message: `${g.name} 仅满足去料就需直径削减 ${(2 * g.analysis.minCutRadius).toFixed(2)} mm，镟后 ${finishedAtMin.toFixed(2)} mm 已低于最小轮径 ${cfg.minDiameter} mm（缺口 ${(cfg.minDiameter - finishedAtMin).toFixed(2)} mm）`,
          controllingWheels: [g.id],
          constraint: `D ≥ ${cfg.minDiameter} mm`,
          detail: { minCutRadius: g.analysis.minCutRadius, finishedAtMin, minDiameter: cfg.minDiameter },
        });
      }
    }
  }
  if (diagnoses.length) {
    return { feasible: false, candidates: [], totalFeasibleVectors: 0, truncated: false, diagnoses };
  }

  // 至此各轮 analysis/measured 必然有效（上面已对无效轮提前返回）
  type FeasibleGeom = WheelGeom & { analysis: CutAnalysis; measured: LinearProfile };
  const GF = G as FeasibleGeom[];

  const s = cfg.feedStep;
  const kmin = GF.map((g) => Math.max(0, Math.ceil(g.analysis.minCutRadius / s - 1e-9)));
  const kmax = GF.map((g) => Math.floor((g.rollingDiameter - cfg.minDiameter) / (2 * s) + 1e-9));
  for (let i = 0; i < 4; i++) {
    if (kmax[i] < kmin[i]) {
      diagnoses.push({
        code: 'discrete-grid',
        message: `${GF[i].name} 离散进给网格下无解：最小进刀 ${kmin[i] * s} mm 已使镟后直径低于 ${cfg.minDiameter} mm（连续最小切深 ${GF[i].analysis.minCutRadius.toFixed(2)} mm 恰在网格外，可尝试减小进给步进）`,
        controllingWheels: [GF[i].id],
        constraint: `步进 ${s} mm + 最小轮径`,
      });
    }
  }
  if (diagnoses.length) return { feasible: false, candidates: [], totalFeasibleVectors: 0, truncated: false, diagnoses };

  const D = GF.map((g) => g.rollingDiameter);
  const finished = (i: number, k: number) => D[i] - 2 * k * s;
  const axlePairs: [number, number][] = [
    [0, 1],
    [2, 3],
  ];

  const candidates: Candidate[] = [];
  let evaluated = 0;
  let truncated = false;
  const ks: number[] = [0, 0, 0, 0];

  function pairWindow(i: number, ki: number, j: number, limit: number): [number, number] {
    // |(Di-2ki s)-(Dj-2kj s)| ≤ limit  =>  kj ∈ [lo,hi]
    const A = D[i] - D[j] - 2 * ki * s;
    const lo = Math.ceil((-limit - A) / (2 * s) - 1e-9);
    const hi = Math.floor((limit - A) / (2 * s) + 1e-9);
    return [Math.max(lo, kmin[j]), Math.min(hi, kmax[j])];
  }

  function bogiePrune(depth: number): boolean {
    // 已分配轮的极差已超限
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < depth; i++) {
      const f = finished(i, ks[i]);
      mn = Math.min(mn, f);
      mx = Math.max(mx, f);
    }
    if (mx - mn > cfg.bogieLimit + 1e-9) return true;
    // 未分配轮最高可达直径 f_j = D_j-2·kmin_j·s；带宽下端必须能被所有轮达到
    let minFutureF = Infinity;
    for (let j = depth; j < 4; j++) minFutureF = Math.min(minFutureF, finished(j, kmin[j]));
    const bandLowest = mx - cfg.bogieLimit;
    return bandLowest > Math.min(mn, minFutureF) + 1e-9;
  }

  function emit() {
    const fs = ks.map((k, i) => finished(i, k));
    const spread = Math.max(...fs) - Math.min(...fs);
    if (spread > cfg.bogieLimit + 1e-9) return;
    const wheelCuts = GF.map((g, i) => buildWheelCut(g, ks[i] * s, cfg, target));
    candidates.push({
      wheels: wheelCuts,
      totalDiameterReduction: wheelCuts.reduce((a, w) => a + w.diameterReduction, 0),
      totalArea: wheelCuts.reduce((a, w) => a + w.removedArea, 0),
      maxRadiusCut: Math.max(...wheelCuts.map((w) => w.radiusCut)),
      axleDiffs: axlePairs.map(([a, b], idx) => ({ axle: (idx + 1) as 1 | 2, diff: Math.abs(fs[a] - fs[b]) })),
      bogieSpread: spread,
      minLifeMargin: Math.min(...fs) - cfg.minDiameter,
    });
  }

  function dfs(depth: number) {
    if (truncated) return;
    if (depth === 4) {
      evaluated++;
      if (evaluated > MAX_ENUMERATE) {
        truncated = true;
        return;
      }
      emit();
      return;
    }
    let lo = kmin[depth];
    let hi = kmax[depth];
    // 同轴窗口剪枝
    const partner = depth === 1 ? 0 : depth === 3 ? 2 : -1;
    if (partner >= 0) {
      const [pl, ph] = pairWindow(partner, ks[partner], depth, cfg.sameAxleLimit);
      lo = Math.max(lo, pl);
      hi = Math.min(hi, ph);
    }
    for (let k = lo; k <= hi; k++) {
      ks[depth] = k;
      if (bogiePrune(depth + 1)) continue;
      dfs(depth + 1);
    }
  }
  dfs(0);

  if (!candidates.length) {
    // 枚举已穷尽（连续意义下各轮均可镟修，无解必来自离散进给网格的相位错配）。
    // 在各轮可达直径格点集 S_i={D_i-2ks | k∈[kmin,kmax]} 上做独立可达性诊断：
    const lattice = (i: number) => {
      const out: number[] = [];
      for (let k = kmin[i]; k <= kmax[i]; k++) out.push(D[i] - 2 * k * s);
      return out;
    };
    const minPairGap = (a: number, b: number): { gap: number; fa: number; fb: number } => {
      const Sa = lattice(a);
      let best = { gap: Infinity, fa: NaN, fb: NaN };
      for (const fa of Sa) {
        // 找 Sb 中最接近 fa 的格点
        const kb = Math.round((D[b] - fa) / (2 * s));
        for (const k of [kb - 1, kb, kb + 1]) {
          if (k < kmin[b] || k > kmax[b]) continue;
          const fb = D[b] - 2 * k * s;
          const gap = Math.abs(fa - fb);
          if (gap < best.gap) best = { gap, fa, fb };
        }
      }
      return best;
    };

    for (const [a, b] of axlePairs) {
      const r = minPairGap(a, b);
      if (r.gap > cfg.sameAxleLimit + 1e-9) {
        diagnoses.push({
          code: 'discrete-grid',
          message: `${s} mm 进给网格下 ${GF[a].name} 与 ${GF[b].name} 的可达镟后直径无法靠近：格点最近仍相差 ${r.gap.toFixed(2)} mm（同轴差限值 ${cfg.sameAxleLimit} mm，最近可配 ${r.fa.toFixed(1)} / ${r.fb.toFixed(1)} mm）。减小进给步进（直径网格随之加密）或复核同轴差限值`,
          controllingWheels: [GF[a].id, GF[b].id],
          constraint: `同轴差 ≤ ${cfg.sameAxleLimit} mm @ 步进 ${s} mm`,
        });
        return { feasible: false, candidates: [], totalFeasibleVectors: 0, truncated, diagnoses };
      }
    }

    // 转向架：在四组可达直径格点的笛卡尔积上求精确最小极差。
    // 枚举“提供最小值”的轮与其格点 v，其余轮取 ≥v 的最小可达格点（去料最少），极差即该 v 下最优。
    const sets = [0, 1, 2, 3].map((i) => lattice(i));
    let bogieBest: { spread: number; values: number[] } = { spread: Infinity, values: [] };
    for (let i = 0; i < 4; i++) {
      for (const v of sets[i]) {
        const chosen = [0, 0, 0, 0];
        chosen[i] = v;
        let possible = true;
        for (let j = 0; j < 4; j++) {
          if (j === i) continue;
          // sets[j] 降序排列，找其中 ≥v 的最小值
          let pick = Infinity;
          for (const u of sets[j]) if (u >= v - 1e-9 && u < pick) pick = u;
          if (!Number.isFinite(pick)) {
            possible = false;
            break;
          }
          chosen[j] = pick;
        }
        if (possible) {
          const spread = Math.max(...chosen) - Math.min(...chosen);
          if (spread < bogieBest.spread) bogieBest = { spread, values: chosen };
        }
      }
    }
    if (bogieBest.spread > cfg.bogieLimit + 1e-9) {
      const vals = bogieBest.values;
      const hi = vals.indexOf(Math.max(...vals));
      const lo = vals.indexOf(Math.min(...vals));
      diagnoses.push({
        code: 'discrete-grid',
        message: `${s} mm 进给网格下转向架四组可达直径格点无法落入 ${cfg.bogieLimit} mm 极差窗口（最近仍差 ${bogieBest.spread.toFixed(2)} mm）：控制轮为 ${GF[hi].name}（格点 ${vals[hi].toFixed(1)} mm）与 ${GF[lo].name}（${vals[lo].toFixed(1)} mm）。减小进给步进加密直径网格，或放宽转向架差限值`,
        controllingWheels: [GF[hi].id, GF[lo].id],
        constraint: `转向架极差 ≤ ${cfg.bogieLimit} mm @ 步进 ${s} mm`,
        detail: { values: vals },
      });
      return { feasible: false, candidates: [], totalFeasibleVectors: 0, truncated, diagnoses };
    }

    diagnoses.push({
      code: 'discrete-grid',
      message: `${s} mm 离散进给网格下不存在同时满足全部直径差限值的组合，请减小进给步进退重试`,
      controllingWheels: GF.map((g) => g.id),
      constraint: `同轴差 ≤ ${cfg.sameAxleLimit} mm / 转向架差 ≤ ${cfg.bogieLimit} mm`,
    });
    return { feasible: false, candidates: [], totalFeasibleVectors: 0, truncated, diagnoses };
  }

  // 排序：总去除量（直径削减合计）→ 最大单轮切深 → 剩余寿命（大者优先）
  candidates.sort((a, b) => {
    if (Math.abs(a.totalDiameterReduction - b.totalDiameterReduction) > 1e-9)
      return a.totalDiameterReduction - b.totalDiameterReduction;
    if (Math.abs(a.maxRadiusCut - b.maxRadiusCut) > 1e-9) return a.maxRadiusCut - b.maxRadiusCut;
    return b.minLifeMargin - a.minLifeMargin;
  });

  return {
    feasible: true,
    candidates: candidates.slice(0, KEEP),
    totalFeasibleVectors: candidates.length,
    truncated,
    diagnoses: [],
  };
}
