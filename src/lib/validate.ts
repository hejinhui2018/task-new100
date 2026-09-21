/** 导入轮廓的方向 / 点序 / 覆盖 / 噪声校验 */
import type { Notice, Pt } from './types';
import { gapSegments } from './geom';
import { robustNoiseSigma } from './signal';
import { GAUGE_X } from './profiles';

export interface CheckedProfile {
  /** 规范化后的点（x 严格递增，轮缘在左） */
  points: Pt[];
  /** 是否原始方向为反向（已自动翻转） */
  reversed: boolean;
  /** 重复 x 合并点数 */
  merged: number;
  notices: Notice[];
  /** 是否存在不可继续的错误 */
  fatal: boolean;
}

/**
 * 校验并规范化点序：
 * 1. 去除 NaN/重复记录；合并同 x 点；
 * 2. 判断方向（轮缘高边应在规距面一侧，即 x 较小端）；
 * 3. 升序化；检查折返点序、覆盖与明显噪声。
 */
export function checkProfile(
  raw: Pt[],
  cutZone: [number, number],
  maxPointGap: number,
  noiseWarn: number,
): CheckedProfile {
  const notices: Notice[] = [];
  let fatal = false;

  let pts = raw.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (pts.length < 8) {
    return {
      points: [],
      reversed: false,
      merged: 0,
      fatal: true,
      notices: [
        {
          severity: 'error',
          code: 'too-few-points',
          message: `有效点仅 ${pts.length} 个，至少需要 8 个点`,
        },
      ],
    };
  }

  // 折返检测：若原始序列既非整体升序也非降序，提示点序异常
  let asc = 0;
  let desc = 0;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].x > pts[i - 1].x) asc++;
    else if (pts[i].x < pts[i - 1].x) desc++;
  }
  if (asc > 0 && desc > 0) {
    notices.push({
      severity: 'warning',
      code: 'nonmonotonic-order',
      message: `原始点序存在折返（升序段 ${asc}、降序段 ${desc}），已按 x 重新排序；若来自往返扫描请检查导出`,
    });
  }
  const reversed = desc > asc;
  if (reversed) {
    pts = [...pts].reverse();
    notices.push({
      severity: 'info',
      code: 'direction-fixed',
      message: '检测到轮廓方向为踏面→轮缘（反向），已自动翻转为轮缘→踏面',
    });
  }

  pts.sort((a, b) => a.x - b.x);
  // 合并重复 x
  const merged: Pt[] = [];
  let mergeCount = 0;
  for (const p of pts) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6) {
      last.y = (last.y + p.y) / 2;
      mergeCount++;
    } else merged.push({ ...p });
  }
  if (mergeCount > 0) {
    notices.push({
      severity: 'warning',
      code: 'duplicate-x',
      message: `${mergeCount} 个重复横向坐标点已取 y 均值合并`,
    });
  }

  // 方向一致性：高端（轮缘顶）应位于 x 较小的 1/3
  const ys = merged.map((p) => p.y);
  const yMax = Math.max(...ys);
  const yMin = Math.min(...ys);
  const highIdx = ys.indexOf(yMax);
  const frac = highIdx / (merged.length - 1);
  if (yMax - yMin > 10 && frac > 0.6) {
    notices.push({
      severity: 'error',
      code: 'flange-side',
      message: '轮缘高边位于横向坐标大端，与“规距面在负侧”约定冲突，无法判定方向',
      detail: '请确认坐标约定：规距面 x≈-70，踏面外侧为正',
    });
    fatal = true;
  }

  // 覆盖检查
  const xMin = merged[0].x;
  const xMax = merged[merged.length - 1].x;
  if (xMin > GAUGE_X + 8) {
    notices.push({
      severity: 'error',
      code: 'no-flange',
      message: `轮廓未覆盖规距面/轮缘根部（最小 x=${xMin.toFixed(1)}），无法计算轮缘尺寸`,
    });
    fatal = true;
  }
  if (xMin > cutZone[0] + 2 || xMax < cutZone[1] - 2) {
    notices.push({
      severity: 'error',
      code: 'coverage',
      message: `加工区间 [${cutZone[0]}, ${cutZone[1]}] 未被轮廓 [${xMin.toFixed(1)}, ${xMax.toFixed(1)}] 覆盖`,
    });
    fatal = true;
  }

  // 缺段
  const gaps = gapSegments(merged, maxPointGap);
  for (const [a, b] of gaps) {
    const sev = b > cutZone[0] && a < cutZone[1] ? 'error' : 'warning';
    notices.push({
      severity: sev,
      code: 'gap',
      message: `x∈[${a.toFixed(1)}, ${b.toFixed(1)}] 存在 ${(b - a).toFixed(1)} mm 缺段（点距超 ${maxPointGap} mm）`,
      detail: sev === 'error' ? '缺段位于加工区间内，最小切深结果不稳定，禁止按此自动进刀' : undefined,
    });
    if (sev === 'error') fatal = true;
  }

  // 噪声
  const sigma = robustNoiseSigma(merged);
  if (sigma > noiseWarn) {
    notices.push({
      severity: 'warning',
      code: 'noise',
      message: `抗差噪声估计 σ≈${sigma.toFixed(3)} mm 超过阈值 ${noiseWarn} mm；已给出原始/平滑双结果差值作为不确定度`,
    });
  }

  // 孤立毛刺：单点相对四邻点均值的残差。真实曲率/磨耗在邻域内残差相近，
  // 毛刺则孤立突出 —— 用“本点残差 > 0.5 mm 且 > 3× 邻域残差中位绝对值”判据。
  const dev: number[] = new Array(merged.length).fill(0);
  for (let i = 2; i < merged.length - 2; i++) {
    const local = (merged[i - 2].y + merged[i - 1].y + merged[i + 1].y + merged[i + 2].y) / 4;
    dev[i] = merged[i].y - local;
  }
  let jumps = 0;
  for (let i = 2; i < merged.length - 2; i++) {
    if (Math.abs(dev[i]) < 0.5) continue;
    const near = [dev[i - 2], dev[i - 1], dev[i + 1], dev[i + 2]].map(Math.abs).sort((a, b) => a - b);
    const localScale = (near[1] + near[2]) / 2;
    if (Math.abs(dev[i]) > 3 * Math.max(localScale, 0.05)) jumps++;
  }
  if (jumps > 0) {
    notices.push({
      severity: 'warning',
      code: 'spikes',
      message: `${jumps} 处相邻点径向跳变异常（>8×MAD），疑似毛刺/失跟`,
    });
  }

  return { points: merged, reversed, merged: mergeCount, notices, fatal };
}
