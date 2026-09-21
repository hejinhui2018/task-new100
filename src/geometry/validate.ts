import type { Pt, WheelInput } from './types';
import { sortPoints } from './interp';

export type Severity = 'error' | 'warning';

export interface Issue {
  severity: Severity;
  code:
    | 'too-few-points'
    | 'point-order'
    | 'duplicate-x'
    | 'coverage-shortfall'
    | 'gap'
    | 'direction'
    | 'datum-outside'
    | 'noise'
    | 'coarse-spacing';
  message: string;
  detail?: unknown;
}

export interface ProfileStats {
  pointCount: number;
  medianSpacing: number;
  maxSpacing: number;
  xmin: number;
  xmax: number;
}

export interface ValidationReport {
  issues: Issue[];
  /** 排序去重后的点（坐标仍为原始测量系） */
  cleaned: Pt[];
  stats: ProfileStats;
  get ok(): boolean;
}

function makeReport(issues: Issue[], cleaned: Pt[], stats: ProfileStats): ValidationReport {
  return {
    issues,
    cleaned,
    stats,
    get ok() {
      return !this.issues.some((i) => i.severity === 'error');
    },
  };
}

/** 校验方向、覆盖、点序与噪声；返回的问题按 error/warning 分级 */
export function validateWheel(wheel: WheelInput, required: { xmin: number; xmax: number }): ValidationReport {
  const issues: Issue[] = [];
  const raw = wheel.points;

  if (raw.length < 3) {
    return makeReport(
      [{ severity: 'error', code: 'too-few-points', message: `${wheel.name}：点数不足（${raw.length}），至少需要 3 个点` }],
      [],
      { pointCount: raw.length, medianSpacing: NaN, maxSpacing: NaN, xmin: NaN, xmax: NaN },
    );
  }

  // —— 点序检查（先在原始顺序上判断，再排序） ——
  let orderViolations = 0;
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].x < raw[i - 1].x) orderViolations++;
  }
  if (orderViolations > 0) {
    issues.push({
      severity: 'error',
      code: 'point-order',
      message: `${wheel.name}：点序未按 x 单调递增（${orderViolations} 处回退），请按轮缘→踏面外侧顺序导出`,
    });
  }

  const sorted = sortPoints(raw);
  const cleaned: Pt[] = [];
  let dupCount = 0;
  for (const p of sorted) {
    const last = cleaned[cleaned.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6) {
      dupCount++;
      if (Math.abs(last.y - p.y) > 1e-6) {
        issues.push({
          severity: 'warning',
          code: 'duplicate-x',
          message: `${wheel.name}：x=${p.x.toFixed(2)} 处存在不同 y 的重复点，已取首个`,
        });
      }
    } else {
      cleaned.push(p);
    }
  }
  if (dupCount > 0 && !issues.some((i) => i.code === 'duplicate-x')) {
    issues.push({ severity: 'warning', code: 'duplicate-x', message: `${wheel.name}：去除 ${dupCount} 个重复 x 点` });
  }

  const spacings: number[] = [];
  for (let i = 1; i < cleaned.length; i++) spacings.push(cleaned[i].x - cleaned[i - 1].x);
  const sortedSp = [...spacings].sort((a, b) => a - b);
  const medianSpacing = sortedSp[sortedSp.length >> 1] ?? NaN;
  const maxSpacing = Math.max(...spacings);

  // —— 覆盖检查 ——
  const xmin = cleaned[0].x - wheel.datum.x;
  const xmax = cleaned[cleaned.length - 1].x - wheel.datum.x;
  if (xmin > required.xmin + 1e-6 || xmax < required.xmax - 1e-6) {
    issues.push({
      severity: 'error',
      code: 'coverage-shortfall',
      message: `${wheel.name}：覆盖 [${xmin.toFixed(1)}, ${xmax.toFixed(1)}] 不足，要求完整覆盖 [${required.xmin}, ${required.xmax}]（含轮缘顶与踏面外侧）`,
      detail: { have: [xmin, xmax], need: [required.xmin, required.xmax] },
    });
  }
  const GAP_LIMIT = 2.5;
  for (let i = 1; i < cleaned.length; i++) {
    const dx = cleaned[i].x - cleaned[i - 1].x - wheel.datum.x * 0; // 间距与平移无关
    if (dx > GAP_LIMIT) {
      issues.push({
        severity: 'error',
        code: 'gap',
        message: `${wheel.name}：x=${(cleaned[i - 1].x - wheel.datum.x).toFixed(1)}~${(cleaned[i].x - wheel.datum.x).toFixed(1)} 存在 ${dx.toFixed(1)} mm 缺测段，禁止以最近点代替`,
        detail: { from: cleaned[i - 1].x - wheel.datum.x, to: cleaned[i].x - wheel.datum.x },
      });
    }
  }
  if (medianSpacing > 1.5) {
    issues.push({
      severity: 'warning',
      code: 'coarse-spacing',
      message: `${wheel.name}：中位点距 ${medianSpacing.toFixed(2)} mm 偏粗，切深与交点可能不稳定`,
    });
  }

  // —— 方向检查：轮缘顶点必须位于基准 x 负侧，且高于正侧 ——
  let yMaxNeg = -Infinity;
  let yMaxPos = -Infinity;
  for (const p of cleaned) {
    const rx = p.x - wheel.datum.x;
    const ry = p.y - wheel.datum.y;
    if (rx < -20) yMaxNeg = Math.max(yMaxNeg, ry);
    if (rx > 5) yMaxPos = Math.max(yMaxPos, ry);
  }
  if (Number.isFinite(yMaxNeg) && Number.isFinite(yMaxPos) && yMaxNeg <= yMaxPos + 2) {
    issues.push({
      severity: 'error',
      code: 'direction',
      message: `${wheel.name}：方向疑似反向或基准错误——基准负侧未见明显轮缘顶点（负侧最高 ${yMaxNeg.toFixed(1)}，正侧 ${yMaxPos.toFixed(1)}）`,
    });
  }
  const insideBBox =
    wheel.datum.x >= cleaned[0].x - 1e-6 &&
    wheel.datum.x <= cleaned[cleaned.length - 1].x + 1e-6 &&
    wheel.datum.y >= Math.min(...cleaned.map((p) => p.y)) - 5 &&
    wheel.datum.y <= Math.max(...cleaned.map((p) => p.y)) + 5;
  if (!insideBBox) {
    issues.push({
      severity: 'error',
      code: 'datum-outside',
      message: `${wheel.name}：基准点 (${wheel.datum.x.toFixed(1)}, ${wheel.datum.y.toFixed(1)}) 落在轮廓包络外，请检查基准拾取`,
    });
  }

  // —— 噪声检查：二阶差分（邻点连线偏差） ——
  let noisy = 0;
  let maxDev = 0;
  const NOISE_LIMIT = 0.12;
  for (let i = 1; i < cleaned.length - 1; i++) {
    const dx = cleaned[i + 1].x - cleaned[i - 1].x;
    if (dx < 1e-9) continue;
    const t = (cleaned[i].x - cleaned[i - 1].x) / dx;
    const yLine = cleaned[i - 1].y + t * (cleaned[i + 1].y - cleaned[i - 1].y);
    const dev = Math.abs(cleaned[i].y - yLine);
    maxDev = Math.max(maxDev, dev);
    if (dev > NOISE_LIMIT) noisy++;
  }
  const noisyRatio = noisy / Math.max(1, cleaned.length - 2);
  if (noisyRatio > 0.05) {
    issues.push({
      severity: 'warning',
      code: 'noise',
      message: `${wheel.name}：${(noisyRatio * 100).toFixed(0)}% 的点邻域抖动超过 ${NOISE_LIMIT} mm（最大 ${maxDev.toFixed(2)} mm），最小切深受噪点支配，建议平滑后重导`,
      detail: { noisyRatio, maxDev },
    });
  }

  return makeReport(issues, cleaned, {
    pointCount: cleaned.length,
    medianSpacing,
    maxSpacing,
    xmin,
    xmax,
  });
}
