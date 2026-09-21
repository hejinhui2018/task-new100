import { describe, it, expect } from 'vitest';
import { checkProfile } from '../src/lib/validate';
import { targetSpline } from '../src/lib/profiles';

const zone: [number, number] = [-40, 35];

/** 在目标型线上取点并做任意刚体偏移（原始为正向点序） */
function targetPoints(pose = { theta: 0, dx: 0, dy: 0 }, reverse = false, gap?: [number, number]) {
  const sp = targetSpline('S1002');
  const [x0, x1] = sp.range;
  const pts: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x += 0.5) {
    if (gap && x > gap[0] && x < gap[1]) continue;
    pts.push({ x: x + pose.dx, y: sp.at(x) + pose.dy });
  }
  return reverse ? pts.reverse() : pts;
}

describe('轮廓校验', () => {
  it('正常正向点序通过', () => {
    const r = checkProfile(targetPoints(), zone, 2, 0.06);
    expect(r.fatal).toBe(false);
    expect(r.points[0].x).toBeLessThan(r.points[r.points.length - 1].x);
  });

  it('反向点序自动翻转并提示', () => {
    const r = checkProfile(targetPoints({ theta: 0, dx: 0, dy: 0 }, true), zone, 2, 0.06);
    expect(r.reversed).toBe(true);
    expect(r.fatal).toBe(false);
    expect(r.points[0].x).toBeLessThan(r.points[r.points.length - 1].x);
    expect(r.notices.some((n) => n.code === 'direction-fixed')).toBe(true);
  });

  it('折返点序被识别并排序', () => {
    const p = targetPoints();
    const scrambled = [...p.slice(0, 50), ...p.slice(80, 120), ...p.slice(50, 80), ...p.slice(120)];
    const r = checkProfile(scrambled, zone, 2, 0.06);
    expect(r.notices.some((n) => n.code === 'nonmonotonic-order')).toBe(true);
    expect(r.fatal).toBe(false);
  });

  it('加工区缺段报致命错误', () => {
    const r = checkProfile(targetPoints({ theta: 0, dx: 0, dy: 0 }, false, [-8, 5]), zone, 2, 0.06);
    expect(r.fatal).toBe(true);
    expect(r.notices.some((n) => n.severity === 'error' && n.code === 'gap')).toBe(true);
  });

  it('覆盖不足（未覆盖规距面/加工区）报致命', () => {
    const sp = targetSpline('S1002');
    const pts: Array<{ x: number; y: number }> = [];
    for (let x = -20; x <= 35; x += 0.5) pts.push({ x, y: sp.at(x) });
    const r = checkProfile(pts, zone, 2, 0.06);
    expect(r.fatal).toBe(true);
    expect(r.notices.some((n) => n.code === 'no-flange' || n.code === 'coverage')).toBe(true);
  });

  it('点数不足直接致命', () => {
    const r = checkProfile(
      [
        { x: -50, y: 20 },
        { x: 0, y: 0 },
      ],
      zone,
      2,
      0.06,
    );
    expect(r.fatal).toBe(true);
    expect(r.notices[0].code).toBe('too-few-points');
  });

  it('重复 x 被合并', () => {
    const p = targetPoints();
    p.splice(10, 0, { ...p[10] });
    const r = checkProfile(p, zone, 2, 0.06);
    expect(r.merged).toBeGreaterThan(0);
  });
});
