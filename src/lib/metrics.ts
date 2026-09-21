/**
 * 轮缘尺寸：Sh（高度）、Sd（厚度）、qR（轮缘梯度弧长）。
 * 全部由水平切面与型线的**真实交点**计算，不用最近点近似。
 */
import type { FlangeMetrics, Notice, Pt } from './types';
import { crossingsAtY, MonotoneCubic } from './geom';
import { arcLengthBetweenY, GAUGE_X, sampleTarget, TARGETS, TAPING_X } from './profiles';
import type { TargetId } from './types';

export interface MetricsResult {
  metrics: FlangeMetrics;
  notices: Notice[];
}

export function computeFlangeMetrics(points: Pt[]): MetricsResult {
  const notices: Notice[] = [];

  // Sh：轮缘最高点相对实测滚动圆切线（x=0 处型线高度）的高差。
  // 对齐坐标下目标在 x=0 处 y=0；磨耗轮廓此处可能为负（凹磨），Sh 随之增大。
  const yMax = points.reduce((m, p) => Math.max(m, p.y), -Infinity);
  const xDataMin = points[0].x;
  const xDataMax = points[points.length - 1].x;
  let treadY: number;
  let sh: number;
  if (xDataMin <= TAPING_X && xDataMax >= TAPING_X) {
    treadY = new MonotoneCubic(points).at(TAPING_X);
    sh = yMax - treadY;
  } else {
    treadY = NaN;
    sh = NaN;
    notices.push({
      severity: 'warning',
      code: 'sh-no-tangent',
      message: '轮廓未覆盖滚动圆刻线 x=0，无法确定实测切线，Sh 按最高点绝对高度不可用',
    });
  }

  const at10 = crossingsAtY(points, 10);
  let sd = NaN;
  if (at10.length === 0) {
    notices.push({
      severity: 'warning',
      code: 'sd-no-cross',
      message: '型线与 y=10 水平线无交点（轮缘高度不足或轮缘段缺测），Sd 无法计算',
    });
  } else {
    // 轮缘面在左、踏面在右，取最靠右（踏面侧）交点
    sd = at10[at10.length - 1] - GAUGE_X;
  }

  const at9 = crossingsAtY(points, 9);
  const at2 = crossingsAtY(points, 2);
  let qr = NaN;
  if (at9.length === 0 || at2.length === 0) {
    notices.push({
      severity: 'warning',
      code: 'qr-no-cross',
      message: 'y=2 / y=9 切面交点缺失（下部轮缘缺测），qR 无法计算',
    });
  } else {
    qr = arcLengthBetweenY(points, 2, 9);
  }

  return {
    metrics: { sh, sd, qr, tapingX: TAPING_X },
    notices,
  };
}

/** 目标型面名义尺寸（同一算法回代，避免常量与型面表脱节） */
export function targetMetrics(id: TargetId): FlangeMetrics {
  const pts = sampleTarget(id, 0.05);
  return computeFlangeMetrics(pts).metrics;
}

export function targetNominal(id: TargetId): { sh: number; sd: number; qr: number } {
  const t = TARGETS[id];
  return { sh: t.nominalSh, sd: t.nominalSd, qr: t.nominalQr };
}
