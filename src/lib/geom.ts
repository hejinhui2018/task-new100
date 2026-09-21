/** 数值小工具 */
export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const median = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const mad = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const med = median(xs);
  return median(xs.map((v) => Math.abs(v - med)));
};

/** 总体标准差 */
export const stdev = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
};

/** 对升序数组 xq 做二分定位（返回左区间索引 i，使 xs[i] <= xq <= xs[i+1]） */
export function locate(xs: number[], xq: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  if (xq <= xs[0]) return -1;
  if (xq >= xs[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= xq) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * 线性求解 (x,y) 折线与水平线 y=yq 的所有交点 x。
 * 点序方向不限；同一接触点不重复。
 */
export function crossingsAtY(points: Array<{ x: number; y: number }>, yq: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const d = b.y - a.y;
    if (d === 0) {
      if (a.y === yq) out.push(a.x); // 水平共线段，取其左端
      continue;
    }
    const t = (yq - a.y) / d;
    if (t >= 0 && t <= 1) out.push(a.x + t * (b.x - a.x));
  }
  // 去重合并（容差 1e-6）
  out.sort((p, q) => p - q);
  const uniq: number[] = [];
  for (const x of out) {
    if (uniq.length === 0 || Math.abs(x - uniq[uniq.length - 1]) > 1e-6) uniq.push(x);
  }
  return uniq;
}

/** 单调三次 Hermite（Catmull-Rom 风格、带斜率限幅防过冲）插值器，构造点要求 x 严格递增 */
export class MonotoneCubic {
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly ms: number[];

  constructor(points: Array<{ x: number; y: number }>) {
    if (points.length < 2) throw new Error('三次插值至少需要 2 个点');
    this.xs = points.map((p) => p.x);
    this.ys = points.map((p) => p.y);
    const n = points.length;
    const delta: number[] = [];
    for (let i = 0; i < n - 1; i++) delta.push((this.ys[i + 1] - this.ys[i]) / (this.xs[i + 1] - this.xs[i]));
    // Fritsch–Carlson 保单调切线
    const m: number[] = new Array(n).fill(0);
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] * delta[i] <= 0) m[i] = 0;
      else m[i] = (delta[i - 1] + delta[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (delta[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const a = m[i] / delta[i];
        const b = m[i + 1] / delta[i];
        const s = a * a + b * b;
        if (s > 9) {
          const tau = 3 / Math.sqrt(s);
          m[i] = tau * a * delta[i];
          m[i + 1] = tau * b * delta[i];
        }
      }
    }
    this.ms = m;
  }

  get range(): [number, number] {
    return [this.xs[0], this.xs[this.xs.length - 1]];
  }

  /** 区间外按端点斜率线性外推（仅用于小范围查询） */
  at(xq: number): number {
    const { xs, ys, ms } = this;
    const n = xs.length;
    if (xq <= xs[0]) {
      const i = 0;
      const h = xq - xs[i];
      return ys[i] + ms[i] * h;
    }
    if (xq >= xs[n - 1]) {
      const i = n - 1;
      const h = xq - xs[i];
      return ys[i] + ms[i] * h;
    }
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (xs[mid] <= xq) lo = mid;
      else hi = mid;
    }
    const h = xs[lo + 1] - xs[lo];
    const t = (xq - xs[lo]) / h;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    const h11 = t ** 3 - t ** 2;
    return h00 * ys[lo] + h10 * h * ms[lo] + h01 * ys[lo + 1] + h11 * h * ms[lo + 1];
  }
}

/** 相邻点最大间距与缺段区间 */
export function gapSegments(
  points: Array<{ x: number; y: number }>,
  maxGap: number,
): Array<[number, number]> {
  const segs: Array<[number, number]> = [];
  for (let i = 0; i < points.length - 1; i++) {
    const g = Math.abs(points[i + 1].x - points[i].x);
    if (g > maxGap) segs.push([Math.min(points[i].x, points[i + 1].x), Math.max(points[i].x, points[i + 1].x)]);
  }
  return segs;
}

/** 把点按 x 重采样为固定步长折线（线性），超出覆盖区不补点 */
export function resampleLinear(
  points: Array<{ x: number; y: number }>,
  x0: number,
  x1: number,
  step: number,
): Array<{ x: number; y: number }> {
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const out: Array<{ x: number; y: number }> = [];
  let i = 0;
  for (let x = x0; x <= x1 + 1e-9; x += step) {
    while (i < sorted.length - 2 && sorted[i + 1].x < x) i++;
    const a = sorted[i];
    const b = sorted[Math.min(i + 1, sorted.length - 1)];
    if (x < a.x || x > b.x) continue;
    const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x);
    out.push({ x, y: a.y + t * (b.y - a.y) });
  }
  return out;
}
