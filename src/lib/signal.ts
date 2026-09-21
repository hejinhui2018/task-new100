/** 一维稳健信号处理：噪声估计与中值滤波（用于稳定性评估，不用于掩盖缺段） */
import type { Pt } from './types';
import { median, stdev } from './geom';

/**
 * 抗差噪声估计：对近似等距点，用二阶中心差分的滞后残差估计毛刺级噪声。
 * 返回 MAD 推估标准差（mm）。
 */
export function robustNoiseSigma(points: Pt[]): number {
  if (points.length < 5) return 0;
  const res: number[] = [];
  for (let i = 2; i < points.length - 2; i++) {
    // 与局部四点均值的偏差，削弱真实曲率影响
    const local = (points[i - 2].y + points[i - 1].y + points[i + 1].y + points[i + 2].y) / 4;
    res.push(points[i].y - local);
  }
  if (res.length === 0) return 0;
  const med = median(res);
  const absDev = res.map((r) => Math.abs(r - med));
  return 1.4826 * median(absDev) / Math.sqrt(0.75);
}

/** 普通标准差（对照用） */
export function plainSigma(points: Pt[]): number {
  return stdev(points.map((p) => p.y));
}

/** 等距网格上的滑动中值滤波 */
export function medianFilter(values: number[], halfWin: number): number[] {
  if (halfWin < 1) return values.slice();
  return values.map((_, i) => {
    const lo = Math.max(0, i - halfWin);
    const hi = Math.min(values.length, i + halfWin + 1);
    return median(values.slice(lo, hi));
  });
}

/**
 * 对 x 递增折线等距重采样后做中值滤波，返回平滑折线。
 * 不填补空洞：重采样时缺段区间自然断开（按相邻原始点线性跨越只在 maxGap 内）。
 */
export function smoothProfile(points: Pt[], gridStep: number, halfWin = 2, maxGap: number): Pt[][] {
  const chains: Pt[][] = [[]];
  for (let i = 0; i < points.length - 1; i++) {
    chains[chains.length - 1].push(points[i]);
    if (points[i + 1].x - points[i].x > maxGap) chains.push([]);
  }
  chains[chains.length - 1].push(points[points.length - 1]);

  const out: Pt[][] = [];
  for (const chain of chains) {
    if (chain.length < 2) continue;
    const x0 = chain[0].x;
    const x1 = chain[chain.length - 1].x;
    const grid: Pt[] = [];
    let k = 0;
    for (let x = x0; x <= x1 + 1e-9; x += gridStep) {
      while (k < chain.length - 2 && chain[k + 1].x < x) k++;
      const a = chain[k];
      const b = chain[Math.min(k + 1, chain.length - 1)];
      const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
      grid.push({ x, y: a.y + t * (b.y - a.y) });
    }
    const ys = medianFilter(grid.map((p) => p.y), halfWin);
    out.push(grid.map((p, i) => ({ x: p.x, y: ys[i] })));
  }
  return out;
}
