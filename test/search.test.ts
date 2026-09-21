import { describe, it, expect } from 'vitest';
import { planWheelset } from '../src/geometry/pipeline';
import { buildExampleSet } from '../src/geometry/examples';
import { wornWheel } from './helpers';
import { DEFAULT_CONFIG, type PlanningConfig, type WheelInput } from '../src/geometry/types';

const cfg = (patch: Partial<PlanningConfig> = {}): PlanningConfig => ({ ...DEFAULT_CONFIG, ...patch });
const constWear = (w: number) => () => w;

function fourWheels(spec: { pos: 'A1L' | 'A1R' | 'A2L' | 'A2R'; wear: number; diameter?: number }[]): WheelInput[] {
  return spec.map((s) => wornWheel(s.pos, constWear(s.wear), s.diameter ?? 840));
}

describe('四轮耦合离散搜索', () => {
  it('正常磨耗示例：可行，候选全部满足只能去料/最小轮径/同轴差/转向架差', () => {
    const inputs = buildExampleSet('normal');
    const report = planWheelset(inputs, cfg());
    expect(report.search.feasible).toBe(true);
    expect(report.search.candidates.length).toBeGreaterThan(1);

    for (const c of report.search.candidates) {
      for (const w of c.wheels) {
        const wr = report.wheels.find((r) => r.input.position === w.position)!;
        // 只能去料：离散进刀不得小于连续最小切深
        expect(w.radiusCut).toBeGreaterThanOrEqual(wr.analysis!.minCutRadius - 1e-9);
        expect(w.finishedDiameter).toBeGreaterThanOrEqual(DEFAULT_CONFIG.minDiameter - 1e-9);
      }
      for (const a of c.axleDiffs) expect(a.diff).toBeLessThanOrEqual(DEFAULT_CONFIG.sameAxleLimit + 1e-9);
      expect(c.bogieSpread).toBeLessThanOrEqual(DEFAULT_CONFIG.bogieLimit + 1e-9);
    }
  });

  it('候选按总去除量 → 最大单轮切深 → 剩余寿命排序', () => {
    const report = planWheelset(buildExampleSet('normal'), cfg());
    const cs = report.search.candidates;
    for (let i = 1; i < cs.length; i++) {
      const a = cs[i - 1];
      const b = cs[i];
      const earlier =
        a.totalDiameterReduction < b.totalDiameterReduction - 1e-9 ||
        (Math.abs(a.totalDiameterReduction - b.totalDiameterReduction) <= 1e-9 && a.maxRadiusCut <= b.maxRadiusCut + 1e-9);
      expect(earlier).toBe(true);
    }
    // 第一名各轮都协调到直径约束，四轮直径差很小
    expect(cs[0].bogieSpread).toBeLessThanOrEqual(DEFAULT_CONFIG.bogieLimit);
  });

  it('同轴差迫使抬刀：最小进给组合不满足时，搜索给出加大切深的协调方案', () => {
    const inputs = fourWheels([
      { pos: 'A1L', wear: 1.2 },
      { pos: 'A1R', wear: 1.8 }, // 1轴最小进给后直径差 1mm > 0.5
      { pos: 'A2L', wear: 1.0 },
      { pos: 'A2R', wear: 1.6 },
    ]);
    const report = planWheelset(inputs, cfg());
    expect(report.search.feasible).toBe(true);
    const top = report.search.candidates[0];
    const a1 = top.axleDiffs.find((a) => a.axle === 1)!;
    expect(a1.diff).toBeLessThanOrEqual(DEFAULT_CONFIG.sameAxleLimit + 1e-9);
    // A1R 必须超过自身最小切深来配合 A1L
    const a1r = top.wheels.find((w) => w.position === 'A1R')!;
    expect(a1r.radiusCut).toBeGreaterThan(1.8);
  });

  it('偏磨示例：单轮恢复型面越过最小轮径 → 无解，诊断控制轮与最小轮径约束', () => {
    const report = planWheelset(buildExampleSet('partial'), cfg());
    expect(report.search.feasible).toBe(false);
    const d = report.search.diagnoses[0];
    expect(d.code).toBe('min-diameter');
    expect(d.controllingWheels).toContain('w2');
    expect(d.constraint).toContain(String(DEFAULT_CONFIG.minDiameter));
  });

  it('缺测示例：缺段轮拒绝参与搜索 → 无解且为缺段诊断，绝不硬凑', () => {
    const report = planWheelset(buildExampleSet('gap'), cfg());
    expect(report.search.feasible).toBe(false);
    expect(report.search.diagnoses.some((d) => d.code === 'missing-segment' && d.controllingWheels.includes('w2'))).toBe(true);
    // 缺段轮自身切深为 NaN/不可行
    const w2 = report.wheels.find((r) => r.input.position === 'A1R')!;
    expect(w2.analysis?.feasible ?? false).toBe(false);
  });

  it('同转向架对角直径差在粗进给网格上无法协调：无解，诊断指出控制的大轮与小轮', () => {
    // 步进 3mm → 直径格点间距 6mm：大轮格点 840/834/828，小轮 837.5/831.5…
    // 任何组合极差 ≥2.5mm > 2mm，且各轮连续意义下均允许镟修（minCut=0）
    const inputs = fourWheels([
      { pos: 'A1L', wear: 0, diameter: 840 },
      { pos: 'A1R', wear: 0, diameter: 840 },
      { pos: 'A2L', wear: 0, diameter: 840 },
      { pos: 'A2R', wear: 0, diameter: 837.5 },
    ]);
    const report = planWheelset(inputs, cfg({ sameAxleLimit: 5, feedStep: 3, minDiameter: 826 }));
    expect(report.search.feasible).toBe(false);
    const d = report.search.diagnoses[0];
    expect(d.code).toBe('discrete-grid');
    expect(d.constraint).toContain('转向架极差');
    expect(d.controllingWheels.sort()).toEqual(['t-A1L', 't-A2R'].sort());
    // 减小步进后可行
    const fine = planWheelset(inputs, cfg({ sameAxleLimit: 5, feedStep: 0.5, minDiameter: 826 }));
    expect(fine.search.feasible).toBe(true);
  });

  it('连续可行但离散网格不可行：减小步进后可恢复可行', () => {
    // minCut≈1.9（密采样保证精度），连续镟后 836.2 ≥ 836.15；0.5 网格最小进刀 2.0 → 836.0 < 836.15
    const inputs = [
      wornWheel('A1L', () => 1.9, 840, 0.2),
      wornWheel('A1R', () => 1.9, 840, 0.2),
      wornWheel('A2L', () => 1.9, 840, 0.2),
      wornWheel('A2R', () => 1.9, 840, 0.2),
    ];
    const blocked = planWheelset(inputs, cfg({ minDiameter: 836.15, feedStep: 0.5 }));
    expect(blocked.search.feasible).toBe(false);
    expect(blocked.search.diagnoses[0].code).toBe('discrete-grid');

    const fine = planWheelset(inputs, cfg({ minDiameter: 836.15, feedStep: 0.1 }));
    expect(fine.search.feasible).toBe(true);
    expect(fine.search.candidates[0].wheels.every((w) => Math.abs(w.radiusCut - 1.9) < 0.05)).toBe(true);
  });

  it('轮位缺失（只有 3 轮）直接报数据不完整', () => {
    const inputs = buildExampleSet('normal').slice(0, 3);
    const report = planWheelset(inputs, cfg());
    expect(report.search.feasible).toBe(false);
    expect(report.search.diagnoses[0].code).toBe('missing-segment');
  });
});
