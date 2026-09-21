import type { Pt, TargetId } from './types';
import { buildLinear, type LinearProfile } from './interp';

/**
 * 目标型面库（教学/规划用平滑近似，非厂家标准数据表）。
 *
 * 坐标系：x 横向，taping 基准点 (0,0)（LM 在距车轮内侧面 70 mm、名义滚动圆处）；
 * x<0 指向轮缘（内侧面方向），x>0 指向踏面外侧；y 向上为半径增大方向。
 *
 * 构造方式：以弧底附近平滑函数 + 分段三次 Hermite 描述轮缘与踏面，
 * 在密集网格（0.2 mm）上离散为折线，保证与实测同精度可比。
 */

interface Knot {
  x: number;
  y: number;
  /** 该点斜率 dy/dx，用于三次 Hermite 保形 */
  m: number;
}

/** 单调三次 Hermite 插值（PCHIP 风格，给定节点斜率） */
function hermieSpline(knots: Knot[], xs: number[]): Pt[] {
  const pts: Pt[] = [];
  for (const x of xs) {
    if (x <= knots[0].x) {
      pts.push({ x, y: knots[0].y });
      continue;
    }
    if (x >= knots[knots.length - 1].x) {
      pts.push({ x, y: knots[knots.length - 1].y });
      continue;
    }
    let i = 0;
    while (knots[i + 1].x < x) i++;
    const x0 = knots[i].x;
    const x1 = knots[i + 1].x;
    const t = (x - x0) / (x1 - x0);
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    const h11 = t ** 3 - t ** 2;
    const dx = x1 - x0;
    const y = h00 * knots[i].y + h10 * dx * knots[i].m + h01 * knots[i + 1].y + h11 * dx * knots[i + 1].m;
    pts.push({ x, y });
  }
  return pts;
}

function linspace(a: number, b: number, step: number): number[] {
  const n = Math.round((b - a) / step);
  const out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + (i * (b - a)) / n);
  return out;
}

/**
 * LM 型面近似节点（单位 mm）。
 * 关键几何：轮缘顶约 x=-48, y≈26.6；轮缘喉弧在 -35..-25；基准 (0,0)；
 * 踏面 1:20 锥度（斜率 0.05）延伸至 x≈32，外侧 1:10（0.10）。
 * 数值为教学近似，足以演示 Sh/Sd/qR 与切深算法，不得用于实际镟修。
 */
const LM_KNOTS: Knot[] = [
  { x: -55, y: 25.4, m: 0.0 },
  { x: -52, y: 26.4, m: 0.55 },
  { x: -49, y: 27.0, m: 0.12 }, // 轮缘顶平台
  { x: -46.5, y: 26.9, m: -0.10 },
  { x: -42, y: 24.0, m: -1.05 }, // 轮缘外侧直线段（约 70°）
  { x: -36.5, y: 11.5, m: -2.7 },
  { x: -33, y: 3.6, m: -1.45 }, // 喉弧
  { x: -29, y: 0.4, m: -0.42 },
  { x: -24, y: -0.55, m: -0.02 }, // 弧底（名义槽底）
  { x: -15, y: -0.35, m: 0.045 },
  { x: 0, y: 0.0, m: 0.05 }, // taping 基准点，踏面 1:20
  { x: 15, y: 0.74, m: 0.05 },
  { x: 28, y: 1.4, m: 0.052 },
  { x: 31, y: 1.62, m: 0.075 }, // 锥度过渡
  { x: 35, y: 2.1, m: 0.1 }, // 外侧 1:10
  { x: 42, y: 2.8, m: 0.1 },
];

/**
 * LMA（磨耗型）近似：轮缘略薄、喉弧更缓，踏面中外部更凹。
 */
const LMA_KNOTS: Knot[] = [
  { x: -55, y: 25.4, m: 0.0 },
  { x: -52, y: 26.4, m: 0.55 },
  { x: -49, y: 27.0, m: 0.12 },
  { x: -46.5, y: 26.9, m: -0.10 },
  { x: -42, y: 24.0, m: -1.05 },
  { x: -36.5, y: 11.5, m: -2.45 },
  { x: -33, y: 4.2, m: -1.15 }, // 喉弧更缓、轮缘厚度更大
  { x: -29, y: 1.1, m: -0.30 },
  { x: -24, y: 0.1, m: 0.02 },
  { x: -15, y: 0.0, m: 0.012 },
  { x: 0, y: 0.0, m: 0.018 }, // 近滚动圆处更平
  { x: 12, y: 0.24, m: 0.022 },
  { x: 20, y: 0.62, m: 0.075 }, // 磨耗形凹度过渡
  { x: 28, y: 1.5, m: 0.1 },
  { x: 35, y: 2.2, m: 0.1 },
  { x: 42, y: 2.9, m: 0.1 },
];

const GRID_STEP = 0.2;

export function targetProfile(id: TargetId): LinearProfile {
  const knots = id === 'LM' ? LM_KNOTS : LMA_KNOTS;
  const xs = linspace(knots[0].x, knots[knots.length - 1].x, GRID_STEP);
  return buildLinear(hermieSpline(knots, xs));
}

/** 名义轮缘顶点 y（Sh 基线 10mm 截交由此定义） */
export function flangeTipY(p: LinearProfile): number {
  let yMax = -Infinity;
  // 仅在轮缘侧 x<-20 区域取最大，避免踏面外侧抬高干扰
  for (let i = 0; i < p.xs.length; i++) {
    if (p.xs[i] < -20) yMax = Math.max(yMax, p.ys[i]);
  }
  return yMax;
}
