/**
 * 基准刚体对齐：在踏面基准带内，以微小转角 + 平移将实测轮廓拟合到目标型线。
 * 抗差 Huber IRLS，避免局部磨耗/毛刺拉偏整体位姿。
 * 不做最近点迭代（ICP 式硬凑）——基准带上逐 x 比较，残差过大的点降权而非迁就。
 */
import type { AlignResult, Notice, Pt } from './types';
import { mad } from './geom';
import { targetSpline } from './profiles';
import type { TargetId } from './types';

export interface Transform {
  theta: number;
  dx: number;
  dy: number;
}

export function applyTransform(p: Pt, t: Transform): Pt {
  const c = Math.cos(t.theta);
  const s = Math.sin(t.theta);
  return {
    x: p.x * c - p.y * s + t.dx,
    y: p.x * s + p.y * c + t.dy,
  };
}

export const IDENTITY: Transform = { theta: 0, dx: 0, dy: 0 };

/**
 * 在基准带 [bandX0, bandX1] 内拟合。
 * 状态 (θ, dx, dy)，线性化残差：
 *   r = y'_m - T(x'_m) ≈ r0 + x·δθ - T'(x)·δdx + δdy
 * Huber 权迭代；θ 限幅 ±0.01 rad（轮廓仪安装姿态误差很小，超限说明坐标约定有误）。
 */
export function alignToTarget(
  points: Pt[],
  target: TargetId,
  band: [number, number],
): AlignResult {
  const notices: Notice[] = [];
  const spline = targetSpline(target);
  const cur: Transform = { theta: 0, dx: 0, dy: 0 };

  // 初值 dy：基准带中位偏差
  const inBand0 = points.filter((p) => p.x >= band[0] && p.x <= band[1]);
  if (inBand0.length < 3) {
    return {
      theta: 0,
      dx: 0,
      dy: 0,
      fitMad: NaN,
      bandPoints: inBand0.length,
      notices: [
        {
          severity: 'error',
          code: 'band-empty',
          message: `基准带 [${band[0]}, ${band[1]}] 内点数不足（${inBand0.length}），无法对齐`,
        },
      ],
    };
  }
  cur.dy = medianOf(inBand0.map((p) => spline.at(p.x) - p.y));

  const huberK = 1.345;
  let fitMad = NaN;
  let bandCount = 0;

  for (let iter = 0; iter < 20; iter++) {
    const c = Math.cos(cur.theta);
    const s = Math.sin(cur.theta);
    const rows: Array<{ a: number; b: number; d: number; r0: number; x: number }> = [];
    for (const p of points) {
      if (p.x < band[0] - 2 || p.x > band[1] + 2) continue;
      const xc = p.x * c - p.y * s + cur.dx;
      const yc = p.x * s + p.y * c + cur.dy;
      if (xc < band[0] || xc > band[1]) continue;
      // 数值导数
      const eps = 0.05;
      const dT = (spline.at(xc + eps) - spline.at(xc - eps)) / (2 * eps);
      rows.push({ a: xc, b: -dT, d: 1, r0: yc - spline.at(xc), x: xc });
    }
    bandCount = rows.length;
    if (rows.length < 3) break;
    const resid = rows.map((r) => r.r0);
    const sigma = Math.max(1e-4, 1.4826 * mad(resid));
    fitMad = mad(resid);
    const w = resid.map((r) => {
      const u = Math.abs(r) / sigma;
      return u <= huberK ? 1 : huberK / u;
    });
    // 加权正规方程 (3x3)：J^T W J δ = -J^T W r0
    const A = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const rhs = [0, 0, 0];
    rows.forEach((r, i) => {
      const j = [r.a, r.b, r.d];
      for (let u = 0; u < 3; u++) {
        rhs[u] -= w[i] * j[u] * r.r0;
        for (let v = 0; v < 3; v++) A[u][v] += w[i] * j[u] * j[v];
      }
    });
    const delta = solve3(A, rhs);
    if (!delta) break;
    // 限幅单步，防止非线性发散
    const lim = 0.002;
    cur.theta += clampD(delta[0], lim);
    cur.dx += clampD(delta[1], 0.5);
    cur.dy += clampD(delta[2], 0.5);
    if (Math.abs(delta[0]) < 1e-8 && Math.abs(delta[1]) < 1e-7 && Math.abs(delta[2]) < 1e-7) break;
  }

  if (Math.abs(cur.theta) > 0.01) {
    notices.push({
      severity: 'error',
      code: 'theta-large',
      message: `刚体对齐转角 ${(cur.theta * 1000).toFixed(2)} mrad 超 10 mrad 限幅，坐标约定或安装位姿异常`,
      detail: '请检查导入坐标是否以规距面 x≈-70、滚动圆 x≈0 为基准',
    });
  }
  if (Number.isFinite(fitMad) && fitMad > 0.3) {
    notices.push({
      severity: 'warning',
      code: 'band-misfit',
      message: `基准带拟合中位残差 ${fitMad.toFixed(3)} mm 偏大，基准带可能本身存在磨耗或污染`,
    });
  }
  if (cur.dx !== 0 || cur.theta !== 0) {
    notices.push({
      severity: 'info',
      code: 'rigid-align',
      message: `刚体对齐：θ=${(cur.theta * 1000).toFixed(2)} mrad，dx=${cur.dx.toFixed(3)} mm，dy=${cur.dy.toFixed(3)} mm`,
    });
  }

  return { theta: cur.theta, dx: cur.dx, dy: cur.dy, fitMad, bandPoints: bandCount, notices };
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function clampD(v: number, lim: number): number {
  return Math.max(-lim, Math.min(lim, v));
}

function solve3(A: number[][], b: number[]): [number, number, number] | null {
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < 3; col++) {
    let piv = col;
    for (let r = col + 1; r < 3; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    ;[M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < 3; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let k = col; k < 4; k++) M[r][k] -= f * M[col][k];
    }
  }
  return [M[0][3] / M[0][0], M[1][3] / M[1][1], M[2][3] / M[2][2]];
}
