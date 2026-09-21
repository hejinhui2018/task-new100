import { describe, it, expect } from 'vitest';
import { buildLinear } from '../src/geometry/interp';

describe('分段线性插值', () => {
  it('单调 x 上的分段线性 yAt 精确成立', () => {
    const p = buildLinear([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(p.yAt(5)).toBeCloseTo(5, 10);
    expect(p.yAt(0)).toBeCloseTo(0, 10);
    expect(p.yAt(20)).toBeCloseTo(0, 10);
    expect(p.yAt(15)).toBeCloseTo(5, 10);
  });

  it('covers 与禁止外推：越界抛 RangeError 而非外推硬凑', () => {
    const p = buildLinear([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
    expect(p.covers(0.5)).toBe(true);
    expect(p.covers(-0.1)).toBe(false);
    expect(() => p.yAt(-0.5)).toThrow(RangeError);
    expect(() => p.yAt(2)).toThrow(RangeError);
  });

  it('水平线交点：单调斜坡与水平段都能求出', () => {
    const p = buildLinear([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 30, y: 0 },
    ]);
    expect(p.intersectionsY(5)).toEqual([5, 25]);
    const at10 = p.intersectionsY(10);
    expect(at10).toContain(10);
    expect(at10).toContain(20);
  });

  it('轮缘喉弧的水平线可有多个交点，全部返回并按 x 升序', () => {
    // /\/\/ 形状
    const p = buildLinear([
      { x: 0, y: 0 },
      { x: 2, y: 6 },
      { x: 4, y: 0 },
      { x: 6, y: 6 },
      { x: 8, y: 0 },
    ]);
    expect(p.intersectionsY(3)).toEqual([1, 3, 5, 7]);
  });
});
