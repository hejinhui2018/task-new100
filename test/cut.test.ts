import { describe, it, expect } from 'vitest';
import { machiningMinCut } from '../src/geometry/cut';
import { alignToDatum } from '../src/geometry/align';
import { validateWheel } from '../src/geometry/validate';
import { makeWheel, lm, wornWheel, targetPoints } from './helpers';
import { DEFAULT_CONFIG, type WheelInput } from '../src/geometry/types';

const [XMIN, XMAX] = [DEFAULT_CONFIG.machineXmin, DEFAULT_CONFIG.machineXmax];

function profileOf(w: ReturnType<typeof makeWheel>) {
  const vr = validateWheel(w, { xmin: XMIN, xmax: XMAX });
  return alignToDatum(w, vr.cleaned).profile;
}

describe('单轮最小切深', () => {
  it('新轮与目标重合时 d*=0，可行', () => {
    // 直接使用目标型面同一组点，消除两套网格的采样差
    const w: WheelInput = {
      id: 'exact',
      name: '精确新轮',
      position: 'A1L',
      rollingDiameter: 840,
      datum: { x: 0, y: 0 },
      points: targetPoints(),
    };
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.feasible).toBe(true);
    expect(a.minCutRadius).toBe(0);
    expect(a.crossings).toBe(0);
  });

  it('整体均匀下沉 w：d*=w，控制点遍及全段，镟后恰好贴目标', () => {
    const w = wornWheel('A1L', () => 1.8, 840, 0.2);
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.minCutRadius).toBeCloseTo(1.8, 3);
    expect(a.diameterReduction).toBeCloseTo(3.6, 3);
  });

  it('局部凹磨：d* 等于凹坑最大深度且位于凹坑位置', () => {
    const wear = (x: number) => 2.5 * Math.exp(-(((x - 10) / 6) ** 2));
    const w = wornWheel('A1L', wear);
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.minCutRadius).toBeCloseTo(2.5, 1);
    expect(Math.abs(a.governingX - 10)).toBeLessThan(1.5);
  });

  it('实测高于目标（有凸点）时不允许负切深：d* 截到 0', () => {
    const w = makeWheel('A1L', (x) => lm.yAt(x) + 0.3);
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.minCutRadius).toBe(0);
  });

  it('混合磨耗（凹坑+普遍下沉）取包络最大值', () => {
    const wear = (x: number) => 0.8 + 1.2 * Math.exp(-(((x + 30) / 4) ** 2));
    const w = wornWheel('A1L', wear);
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.minCutRadius).toBeCloseTo(2.0, 1);
  });

  it('加工区间缺段时直接判不可行，不返回伪造切深', () => {
    const w = makeWheel('A1L', (x) => lm.yAt(x) - 1, 840, { gap: [-20, -16] });
    // 校验虽会报 gap error，但切深分析直接基于轮廓覆盖判断
    const prof = alignToDatum(w, w.points).profile;
    const a = machiningMinCut(prof, lm, XMIN, XMAX);
    expect(a.feasible).toBe(false);
    expect(Number.isNaN(a.minCutRadius)).toBe(true);
    expect(a.uncovered.length).toBeGreaterThan(0);
    expect(a.notes.join()).toContain('缺测');
  });

  it('两曲线多次交叉被统计并给出稳定性说明', () => {
    // 交替凹凸制造 ≥2 次过盈变号
    const wear = (x: number) => 0.6 * Math.sin((x + 45) / 4);
    const w = wornWheel('A1L', wear);
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.crossings).toBeGreaterThanOrEqual(2);
    expect(a.notes.join()).toContain('交叉');
  });

  it('不使用最近点：切深是严格的纵向 max(t-m)，与横向平移误差区分', () => {
    // 横向错位 0.5mm：在负斜率的轮缘外侧/喉弧产生正过盈，控制点位于陡斜率轮缘区
    const w = makeWheel('A1L', (x) => lm.yAt(x + 0.5), 840, { xmax: 41.5 });
    const a = machiningMinCut(profileOf(w), lm, XMIN, XMAX);
    expect(a.minCutRadius).toBeGreaterThan(0.2);
    expect(a.governingX).toBeLessThan(-30);
  });
});
