/**
 * 最小切深：加工区间内，目标型面整体径向内移 d 后必须完全落在现存材料之内，
 * 即对区间内所有覆盖点 x：T(x) - d ≤ M(x)  ⇒  d ≥ max_x [T(x) - M(x)]。
 *
 * 不做最近点投影：在固定密集 x 栅格上逐点比较间隙 g(x)=T(x)-M(x)，
 * 缺段栅格不参与约束并显式上报；同时给出原始/平滑两套结果之差作为不确定度。
 */
import type { AlignResult, CutAnalysis, FlangeMetrics, Notice, Pt, WheelInput, PlannerSettings } from './types';
import { MonotoneCubic } from './geom';
import { targetSpline, TAPING_X } from './profiles';
import type { Transform } from './align';
import { smoothProfile } from './signal';
import { computeFlangeMetrics } from './metrics';

const GRID = 0.25;

export interface GapSample {
  x: number;
  g: number | null;
}

export function analyzeCutDepth(
  wheel: WheelInput,
  settings: PlannerSettings,
  aligned: Pt[],
  _transform: Transform,
  alignResult: AlignResult,
  postMetrics: FlangeMetrics,
  priorNotices: Notice[],
): CutAnalysis {
  const notices = [...priorNotices];
  const [x0, x1] = settings.cutZone;
  const spline = targetSpline(settings.target);

  const dataMin = aligned[0].x;
  const dataMax = aligned[aligned.length - 1].x;
  const g0 = Math.max(x0, dataMin);
  const g1 = Math.min(x1, dataMax);

  const measured = new MonotoneCubic(aligned);
  const grid: number[] = [];
  for (let x = g0; x <= g1 + 1e-9; x += GRID) grid.push(x);

  // 缺段判定：栅格点所在原始线段跨距 > maxPointGap
  const covered: boolean[] = [];
  const missingSegs: Array<[number, number]> = [];
  let runStart: number | null = null;
  let j = 0;
  for (const x of grid) {
    while (j < aligned.length - 2 && aligned[j + 1].x < x) j++;
    const a = aligned[j];
    const b = aligned[Math.min(j + 1, aligned.length - 1)];
    const isCov = x >= a.x && x <= b.x && b.x - a.x <= settings.maxPointGap;
    covered.push(isCov);
    if (!isCov) {
      if (runStart === null) runStart = x;
    } else if (runStart !== null) {
      missingSegs.push([runStart, x]);
      runStart = null;
    }
  }
  if (runStart !== null) missingSegs.push([runStart, grid[grid.length - 1]]);

  const covCount = covered.filter(Boolean).length;
  const coverage = grid.length ? covCount / grid.length : 0;

  // 平滑链（缺段自然断开，不跨洞插值）
  const chains = smoothProfile(aligned, GRID, 2, settings.maxPointGap);
  const smoothAt = (x: number): number => {
    for (const ch of chains) {
      if (x < ch[0].x || x > ch[ch.length - 1].x) continue;
      let k = 0;
      while (k < ch.length - 2 && ch[k + 1].x < x) k++;
      const a = ch[k];
      const b = ch[Math.min(k + 1, ch.length - 1)];
      if (b.x - a.x > settings.maxPointGap) continue;
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      return a.y + t * (b.y - a.y);
    }
    return NaN;
  };

  let dMin = -Infinity;
  let dMinSmooth = -Infinity;
  let worstAt: Pt = { x: NaN, y: NaN };
  let crossings = 0;
  let prevSign = 0;

  grid.forEach((x, i) => {
    if (!covered[i]) {
      prevSign = 0;
      return;
    }
    const ym = measured.at(x);
    const g = spline.at(x) - ym;
    if (g > dMin) {
      dMin = g;
      worstAt = { x, y: ym };
    }
    const ys = smoothAt(x);
    if (Number.isFinite(ys)) dMinSmooth = Math.max(dMinSmooth, spline.at(x) - ys);
    const s = Math.sign(g);
    if (s !== 0 && prevSign !== 0 && s !== prevSign) crossings++;
    if (s !== 0) prevSign = s;
  });

  dMin = Math.max(0, dMin);
  dMinSmooth = Math.max(0, dMinSmooth);
  const uncertainty = Math.abs(dMin - dMinSmooth);

  const tapingY = dataMin <= TAPING_X && dataMax >= TAPING_X ? measured.at(TAPING_X) : NaN;

  // 镟后滚动圆直径：Dpost = D实测 - 2(d + tapingY)
  const dMax = Number.isFinite(tapingY)
    ? (wheel.rollingDiameter - settings.minDiameter) / 2 - tapingY
    : Infinity;

  const { metrics, notices: mNotices } = computeFlangeMetrics(aligned);
  notices.push(...mNotices);

  let unstable = false;
  if (missingSegs.length > 0) {
    unstable = true;
    for (const [a, b] of missingSegs) {
      notices.push({
        severity: 'error',
        code: 'cut-gap',
        message: `加工区间 x∈[${a.toFixed(1)}, ${b.toFixed(1)}] mm 缺测，该段未纳入切深约束`,
        detail: '真实最小切深可能更大，必须补测后再下刀；当前数值仅为已覆盖部分的下界',
      });
    }
  }
  if (coverage < 0.999) {
    notices.push({
      severity: 'warning',
      code: 'coverage-partial',
      message: `加工区间覆盖率 ${(coverage * 100).toFixed(1)}%，缺段处不做插值凑数`,
    });
  }
  if (uncertainty > 0.1) {
    unstable = true;
    notices.push({
      severity: 'warning',
      code: 'cut-uncertain',
      message: `原始点与中值平滑结果的最小切深相差 ${uncertainty.toFixed(3)} mm，疑似噪声/毛刺控制结果`,
      detail: '请清洁测点或复扫后确认；系统不会以单个高点直接定论',
    });
  }
  if (crossings >= 3) {
    notices.push({
      severity: 'info',
      code: 'multi-cross',
      message: `实测与目标在加工区间内出现 ${crossings} 次间隙变号（典型偏磨/凹磨形貌），控制点可能不止一处`,
    });
  }
  if (!(dMax >= dMin)) {
    notices.push({
      severity: 'error',
      code: 'dmax-exceeded',
      message: `该轮最小切深 ${dMin.toFixed(2)} mm 已超过最小轮径允许的 ${(Number.isFinite(dMax) ? dMax : NaN).toFixed(2)} mm，单轮即无可行解`,
    });
  }

  return {
    pos: wheel.pos,
    dMin,
    dMax,
    tapingY,
    worstAt,
    uncertainty,
    crossings,
    coverage,
    missingSegs,
    align: alignResult,
    metrics,
    postMetrics,
    notices,
    unstable,
  };
}

/** 间隙曲线（供叠图/检视），缺段 g=null */
export function gapCurve(rawAlignedOrPoints: Pt[], settings: PlannerSettings): GapSample[] {
  const aligned = rawAlignedOrPoints;
  const spline = targetSpline(settings.target);
  const measured = new MonotoneCubic(aligned);
  const out: GapSample[] = [];
  let j = 0;
  const [x0, x1] = settings.cutZone;
  for (let x = Math.max(x0, aligned[0].x); x <= Math.min(x1, aligned[aligned.length - 1].x); x += GRID) {
    while (j < aligned.length - 2 && aligned[j + 1].x < x) j++;
    const a = aligned[j];
    const b = aligned[Math.min(j + 1, aligned.length - 1)];
    if (x >= a.x && x <= b.x && b.x - a.x <= settings.maxPointGap) {
      out.push({ x, g: spline.at(x) - measured.at(x) });
    } else out.push({ x, g: null });
  }
  return out;
}
