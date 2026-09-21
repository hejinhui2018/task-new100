import { describe, it, expect } from 'vitest';
import { MonotoneCubic, crossingsAtY, gapSegments, resampleLinear, median, mad, stdev, clamp } from '../src/lib/geom';
import type { Pt } from '../src/lib/types';

describe('数值工具', () => {
  it('clamp / median / mad / stdev', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(mad([1, 1, 1])).toBe(0);
    expect(stdev([2, 4])).toBeCloseTo(Math.SQRT2, 10);
  });
});

describe('MonotoneCubic 保单调三次插值', () => {
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 3, y: 0 },
  ];
  const sp = new MonotoneCubic(pts);

  it('节点处精确取值', () => {
    expect(sp.at(0)).toBe(0);
    expect(sp.at(1)).toBe(1);
    expect(sp.at(2)).toBe(1);
    expect(sp.at(3)).toBe(0);
  });

  it('在平台附近不过冲（超出节点包围的 y）', () => {
    for (let x = 0; x <= 3.0001; x += 0.02) {
      const y = sp.at(x);
      expect(y).toBeGreaterThanOrEqual(-1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('线性数据精确复现', () => {
    const lin = new MonotoneCubic([
      { x: 0, y: 2 },
      { x: 1, y: 4 },
      { x: 2, y: 6 },
    ]);
    expect(lin.at(0.5)).toBeCloseTo(3, 10);
    expect(lin.at(1.7)).toBeCloseTo(5.4, 10);
  });
});

describe('crossingsAtY 水平求交', () => {
  it('单点穿越', () => {
    const xs = crossingsAtY(
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      5,
    );
    expect(xs).toHaveLength(1);
    expect(xs[0]).toBeCloseTo(5, 10);
  });

  it('多交点（V/W 形）且按 x 排序去重', () => {
    const p: Pt[] = [
      { x: 0, y: -1 },
      { x: 1, y: 1 },
      { x: 2, y: -1 },
      { x: 3, y: 1 },
      { x: 4, y: -1 },
    ];
    const xs = crossingsAtY(p, 0);
    expect(xs).toHaveLength(4);
    expect(xs[0]).toBeCloseTo(0.5, 10);
    expect(xs[1]).toBeCloseTo(1.5, 10);
    expect(xs[2]).toBeCloseTo(2.5, 10);
    expect(xs[3]).toBeCloseTo(3.5, 10);
  });

  it('无交点返回空', () => {
    expect(crossingsAtY([{ x: 0, y: 0 }, { x: 1, y: 1 }], 5)).toEqual([]);
  });
});

describe('gapSegments / resampleLinear', () => {
  it('识别超阈值点距', () => {
    const p: Pt[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 6, y: 0 },
      { x: 7, y: 0 },
    ];
    expect(gapSegments(p, 2)).toEqual([[1, 6]]);
  });

  it('等距重采样并在覆盖区外不补点', () => {
    const p: Pt[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ];
    const r = resampleLinear(p, 0, 10, 2);
    expect(r[0].x).toBe(0);
    expect(r[r.length - 1].x).toBe(10);
    expect(r[3].y).toBeCloseTo(6, 10);
  });
});
