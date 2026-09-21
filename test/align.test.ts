import { describe, it, expect } from 'vitest';
import { alignToDatum } from '../src/geometry/align';
import { validateWheel } from '../src/geometry/validate';
import { makeWheel, lm } from './helpers';
import { DEFAULT_CONFIG } from '../src/geometry/types';

const req = { xmin: DEFAULT_CONFIG.machineXmin, xmax: DEFAULT_CONFIG.machineXmax };

describe('基准刚体对齐', () => {
  it('平移后基准点映射到 (0,0)，形状不变', () => {
    const wheel = makeWheel('A1L', (x) => lm.yAt(x));
    const { profile, points } = alignToDatum(wheel, wheel.points);
    const origin = points.find((p) => Math.abs(p.x) < 1e-9);
    expect(origin).toBeDefined();
    expect(profile.yAt(0)).toBeCloseTo(0, 6);
    // 平移不改变轮廓值
    expect(profile.yAt(-30)).toBeCloseTo(lm.yAt(-30), 9);
    expect(profile.yAt(20)).toBeCloseTo(lm.yAt(20), 9);
  });

  it('任意测量系基准偏移都能正确归零', () => {
    const wheel = makeWheel('A1L', (x) => lm.yAt(x) + 0.7, 840, { datum: { x: -55.2, y: 999.9 } });
    const { profile } = alignToDatum(wheel, wheel.points);
    expect(profile.yAt(0)).toBeCloseTo(0.7, 6);
  });

  it('点序回退被校验拦截', () => {
    const wheel = makeWheel('A1L', (x) => lm.yAt(x));
    wheel.points.reverse();
    const vr = validateWheel(wheel, req);
    expect(vr.issues.some((i) => i.code === 'point-order' && i.severity === 'error')).toBe(true);
    expect(vr.ok).toBe(false);
  });

  it('覆盖不足（缺轮缘侧）被拦截', () => {
    const wheel = makeWheel('A1L', (x) => lm.yAt(x), 840, { xmin: -20 });
    const vr = validateWheel(wheel, req);
    expect(vr.issues.some((i) => i.code === 'coverage-shortfall')).toBe(true);
  });

  it('大缺测段被标记为 error', () => {
    const wheel = makeWheel('A1L', (x) => lm.yAt(x), 840, { gap: [-30, -26] });
    const vr = validateWheel(wheel, req);
    expect(vr.issues.some((i) => i.code === 'gap' && i.severity === 'error')).toBe(true);
  });

  it('方向反向（轮缘出现在正侧）被拦截', () => {
    // 将轮廓左右镜像：轮缘顶点变到正侧（镜像后定义域为 -42..55）
    const wheel = makeWheel('A1L', (x) => lm.yAt(-x), 840, { xmin: -42, xmax: 55 });
    const vr = validateWheel(wheel, req);
    expect(vr.issues.some((i) => i.code === 'direction' && i.severity === 'error')).toBe(true);
  });

  it('正常新轮型面数据通过全部校验', () => {
    const wheel = makeWheel('A1L', (x) => lm.yAt(x));
    const vr = validateWheel(wheel, req);
    expect(vr.ok).toBe(true);
  });
});
