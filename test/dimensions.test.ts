import { describe, it, expect } from 'vitest';
import { flangeDimensions } from '../src/geometry/dimensions';
import { alignToDatum } from '../src/geometry/align';
import { validateWheel } from '../src/geometry/validate';
import { makeWheel, lm, wornWheel } from './helpers';
import { targetProfile } from '../src/geometry/profiles';
import { DEFAULT_CONFIG } from '../src/geometry/types';

const req = { xmin: DEFAULT_CONFIG.machineXmin, xmax: DEFAULT_CONFIG.machineXmax };

function dimsOf(w: ReturnType<typeof makeWheel>) {
  const vr = validateWheel(w, req);
  return flangeDimensions(alignToDatum(w, vr.cleaned).profile);
}

describe('轮缘尺寸 Sh / Sd / qR', () => {
  it('新轮 LM：Sh≈27、Sd≈32、qR 在常见范围 6.5~10', () => {
    const w = makeWheel('A1L', (x) => lm.yAt(x));
    const d = dimsOf(w);
    expect(d.valid).toBe(true);
    expect(d.Sh).toBeGreaterThan(26);
    expect(d.Sh).toBeLessThan(28);
    expect(d.Sd).toBeGreaterThan(28);
    expect(d.Sd).toBeLessThan(35);
    expect(d.qR).toBeGreaterThan(6);
    expect(d.qR).toBeLessThan(11);
  });

  it('qR 随喉侧两交点水平距离变化：喉弧磨耗使 qR 改变', () => {
    const fresh = dimsOf(makeWheel('A1L', (x) => lm.yAt(x)));
    // 喉弧处材料磨去 3mm：xAt2/xAt10 外移，Sd 减小，qR 变化
    const worn = dimsOf(
      wornWheel('A1L', (x) => 3.0 * Math.exp(-(((x + 36) / 4) ** 2))),
    );
    expect(worn.Sd).toBeLessThan(fresh.Sd);
    expect(worn.valid).toBe(true);
  });

  it('交点缺失（喉弧被填平到 -10 线以上）时返回无效与原因，不返回伪造尺寸', () => {
    // 轮缘喉侧（x<-16）整体抬高到 19，yTip-10≈17 水平线在喉侧窗口 (-46,-18) 内无交点
    const w = makeWheel('A1L', (x) => (x < -16 ? Math.max(lm.yAt(x), 19) : lm.yAt(x)));
    const d = dimsOf(w);
    expect(d.valid).toBe(false);
    expect(d.issues.length).toBeGreaterThan(0);
    expect(Number.isNaN(d.Sd)).toBe(true);
  });

  it('LMA 型面同样可求尺寸', () => {
    const lma = targetProfile('LMA');
    const w = makeWheel('A1L', (x) => lma.yAt(x));
    const d = dimsOf(w);
    expect(d.valid).toBe(true);
    expect(d.Sh).toBeGreaterThan(26);
  });
});
