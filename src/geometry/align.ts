import type { Pt, WheelInput } from './types';
import { buildLinear, type LinearProfile } from './interp';

/**
 * 按基准刚体对齐：纯平移，将测量系基准点映射到型面基准 (0,0)。
 * 不做最小二乘拟合/旋转——实测坐标系由机床或便携仪给出，基准点是唯一可信锚点；
 * 旋转会同时改变轮缘高度与切深，缺乏独立观测量时不应估计。
 */
export function alignToDatum(wheel: WheelInput, cleaned: Pt[]): { points: Pt[]; profile: LinearProfile } {
  const points = cleaned.map((p) => ({ x: p.x - wheel.datum.x, y: p.y - wheel.datum.y }));
  return { points, profile: buildLinear(points) };
}
