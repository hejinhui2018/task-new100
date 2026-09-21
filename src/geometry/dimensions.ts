import type { LinearProfile } from './interp';

/** taping 基准点到车轮内侧面的距离 70 mm（Sd 以内侧面为起点） */
export const INNER_FACE_GAUGE = 70;

export interface FlangeDimensions {
  /** 轮缘顶点 y（对齐坐标） */
  yTip: number;
  /** 轮缘高度 Sh：顶点相对滚动圆基准线（y=0）的高度 mm */
  Sh: number;
  /** 轮缘厚度 Sd：顶点下 10 mm 水平线，喉侧交点到内侧面（x=-70）的水平距离 mm */
  Sd: number;
  /** qR：顶点下 2 mm 与 10 mm 两水平线在喉侧交点的直线距离 mm */
  qR: number;
  xAt2: number;
  xAt10: number;
  valid: boolean;
  issues: string[];
}

/** 在轮廓与水平线 h 的全部交点中，取喉侧（x 较大、位于 -45..-18 区间）的一个 */
function throatIntersection(p: LinearProfile, h: number): number | undefined {
  const xs = p.intersectionsY(h).filter((x) => x > -46 && x < -18);
  return xs.length ? xs[xs.length - 1] : undefined;
}

/** 计算轮缘高度 Sh、厚度 Sd、厚度梯度 qR；交点缺失时明确报无效而非返回 NaN 硬凑 */
export function flangeDimensions(p: LinearProfile): FlangeDimensions {
  const issues: string[] = [];
  let yTip = -Infinity;
  for (let i = 0; i < p.xs.length; i++) {
    if (p.xs[i] < -20) yTip = Math.max(yTip, p.ys[i]);
  }
  if (!Number.isFinite(yTip)) {
    return { yTip: NaN, Sh: NaN, Sd: NaN, qR: NaN, xAt2: NaN, xAt10: NaN, valid: false, issues: ['轮廓未覆盖轮缘区（x<-20）'] };
  }

  const xAt2 = throatIntersection(p, yTip - 2);
  const xAt10 = throatIntersection(p, yTip - 10);
  if (xAt2 === undefined) issues.push('顶点下 2 mm 水平线与轮廓无交点（轮缘顶可能磨平或覆盖不足），qR 不可用');
  if (xAt10 === undefined) issues.push('顶点下 10 mm 水平线与轮廓无交点（轮缘过薄或覆盖不足），Sd/qR 不可用');

  const Sh = yTip; // 基准线即滚动圆 y=0
  const valid = xAt2 !== undefined && xAt10 !== undefined;
  const Sd = xAt10 !== undefined ? xAt10 - -INNER_FACE_GAUGE : NaN;
  const qR = valid ? Math.hypot(xAt10! - xAt2!, 8) : NaN;

  return { yTip, Sh, Sd, qR, xAt2: xAt2 ?? NaN, xAt10: xAt10 ?? NaN, valid, issues };
}
