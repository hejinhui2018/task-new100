/** 导入/导出：支持单轮 JSON 或 CSV 文本，及整车 JSON。 */
import type { Pt, WheelInput, WheelPos } from './types';
import { WHEEL_POS } from './types';

export class ImportError extends Error {}

function isPos(s: string): s is WheelPos {
  return (WHEEL_POS as string[]).includes(s);
}

/**
 * CSV 约定：
 *   # M1,837.4        （轮位,实测滚动圆直径）
 *   x,y
 *   -62.1,25.3
 * 也接受仅 x,y 两列（轮位由参数指定）。
 */
export function parseWheelCsv(text: string, posFallback?: WheelPos, diameterFallback?: number): WheelInput {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let pos = posFallback;
  let diameter = diameterFallback;
  const points: Pt[] = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      const parts = line.slice(1).split(/[,\t;]/).map((s) => s.trim());
      if (parts[0] && isPos(parts[0])) pos = parts[0];
      const dPart = parts.find((p) => /^[\d.]+$/.test(p));
      if (dPart) diameter = parseFloat(dPart);
      continue;
    }
    if (/^[a-zA-Z]/.test(line)) continue; // 表头
    const parts = line.split(/[,\t;\s]+/).map(parseFloat);
    const nums = parts.filter((n) => Number.isFinite(n));
    if (nums.length >= 2) points.push({ x: nums[0], y: nums[1] });
  }
  if (!pos) throw new ImportError('CSV 缺少轮位声明（首行如 "# M1,837.4"）');
  if (diameter === undefined) throw new ImportError('CSV 缺少实测滚动圆直径');
  if (points.length < 8) throw new ImportError(`有效点不足（${points.length}），至少 8 个`);
  return { pos, points, rollingDiameter: diameter };
}

export function parseWheelJson(text: string): WheelInput {
  const obj = JSON.parse(text) as Partial<WheelInput> & { wheels?: WheelInput[] };
  if (Array.isArray(obj.wheels)) throw new ImportError('该文件为整车数据，请使用“导入整车 JSON”');
  if (!obj.pos || !isPos(obj.pos)) throw new ImportError('JSON 缺少有效 pos 字段（M1/M2/T1/T2）');
  if (typeof obj.rollingDiameter !== 'number') throw new ImportError('JSON 缺少 rollingDiameter');
  if (!Array.isArray(obj.points) || obj.points.length < 8) throw new ImportError('points 不足 8 个');
  const points = obj.points
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: +p.x, y: +p.y }));
  return { pos: obj.pos, points, rollingDiameter: obj.rollingDiameter };
}

export interface WheelsFile {
  wheels: WheelInput[];
  target?: string;
  nominalDiameter?: number;
}

export function parseWheelsFile(text: string): WheelsFile {
  const obj = JSON.parse(text);
  const list: unknown[] = Array.isArray(obj) ? obj : obj.wheels;
  if (!Array.isArray(list)) throw new ImportError('文件需为车轮数组或含 wheels 字段');
  const wheels = list.map((w) => {
    const o = w as WheelInput;
    if (!isPos(o.pos)) throw new ImportError(`非法轮位 ${String(o.pos)}`);
    return {
      pos: o.pos,
      rollingDiameter: +o.rollingDiameter,
      points: (o.points as Pt[]).map((p) => ({ x: +p.x, y: +p.y })),
    };
  });
  return { wheels, target: obj.target, nominalDiameter: obj.nominalDiameter };
}

export function stringifyWheelsFile(wheels: WheelInput[], target: string, nominalDiameter: number): string {
  return JSON.stringify({ target, nominalDiameter, wheels }, null, 2);
}
