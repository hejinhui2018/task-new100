import { describe, it, expect } from 'vitest';
import { alignToTarget, applyTransform } from '../src/lib/align';
import { synthesizeProfile } from '../src/lib/samples';
import type { Pt } from '../src/lib/types';

const BAND: [number, number] = [28, 38];

describe('基准刚体对齐', () => {
  it('从已知位姿恢复 θ/dx/dy（无噪声、无磨耗）', () => {
    const pose = { theta: 0.0018, dx: 0.55, dy: -0.7 };
    const pts = synthesizeProfile(
      'S1002',
      { uniform: 0, hollow: 0, hollowCx: -12, hollowB: 16, flangeWear: 0, pose, noise: 0, seed: 7 },
    );
    const a = alignToTarget(pts, 'S1002', BAND);
    expect(a.theta).toBeCloseTo(-pose.theta, 4);
    expect(a.dx).toBeCloseTo(-pose.dx, 2);
    expect(a.dy).toBeCloseTo(-pose.dy, 2);
    expect(a.fitMad).toBeLessThan(0.02);
  });

  it('对仅有平移的数据恢复平移', () => {
    const pts = synthesizeProfile(
      'LM',
      {
        uniform: 0,
        hollow: 0,
        hollowCx: -10,
        hollowB: 14,
        flangeWear: 0,
        pose: { theta: 0, dx: -0.8, dy: 0.6 },
        noise: 0,
        seed: 9,
      },
    );
    const a = alignToTarget(pts, 'LM', BAND);
    expect(Math.abs(a.theta)).toBeLessThan(1e-3);
    expect(a.dx).toBeCloseTo(0.8, 3);
    expect(a.dy).toBeCloseTo(-0.6, 3);
  });

  it('applyTransform 为刚体旋转+平移，距离保持', () => {
    const t = { theta: 0.01, dx: 1, dy: -2 };
    const p1: Pt = { x: -10, y: 5 };
    const p2: Pt = { x: 30, y: -1 };
    const q1 = applyTransform(p1, t);
    const q2 = applyTransform(p2, t);
    const d0 = Math.hypot(p1.x - p2.x, p1.y - p2.y);
    const d1 = Math.hypot(q1.x - q2.x, q1.y - q2.y);
    expect(d1).toBeCloseTo(d0, 9);
  });

  it('基准带无点时报错而非给假结果', () => {
    const pts = synthesizeProfile(
      'S1002',
      {
        uniform: 0,
        hollow: 0,
        hollowCx: -12,
        hollowB: 16,
        flangeWear: 0,
        pose: { theta: 0, dx: 0, dy: 0 },
        noise: 0,
        seed: 3,
      },
    ).filter((p) => p.x < 0);
    const a = alignToTarget(pts, 'S1002', BAND);
    expect(a.notices.some((n) => n.code === 'band-empty')).toBe(true);
  });
});
