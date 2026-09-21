import { describe, it, expect } from 'vitest';
import { parseWheelCsv, parseWheelJson, parseWheelsFile, stringifyWheelsFile, ImportError } from '../src/lib/import';

describe('导入解析', () => {
  it('带轮位/直径头的 CSV', () => {
    const csv = '# M1,837.4\nx,y\n-60,25.1\n-59.5,26.0\n-50,24\n-40,12\n-30,2\n-20,0.6\n0,0\n10,-0.25\n';
    const w = parseWheelCsv(csv);
    expect(w.pos).toBe('M1');
    expect(w.rollingDiameter).toBeCloseTo(837.4, 6);
    expect(w.points.length).toBe(8);
  });

  it('无声明 CSV 使用回退轮位与直径', () => {
    const csv = '-60,25\n-59,26\n0,0\n10,-0.25\n20,-0.5\n30,-0.75\n35,-1.2\n40,-3';
    const w = parseWheelCsv(csv, 'T2', 835.0);
    expect(w.pos).toBe('T2');
    expect(w.rollingDiameter).toBe(835);
  });

  it('缺轮位声明抛 ImportError', () => {
    expect(() => parseWheelCsv('0,0\n1,1\n2,2\n3,3\n4,4\n5,5\n6,6\n7,7')).toThrow(ImportError);
  });

  it('单轮 JSON', () => {
    const obj = { pos: 'M2', rollingDiameter: 836.2, points: Array.from({ length: 9 }, (_, i) => ({ x: -60 + i, y: 20 - i * 2 })) };
    const w = parseWheelJson(JSON.stringify(obj));
    expect(w.pos).toBe('M2');
    expect(w.points).toHaveLength(9);
  });

  it('整车 JSON 往返', () => {
    const wheels = (['M1', 'M2', 'T1', 'T2'] as const).map((pos) => ({
      pos,
      rollingDiameter: 837,
      points: Array.from({ length: 9 }, (_, i) => ({ x: -60 + i, y: 20 - i })),
    }));
    const text = stringifyWheelsFile(wheels, 'LM', 840);
    const f = parseWheelsFile(text);
    expect(f.wheels).toHaveLength(4);
    expect(f.target).toBe('LM');
    expect(f.nominalDiameter).toBe(840);
  });

  it('非法 pos 抛错', () => {
    expect(() => parseWheelJson(JSON.stringify({ pos: 'X9', rollingDiameter: 840, points: [] }))).toThrow();
  });
});
