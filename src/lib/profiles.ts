/**
 * 目标型面（内置简化名义型线）。
 *
 * 坐标系（mm）：
 *  x — 横向，规距面（轮缘背侧基准面）为 x=-70，名义滚动圆（规距面外侧 70mm 刻线）为 x=0，
 *      踏面外侧为正；
 *  y — 径向，相对名义滚动圆切线（x=0 处 y=0），远离轮心为正（轮缘顶方向）。
 *
 * 尺寸定义（与 EN/UIC 常用量一致，见 metrics.ts）：
 *  Sh — 轮缘高度：轮缘顶点 y 与滚动圆切线之差；
 *  Sd — 轮缘厚度：y=10 水平切面处，轮缘面交点到规距面 x=-70 的横向距离；
 *  qR — y=2 与 y=9 两水平切面之间轮缘面的型线弧长。
 *
 * ⚠ 模型限制：以下型线是按上述关键尺寸与踏面锥度数值标定的**工程近似**（控制点折线 +
 * 保单调三次插值），不替代经认可的标准样板/刀路型线；生产使用应以实测目标型面数据替换。
 */
import type { Pt, TargetId } from './types';
import { crossingsAtY, MonotoneCubic } from './geom';

/** 规距面 x */
export const GAUGE_X = -70;
/** 滚动圆（70mm 刻线）x */
export const TAPING_X = 0;

interface TargetDef {
  id: TargetId;
  label: string;
  /** 型面控制点（x 严格递增），从轮缘背侧圆角一直到外侧轮缘下斜段 */
  ctrl: Pt[];
  nominalSh: number;
  nominalSd: number;
  nominalQr: number;
}

/**
 * S1002（EN 13715 体系近似）：目标 Sh≈28 / Sd≈32.5 / qR≈10.5，踏面主锥度 1:40。
 * 轮缘面含凹形（qR 段先陡后缓），顶点位于 x≈-56。
 */
const S1002_CTRL: Pt[] = [
  { x: -62.6, y: 24.4 },
  { x: -60.8, y: 27.3 },
  { x: -58.8, y: 28.0 },
  { x: -56.0, y: 27.5 },
  { x: -52.5, y: 24.5 },
  { x: -48.5, y: 19.5 },
  { x: -44.5, y: 14.0 },
  { x: -40.5, y: 11.0 },
  { x: -37.5, y: 10.0 },
  { x: -36.3, y: 9.0 },
  { x: -34.4, y: 7.0 },
  { x: -31.4, y: 4.0 },
  { x: -28.55, y: 2.0 },
  { x: -26.6, y: 1.0 },
  { x: -24.0, y: 0.6 },
  { x: -12.0, y: 0.25 },
  { x: 0.0, y: 0.0 },
  { x: 12.0, y: -0.3 },
  { x: 24.0, y: -0.6 },
  { x: 30.0, y: -0.75 },
  { x: 34.0, y: -1.1 },
  { x: 37.5, y: -1.9 },
  { x: 39.6, y: -3.4 },
  { x: 40.8, y: -5.2 },
];

/**
 * LM（中国客车体系近似）：目标 Sh≈27 / Sd≈32 / qR≈7.7，踏面主锥度 1:20，
 * 外侧约 1:10 接轮缘下斜。
 */
const LM_CTRL: Pt[] = [
  { x: -62.4, y: 23.4 },
  { x: -60.6, y: 26.2 },
  { x: -58.6, y: 27.0 },
  { x: -56.0, y: 26.6 },
  { x: -52.6, y: 23.6 },
  { x: -48.6, y: 18.6 },
  { x: -44.6, y: 13.4 },
  { x: -40.8, y: 10.6 },
  { x: -38.0, y: 10.0 },
  { x: -37.0, y: 9.0 },
  { x: -35.8, y: 6.5 },
  { x: -34.4, y: 4.0 },
  { x: -33.8, y: 2.0 },
  { x: -32.6, y: 1.0 },
  { x: -26.0, y: 0.7 },
  { x: -12.0, y: 0.3 },
  { x: 0.0, y: 0.0 },
  { x: 12.0, y: -0.6 },
  { x: 24.0, y: -1.2 },
  { x: 30.0, y: -1.5 },
  { x: 34.0, y: -1.9 },
  { x: 37.5, y: -2.7 },
  { x: 39.6, y: -4.1 },
  { x: 40.8, y: -5.8 },
];

