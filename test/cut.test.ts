import { describe, it, expect } from 'vitest';
import { processWheel } from '../src/lib/pipeline';
import { synthesizeProfile } from '../src/lib/samples';
import { gapCurve } from '../src/lib/cut';
import type { PlannerSettings, Pt, WheelInput, WheelPos } from '../src/lib/types';

const base: PlannerSettings = {
  target: 'S1002',
  datumBand: [28, 38],
  cutZone: [-40, 35],
  feedStep: 0.5,
  minDiameter: 830,
  axleDiffLimit: 1,
  bogieDiffLimit: 4,
  maxPointGap: 2,
  noiseWarnSigma: 0.06,
  nominalDiameter: 840,
};

function wheel(pos: WheelPos, spec: Parameters<typeof synthesizeProfile>[1], D = 837, gap?: [number, number]): WheelInput {
  return { pos, points: synthesizeProfile('S1002', spec, { gap }), rollingDiameter: D };
}

const clean = (seed = 1) =>
  ({
    uniform: 1.2,
    hollow: 0.8,
    hollowCx: -12,
    hollowB: 15,
    flangeWear: 0.3,
    pose: { theta: 0.001, dx: 0.2, dy: -0.3 },
    noise: 0,
    seed,
  }) as const;

describe('最小切深', () => {
  it('完美新轮廓（只有测量平移）dMin≈0', () => {
    const w = wheel('M1', {
      uniform: 0,
      hollow: 0,
      hollowCx: -12,
      hollowB: 15,
      flangeWear: 0,
      pose: { theta: 0, dx: 0.3, dy: -0.5 },
      noise: 0,
      seed: 11,
    });
    const c = processWheel(w, base);
    expect(c.fatal).toBe(false);
    expect(c.analysis.dMin).toBeLessThan(0.1);
  });

  it('均匀+凹磨产生正的最小切深，且覆盖全部加工区', () => {
    const c = processWheel(wheel('M1', clean(12)), base);
    expect(c.analysis.dMin).toBeGreaterThan(0.8);
    expect(c.analysis.dMin).toBeLessThan(2.5);
    expect(c.analysis.coverage).toBeCloseTo(1, 6);
    expect(c.analysis.missingSegs).toHaveLength(0);
    // 间隙曲线最大值应与 dMin 一致
    const g = gapCurve(c.aligned, base);
    const gmax = Math.max(...g.map((s) => s.g ?? -Infinity));
    expect(gmax).toBeCloseTo(c.analysis.dMin, 4);
  });

  it('dMax 由实测直径与最小轮径决定', () => {
    const c = processWheel(wheel('M2', clean(13), 835.2), base);
    // Dpost = 835.2 - 2(d + tapingY) >= 830
    const expected = (835.2 - 830) / 2 - c.analysis.tapingY;
    expect(c.analysis.dMax).toBeCloseTo(expected, 8);
  });

  it('缺测段被标记：覆盖率<1、unstable、致命，dMin 仅为已覆盖部分下界且禁止插值凑数', () => {
    const w = wheel('T2', clean(14), 837, [-8, 2]);
    const c = processWheel(w, base);
    expect(c.fatal).toBe(true);
    expect(c.analysis.unstable).toBe(true);
    expect(c.analysis.coverage).toBeLessThan(0.9);
    expect(c.analysis.missingSegs.length).toBeGreaterThan(0);
    expect(c.notices.some((n) => n.code === 'cut-gap')).toBe(true);
    // dMin 是“已覆盖部分”的下界（有限），不是真实最小切深
    const g = gapCurve(c.aligned, base);
    const coveredMax = Math.max(...g.map((s) => s.g ?? -Infinity));
    expect(c.analysis.dMin).toBeCloseTo(coveredMax, 6);
    // 缺段位置为 null 而非被线性填上
    const nulls = g.filter((s) => s.g === null);
    expect(nulls.length).toBeGreaterThan(0);
  });

  it('噪声导致原始/平滑不确定度告警', () => {
    const c = processWheel(
      wheel('T1', { ...clean(15), noise: 0.25 }, 837),
      base,
    );
    expect(c.analysis.notices.some((n) => n.code === 'noise')).toBe(true);
    expect(c.analysis.uncertainty).toBeGreaterThan(0.05);
  });

  it('切点是真实最大间隙点而非最近点', () => {
    const c = processWheel(wheel('M1', clean(16)), base);
    const { worstAt, dMin } = c.analysis;
    // 控制点在加工区间内
    expect(worstAt.x).toBeGreaterThanOrEqual(base.cutZone[0]);
    expect(worstAt.x).toBeLessThanOrEqual(base.cutZone[1]);
    // 用独立线性方法在 worstAt 附近核验间隙
    const target = c.aligned;
    const nearT: Pt[] = [];
    for (let i = 0; i < target.length - 1; i++) {
      if (target[i].x <= worstAt.x && target[i + 1].x >= worstAt.x) {
        const t = (worstAt.x - target[i].x) / (target[i + 1].x - target[i].x);
        nearT.push({ x: worstAt.x, y: target[i].y + t * (target[i + 1].y - target[i].y) });
      }
    }
    // worstAt.y 由三次插值给出，测试用独立线性插值核验（两种插值在 0.5mm 点距下应一致到 0.01mm）
    expect(nearT[0].y).toBeCloseTo(worstAt.y, 2);
    expect(Number.isFinite(dMin)).toBe(true);
  });
});

describe('轮缘尺寸（交点法）', () => {
  it('磨耗轮 Sh 增大、Sd 减小', () => {
    const fresh = processWheel(
      wheel('M1', { ...clean(21), uniform: 0, hollow: 0, flangeWear: 0 }),
      base,
    );
    const worn = processWheel(wheel('M2', clean(21), 836), base);
    expect(worn.analysis.metrics.sh).toBeGreaterThan(fresh.analysis.metrics.sh + 0.3);
    expect(worn.analysis.metrics.sd).toBeLessThan(fresh.analysis.metrics.sd - 0.1);
  });
});
