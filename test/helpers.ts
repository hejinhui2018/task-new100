import type { Pt, WheelInput, WheelPosition } from '../src/geometry/types';
import { targetProfile } from '../src/geometry/profiles';

const lm = targetProfile('LM');

/** 按给定的“对齐坐标”函数 y=f(x) 生成测量系原始点（带基准平移） */
export function makeWheel(
  position: WheelPosition,
  f: (x: number) => number,
  rollingDiameter = 840,
  opts: { xmin?: number; xmax?: number; step?: number; datum?: Pt; gap?: [number, number]; id?: string } = {},
): WheelInput {
  const datum = opts.datum ?? { x: 137.5, y: 412.8 };
  const xmin = opts.xmin ?? -55;
  const xmax = opts.xmax ?? 42;
  const step = opts.step ?? 1;
  const points: Pt[] = [];
  for (let x = xmin; x <= xmax + 1e-9; x += step) {
    if (opts.gap && x >= opts.gap[0] && x <= opts.gap[1]) continue;
    points.push({ x: x + datum.x, y: f(x) + datum.y });
  }
  return {
    id: opts.id ?? `t-${position}`,
    name: `测试-${position}`,
    position,
    rollingDiameter,
    datum,
    points,
  };
}

/** 以 LM 新轮型面为底、叠加均匀下沉量的“磨耗轮” */
export function wornWheel(position: WheelPosition, wear: (x: number) => number, diameter = 840, step = 1) {
  return makeWheel(position, (x) => lm.yAt(x) - wear(x), diameter, { step });
}

export function targetPoints(): Pt[] {
  return lm.xs.map((x, i) => ({ x, y: lm.ys[i] }));
}

export { lm };
