import { describe, it, expect } from 'vitest';
import { searchPlan, type WheelComputed } from '../src/lib/planner';
import { processWheel } from '../src/lib/pipeline';
import { synthesizeProfile, buildScenario } from '../src/lib/samples';
import type { Candidate, PlannerSettings, WheelInput, WheelPos } from '../src/lib/types';
import { WHEEL_POS } from '../src/lib/types';

const settings: PlannerSettings = {
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

/** 构造精确可控的车轮计算结果（duck-typed WheelComputed） */
function mk(pos: WheelPos, D: number, dMin: number, dMax: number, tapingY = 0, unstable = false): WheelComputed {
  return {
    input: { pos, rollingDiameter: D, points: [] },
    analysis: {
      pos,
      dMin,
      dMax,
      tapingY,
      worstAt: { x: 0, y: 0 },
      uncertainty: 0,
      crossings: 0,
      coverage: 1,
      missingSegs: [],
      align: { theta: 0, dx: 0, dy: 0, fitMad: 0, bandPoints: 10, notices: [] },
      metrics: { sh: 28, sd: 32.5, qr: 10.5, tapingX: 0 },
      postMetrics: { sh: 28, sd: 32.5, qr: 10.5, tapingX: 0 },
      notices: [],
      unstable,
    },
  } as unknown as WheelComputed;
}

function record(wheels: Array<WheelComputed>): Record<WheelPos, WheelComputed | null> {
  return Object.fromEntries(WHEEL_POS.map((p) => [p, wheels.find((w) => w.input.pos === p) ?? null])) as Record<
    WheelPos,
    WheelComputed | null
  >;
}

function checkCandidate(c: Candidate, s: PlannerSettings) {
  // 只能去料：切深为非负
  for (const p of WHEEL_POS) expect(c.cuts[p]).toBeGreaterThanOrEqual(-1e-9);
  // 步长网格
  for (const p of WHEEL_POS) {
    expect(c.cuts[p] / s.feedStep).toBeCloseTo(Math.round(c.cuts[p] / s.feedStep), 8);
  }
  // 最小轮径
  for (const p of WHEEL_POS) expect(c.postDiameters[p]).toBeGreaterThanOrEqual(s.minDiameter - 1e-9);
  // 同轴差
  expect(c.axleDiffs['M1-M2']).toBeLessThanOrEqual(s.axleDiffLimit + 1e-9);
  expect(c.axleDiffs['T1-T2']).toBeLessThanOrEqual(s.axleDiffLimit + 1e-9);
  // 转向架差
  expect(c.bogieSpread).toBeLessThanOrEqual(s.bogieDiffLimit + 1e-9);
  // 汇总字段自洽
  expect(c.totalRemovedDiameter).toBeCloseTo(2 * WHEEL_POS.reduce((a, p) => a + c.cuts[p], 0), 9);
  expect(c.maxCut).toBeCloseTo(Math.max(...WHEEL_POS.map((p) => c.cuts[p])), 9);
}

describe('四轮耦合离散搜索 — 可行', () => {
  const wheels = record([
    mk('M1', 840, 1.0, 5),
    mk('M2', 840, 1.2, 5),
    mk('T1', 840, 0.8, 5),
    mk('T2', 840, 1.5, 5),
  ]);

  it('返回候选且全部满足约束与网格', () => {
    const plan = searchPlan(wheels, settings);
    expect(plan.feasible).toBe(true);
    expect(plan.candidates.length).toBeGreaterThan(1);
    for (const c of plan.candidates) checkCandidate(c, settings);
    // 每个候选都满足各自 dMin（只能去料）
    for (const c of plan.candidates.slice(0, 8)) {
      for (const w of Object.values(wheels)) {
        expect(c.cuts[w!.input.pos]).toBeGreaterThanOrEqual(w!.analysis.dMin - 1e-9);
      }
    }
  });

  it('首选为网格上界最小去除方案，排序为 总去除→maxCut→余量', () => {
    const plan = searchPlan(wheels, settings);
    const c0 = plan.candidates[0];
    // 最小网格切深：1.0/1.5/1.0/1.5（M2 与 T2 进位到 1.5）
    expect(c0.cuts.M1).toBeCloseTo(1.0, 9);
    expect(c0.cuts.M2).toBeCloseTo(1.5, 9);
    expect(c0.cuts.T1).toBeCloseTo(1.0, 9);
    expect(c0.cuts.T2).toBeCloseTo(1.5, 9);
    const totals = plan.candidates.map((c) => c.totalRemovedDiameter);
    const sorted = totals.slice().sort((a, b) => a - b);
    expect(totals).toEqual(sorted);
  });

  it('径差配平：收紧转向架差限值迫使大径轮加深', () => {
    const w2 = record([
      mk('M1', 840, 1, 5),
      mk('M2', 840, 1, 5),
      mk('T1', 838.4, 1, 5),
      mk('T2', 838.4, 1, 5),
    ]);
    // 各轮最小切深 1.0 时转向架 spread=1.6；限 1.0 后大径 M 轴必须加深到 1.5 配平
    const tight: PlannerSettings = { ...settings, bogieDiffLimit: 1.0 };
    const plan = searchPlan(w2, tight);
    expect(plan.feasible).toBe(true);
    const c0 = plan.candidates[0];
    expect(Math.min(c0.cuts.M1, c0.cuts.M2)).toBeGreaterThan(Math.max(c0.cuts.T1, c0.cuts.T2));
    expect(c0.bogieSpread).toBeLessThanOrEqual(1.0 + 1e-9);
  });

  it('provisional 标记传递不稳定轮', () => {
    const w3 = record([
      mk('M1', 840, 1, 5),
      mk('M2', 840, 1, 5, 0, true),
      mk('T1', 840, 1, 5),
      mk('T2', 840, 1, 5),
    ]);
    const plan = searchPlan(w3, settings);
    expect(plan.candidates[0].provisional).toBe(true);
  });
});

describe('四轮耦合离散搜索 — 无解诊断', () => {
  it('单轮最小轮径冲突 → minDiameter 并指出控制轮', () => {
    const wheels = record([
      mk('M1', 840, 1, 5),
      mk('M2', 840, 1, 5),
      mk('T1', 832, 4.5, 3), // dMin 4.5 > dMax 3（minD=830 ⇒ dMax=(832-830)/2=1 更小）
      mk('T2', 840, 1, 5),
    ]);
    const plan = searchPlan(wheels, settings);
    expect(plan.feasible).toBe(false);
    expect(plan.infeasibility!.constraint).toBe('minDiameter');
    expect(plan.infeasibility!.controlling).toContain('T1');
  });

  it('低端轮被迫深切、高端轮到 dMax 仍超转向架差 → bogieDiff 并指出两端控制轮', () => {
    const wheels = record([
      mk('M1', 834, 1.5, 5),
      mk('M2', 834, 1.5, 5),
      mk('T1', 839, 0, 1.5), // 高端轮最多切 1.5 半径
      mk('T2', 839, 0, 1.5),
    ]);
    const tight: PlannerSettings = { ...settings, bogieDiffLimit: 3 };
    const plan = searchPlan(wheels, tight);
    expect(plan.feasible).toBe(false);
    expect(['bogieDiff', 'axleDiff']).toContain(plan.infeasibility!.constraint);
    expect(plan.infeasibility!.controlling).toContain('T1');
    expect(plan.infeasibility!.controlling).toContain('M1');
  });

  it('车轮缺失 → noValidProfile', () => {
    const wheels = record([mk('M1', 840, 1, 5), mk('M2', 840, 1, 5), mk('T1', 840, 1, 5)]);
    const plan = searchPlan(wheels, settings);
    expect(plan.feasible).toBe(false);
    expect(plan.infeasibility!.constraint).toBe('noValidProfile');
    expect(plan.infeasibility!.controlling).toContain('T2');
  });

  it('覆盖率为 0 的轮廓（缺测阻断）→ noValidProfile', () => {
    const blocked = mk('T2', 840, Infinity, -Infinity, NaN, true);
    blocked.analysis.coverage = 0;
    blocked.analysis.notices = [{ severity: 'error', code: 'cut-gap', message: 'x 缺测' }];
    const wheels = record([
      mk('M1', 840, 1, 5),
      mk('M2', 840, 1, 5),
      mk('T1', 840, 1, 5),
      blocked,
    ]);
    const plan = searchPlan(wheels, settings);
    expect(plan.feasible).toBe(false);
    expect(plan.infeasibility!.constraint).toBe('noValidProfile');
    expect(plan.infeasibility!.controlling).toContain('T2');
  });
});

describe('端到端：内置三场景', () => {
  const run = (id: 'normal' | 'eccentric' | 'missing') => {
    const sc = buildScenario(id);
    const computed = Object.fromEntries(
      sc.wheels.map((w: WheelInput) => [w.pos, processWheel(w, settings)]),
    ) as Record<WheelPos, WheelComputed | null>;
    return { computed, plan: searchPlan(computed, settings) };
  };

  it('正常磨耗：可行且首选径差全部合规', () => {
    const { plan } = run('normal');
    expect(plan.feasible).toBe(true);
    checkCandidate(plan.candidates[0], settings);
  });

  it('偏磨：可行但带噪声告警/不确定度提示', () => {
    const { computed, plan } = run('eccentric');
    expect(plan.feasible).toBe(true);
    const noisy = WHEEL_POS.filter((p) => (computed[p]!.analysis.notices || []).some((n) => n.code === 'noise' || n.code === 'cut-uncertain'));
    expect(noisy.length).toBeGreaterThan(0);
  });

  it('缺测：无解且控制轮为 T2', () => {
    const { plan } = run('missing');
    expect(plan.feasible).toBe(false);
    expect(plan.infeasibility!.constraint).toBe('noValidProfile');
    expect(plan.infeasibility!.controlling).toContain('T2');
  });

  it('合成器确定性：同种子两次生成完全一致', () => {
    const spec = {
      uniform: 1,
      hollow: 0.5,
      hollowCx: -12,
      hollowB: 15,
      flangeWear: 0.2,
      pose: { theta: 0.001, dx: 0.2, dy: -0.3 },
      noise: 0.02,
      seed: 42,
    };
    expect(synthesizeProfile('S1002', spec)).toEqual(synthesizeProfile('S1002', spec));
  });
});
