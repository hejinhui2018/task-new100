import type { Pt, WheelInput, WheelPosition } from '../geometry/types';

export interface ParseResult {
  points: Pt[];
  errors: string[];
}

/** 支持 “x,y” 两列 CSV/TSV/空白分隔；可含表头行；# 开头注释 */
export function parsePoints(text: string): ParseResult {
  const errors: string[] = [];
  const points: Pt[] = [];
  const lines = text.split(/\r?\n/);
  let lineNo = 0;
  for (const rawLine of lines) {
    lineNo++;
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split(/[,\t;]|\s+/).filter(Boolean);
    if (parts.length < 2) {
      errors.push(`第 ${lineNo} 行无法解析：${rawLine}`);
      continue;
    }
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      // 容忍一行表头
      if (lineNo === 1 && /[a-zA-Z]/.test(line)) continue;
      errors.push(`第 ${lineNo} 行含非数值：${rawLine}`);
      continue;
    }
    points.push({ x, y });
  }
  if (!points.length && !errors.length) errors.push('未解析到任何坐标点');
  return { points, errors };
}

/** 完整 JSON 导入：WheelInput 对象或四轮数组 */
export function parseWheelJson(text: string): { wheels: WheelInput[]; errors: string[] } {
  const errors: string[] = [];
  try {
    const data = JSON.parse(text);
    const arr = Array.isArray(data) ? data : [data];
    const wheels: WheelInput[] = [];
    for (const w of arr) {
      if (!w || !Array.isArray(w.points) || typeof w.rollingDiameter !== 'number' || !w.datum) {
        errors.push('存在缺少 points / rollingDiameter / datum 的轮数据');
        continue;
      }
      wheels.push({
        id: String(w.id ?? cryptoId()),
        name: String(w.name ?? w.position ?? '导入轮'),
        position: w.position as WheelPosition,
        rollingDiameter: w.rollingDiameter,
        datum: { x: Number(w.datum.x), y: Number(w.datum.y) },
        points: w.points.map((p: Pt) => ({ x: Number(p.x), y: Number(p.y) })),
      });
    }
    return { wheels, errors };
  } catch (e) {
    return { wheels: [], errors: [`JSON 解析失败：${(e as Error).message}`] };
  }
}

function cryptoId(): string {
  return `w-${Math.floor(Math.random() * 1e9).toString(36)}`;
}
