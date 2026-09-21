import type { Pt } from './types';

export const EPS = 1e-9;

/**
 * x 单调递增的分段线性轮廓。
 * 所有轮廓运算都建立在此结构上——不做最近点投影，只做严格的纵向插值。
 */
export interface LinearProfile {
  readonly xs: number[];
  readonly ys: number[];
  readonly xmin: number;
  readonly xmax: number;
  covers(x: number): boolean;
  /** 仅在覆盖范围内调用；越界抛错（调用方必须先 covers 检查，禁止外推硬凑） */
  yAt(x: number): number;
  /** 水平线 y=h 与轮廓的全部交点 x（按 x 升序） */
  intersectionsY(h: number): number[];
}

export function sortPoints(points: Pt[]): Pt[] {
  return [...points].sort((a, b) => a.x - b.x);
}

export function buildLinear(points: Pt[]): LinearProfile {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xmin = xs[0];
  const xmax = xs[xs.length - 1];

  function yAt(x: number): number {
    if (x < xmin - EPS || x > xmax + EPS) {
      throw new RangeError(`x=${x.toFixed(3)} 超出轮廓覆盖范围 [${xmin.toFixed(1)}, ${xmax.toFixed(1)}]，禁止外推`);
    }
    // 二分查找所在段
    let lo = 0;
    let hi = xs.length - 1;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= x) lo = mid;
      else hi = mid;
    }
    const t = (x - xs[lo]) / (xs[hi] - xs[lo]);
    return ys[lo] + t * (ys[hi] - ys[lo]);
  }

  function intersectionsY(h: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const y0 = ys[i];
      const y1 = ys[i + 1];
      if ((y0 <= h && h <= y1) || (y1 <= h && h <= y0)) {
        if (Math.abs(y1 - y0) < EPS) {
          out.push(xs[i]); // 水平重合段，取左端点（足够工程使用）
        } else {
          out.push(xs[i] + ((h - y0) / (y1 - y0)) * (xs[i + 1] - xs[i]));
        }
      }
    }
    return out;
  }

  return {
    xs,
    ys,
    xmin,
    xmax,
    covers: (x) => x >= xmin - EPS && x <= xmax + EPS,
    yAt,
    intersectionsY,
  };
}

/** 在 [xmin,xmax] 上按固定步长生成网格点 */
export function regularGrid(xmin: number, xmax: number, step: number): number[] {
  const n = Math.max(1, Math.round((xmax - xmin) / step));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(xmin + (i * (xmax - xmin)) / n);
  return out;
}

/** 合并两个升序 x 数组并去重（容差 eps） */
export function mergeKnots(a: number[], b: number[], eps = 1e-6): number[] {
  const all = [...a, ...b].sort((u, v) => u - v);
  const out: number[] = [];
  for (const x of all) {
    if (!out.length || Math.abs(x - out[out.length - 1]) > eps) out.push(x);
  }
  return out;
}