export const TARGETS: Record<TargetId, TargetDef> = {
  S1002: {
    id: 'S1002',
    label: 'S1002（EN 近似）',
    ctrl: S1002_CTRL,
    nominalSh: 28,
    nominalSd: 32.5,
    nominalQr: 10.5,
  },
  LM: {
    id: 'LM',
    label: 'LM（国产近似）',
    ctrl: LM_CTRL,
    nominalSh: 27,
    nominalSd: 32,
    nominalQr: 7.7,
  },
};

export function targetControlPoints(id: TargetId): Pt[] {
  return TARGETS[id].ctrl.map((p) => ({ ...p }));
}

/** 型面 x 覆盖范围 */
export function targetRange(id: TargetId): [number, number] {
  const c = TARGETS[id].ctrl;
  return [c[0].x, c[c.length - 1].x];
}

/** 目标型线三次插值器（x 单调递增） */
export function targetSpline(id: TargetId): MonotoneCubic {
  return new MonotoneCubic(TARGETS[id].ctrl);
}

/** 密集采样目标型线（画图/弧长用） */
export function sampleTarget(id: TargetId, step = 0.25): Pt[] {
  const sp = targetSpline(id);
  const [x0, x1] = sp.range;
  const out: Pt[] = [];
  for (let x = x0; x <= x1 + 1e-9; x += step) out.push({ x, y: sp.at(x) });
  return out;
}

/**
 * 沿折线在两个水平切面之间的轮缘面弧长。
 * 取每个高度“最靠右（接近踏面）”的交点，累计该横向窗口内、高度带内的折线长度，
 * 并补两端截距。
 */
export function arcLengthBetweenY(points: Pt[], yLo: number, yHi: number): number {
  const xLo = crossingsAtY(points, yLo);
  const xHi = crossingsAtY(points, yHi);
  if (xLo.length === 0 || xHi.length === 0) return NaN;
  const xa = xLo[xLo.length - 1];
  const xb = xHi[xHi.length - 1];
  const xmin = Math.min(xa, xb);
  const xmax = Math.max(xa, xb);
  const ymin = Math.min(yLo, yHi);
  const ymax = Math.max(yHi, yLo);

  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    // 与矩形窗口 [xmin,xmax]×[ymin,ymax] 的线段相交长度（剪裁）
    const ts: number[] = [];
    const enter = (cond: boolean, t: number) => {
      if (cond && t >= -1e-9 && t <= 1 + 1e-9) ts.push(Math.min(1, Math.max(0, t)));
    };
    if (a.x >= xmin && a.x <= xmax && a.y >= ymin && a.y <= ymax) ts.push(0);
    if (b.x >= xmin && b.x <= xmax && b.y >= ymin && b.y <= ymax) ts.push(1);
    if (b.x !== a.x) {
      enter(true, (xmin - a.x) / (b.x - a.x));
      enter(true, (xmax - a.x) / (b.x - a.x));
    }
    if (b.y !== a.y) {
      enter(true, (ymin - a.y) / (b.y - a.y));
      enter(true, (ymax - a.y) / (b.y - a.y));
    }
    if (ts.length >= 2) {
      const t0 = Math.min(...ts);
      const t1 = Math.max(...ts);
      if (t1 > t0) {
        const px = a.x + t0 * (b.x - a.x);
        const py = a.y + t0 * (b.y - a.y);
        const qx = a.x + t1 * (b.x - a.x);
        const qy = a.y + t1 * (b.y - a.y);
        len += Math.hypot(qx - px, qy - py);
      }
    }
  }
  return len;
}
