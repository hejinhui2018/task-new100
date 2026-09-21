import { describe, it, expect } from 'vitest';
import { sampleTarget, targetSpline, TARGETS } from '../src/lib/profiles';
import { computeFlangeMetrics } from '../src/lib/metrics';

describe('内置目标型面名义尺寸', () => {
  it('S1002 关键尺寸贴近名义（Sh≈28 / Sd≈32.5 / qR≈10.5）', () => {
    const m = computeFlangeMetrics(sampleTarget('S1002', 0.02)).metrics;
    expect(m.sh).toBeCloseTo(TARGETS.S1002.nominalSh, 1);
    expect(m.sd).toBeCloseTo(TARGETS.S1002.nominalSd, 1);
    expect(m.qr).toBeCloseTo(TARGETS.S1002.nominalQr, 1);
    // 滚动圆刻线处 y=0
    expect(targetSpline('S1002').at(0)).toBeCloseTo(0, 6);
  });

  it('LM 关键尺寸贴近名义（Sh≈27 / Sd≈32 / qR≈7.7）', () => {
    const m = computeFlangeMetrics(sampleTarget('LM', 0.02)).metrics;
    expect(m.sh).toBeCloseTo(TARGETS.LM.nominalSh, 1);
    expect(m.sd).toBeCloseTo(TARGETS.LM.nominalSd, 1);
    expect(m.qr).toBeCloseTo(TARGETS.LM.nominalQr, 1);
  });

  it('采样覆盖规距面到外侧', () => {
    const p = sampleTarget('S1002');
    expect(p[0].x).toBeLessThanOrEqual(-62);
    expect(p[p.length - 1].x).toBeGreaterThanOrEqual(40);
  });
});
