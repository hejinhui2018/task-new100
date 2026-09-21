/**
 * 内置示例：以目标型面为基底，用确定性方式叠加
 *  - 测量位姿误差（小转角 + 平移）；
 *  - 均匀直径磨耗、踏面凹磨、轮缘面磨耗（减薄）；
 *  - 偏磨（凹磨中心横向偏移、左右不对称）；
 *  - 测量噪声与缺段。
 * 全部为教学/演示用合成数据，非实测。
 */
import type { Pt, TargetId, WheelInput, WheelPos } from './types';
import { targetSpline, targetRange } from './profiles';

/** 可复现 PRNG */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller 高斯噪声 */
function gauss(rnd: () => number): number {
  const u = Math.max(1e-9, rnd());
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface WearSpec {
  /** 均匀径向磨耗（直径损失的一半）mm */
  uniform: number;
  /** 凹磨深度 mm */
  hollow: number;
  /** 凹磨中心 x */
  hollowCx: number;
  /** 凹磨宽度 mm */
  hollowB: number;
  /** 轮缘面磨耗（Sd 减薄量近似）mm */
  flangeWear: number;
  /** 测量位姿 */
  pose: { theta: number; dx: number; dy: number };
  /** 噪声 σ mm */
  noise: number;
  seed: number;
}

const STEP = 0.5;

export function synthesizeProfile(
  target: TargetId,
  spec: WearSpec,
  opts: { gap?: [number, number] } = {},
): Pt[] {
  const spline = targetSpline(target);
  const [x0, x1] = targetRange(target);
  const rnd = mulberry32(spec.seed);
  const out: Pt[] = [];

  for (let x = x0; x <= x1 + 1e-9; x += STEP) {
    if (opts.gap && x > opts.gap[0] && x < opts.gap[1]) continue;
    const yT = spline.at(x);

    // 径向磨耗：均匀 + 凹磨高斯盆。作用于踏面（y<3）；x>28 的外侧基准段豁免，
    // 20→28 之间余弦平滑收口，避免在基准带边缘制造台阶（台阶会使刚体对齐病态）。
    const taper = x >= 28 ? 0 : x <= 20 ? 1 : 0.5 * (1 - Math.cos((Math.PI * (28 - x)) / 8));
    const treadW = yT < 3 ? taper : 0;
    const hollow = spec.hollow * Math.exp(-(((x - spec.hollowCx) / spec.hollowB) ** 2)) * treadW;
    let yM = yT - spec.uniform * treadW - hollow;

    // 轮缘面磨耗：金属去除使轮缘面向规距面（-x）后退，y≈10 处最大（Sd 减薄）
    const fwShape =
      yT > 2
        ? Math.max(0, 1 - Math.abs(yT - 10) / 10) // y=10 峰，y=2 与 y=18+ 衰减
        : 0;
    let xM = x - spec.flangeWear * fwShape;

    // 测量噪声（径向）
    yM += spec.noise * gauss(rnd) * (yT < 20 ? 1 : 0.5);

    // 测量位姿（绕原点刚体变换）
    const c = Math.cos(spec.pose.theta);
    const s = Math.sin(spec.pose.theta);
    const xr = xM * c - yM * s + spec.pose.dx;
    const yr = xM * s + yM * c + spec.pose.dy;
    out.push({ x: +xr.toFixed(4), y: +yr.toFixed(4) });
  }
  return out;
}

export type ScenarioId = 'normal' | 'eccentric' | 'missing';

export interface Scenario {
  id: ScenarioId;
  label: string;
  description: string;
  target: TargetId;
  nominalDiameter: number;
  wheels: WheelInput[];
}

const POS: WheelPos[] = ['M1', 'M2', 'T1', 'T2'];

function mkWheels(
  target: TargetId,
  specs: WearSpec[],
  diameterLoss: number[],
  gap?: [number, number],
  gapAt?: number,
): WheelInput[] {
  return POS.map((pos, i) => ({
    pos,
    points: synthesizeProfile(target, specs[i], {
      gap: gapAt === i ? gap : undefined,
    }),
    rollingDiameter: 840 - diameterLoss[i],
  }));
}

export function buildScenario(id: ScenarioId): Scenario {
  if (id === 'normal') {
    const specs: WearSpec[] = [
      { uniform: 1.0, hollow: 0.5, hollowCx: -12, hollowB: 16, flangeWear: 0.2, pose: { theta: 0.0012, dx: 0.3, dy: -0.4 }, noise: 0.015, seed: 101 },
      { uniform: 1.1, hollow: 0.7, hollowCx: -10, hollowB: 15, flangeWear: 0.3, pose: { theta: -0.0008, dx: -0.2, dy: -0.5 }, noise: 0.02, seed: 102 },
      { uniform: 0.9, hollow: 0.4, hollowCx: -14, hollowB: 17, flangeWear: 0.15, pose: { theta: 0.0006, dx: 0.1, dy: -0.3 }, noise: 0.012, seed: 103 },
      { uniform: 1.6, hollow: 1.1, hollowCx: -12, hollowB: 14, flangeWear: 0.5, pose: { theta: -0.0015, dx: -0.4, dy: -0.7 }, noise: 0.025, seed: 104 },
    ];
    return {
      id,
      label: '正常磨耗（四轮径差需配平）',
      description: '均匀磨耗叠加轻度凹磨；M1/M2 同轴径差接近限值，需联合进刀配平。',
      target: 'S1002',
      nominalDiameter: 840,
      wheels: mkWheels('S1002', specs, [2.6, 3.2, 2.2, 4.8]),
    };
  }

  if (id === 'eccentric') {
    const specs: WearSpec[] = [
      { uniform: 1.2, hollow: 1.6, hollowCx: -22, hollowB: 10, flangeWear: 1.4, pose: { theta: 0.002, dx: 0.5, dy: -0.6 }, noise: 0.05, seed: 201 },
      { uniform: 1.0, hollow: 1.2, hollowCx: -6, hollowB: 12, flangeWear: 0.8, pose: { theta: -0.001, dx: -0.3, dy: -0.4 }, noise: 0.04, seed: 202 },
      { uniform: 1.4, hollow: 1.9, hollowCx: -24, hollowB: 9, flangeWear: 1.6, pose: { theta: 0.0016, dx: 0.2, dy: -0.8 }, noise: 0.06, seed: 203 },
      { uniform: 1.2, hollow: 1.5, hollowCx: -8, hollowB: 11, flangeWear: 1.0, pose: { theta: -0.0022, dx: -0.5, dy: -0.5 }, noise: 0.045, seed: 204 },
    ];
    return {
      id,
      label: '偏磨 / 凹磨（形貌复杂）',
      description: '凹磨中心横向偏移且轮缘减薄，间隙多次变号；噪声偏高，结果带不确定度提示。',
      target: 'S1002',
      nominalDiameter: 840,
      wheels: mkWheels('S1002', specs, [2.8, 2.4, 3.4, 3.0]),
    };
  }

  // missing：T2 加工区间中部缺段
  const specs: WearSpec[] = [
    { uniform: 1.0, hollow: 0.5, hollowCx: -12, hollowB: 16, flangeWear: 0.2, pose: { theta: 0.001, dx: 0.3, dy: -0.4 }, noise: 0.02, seed: 301 },
    { uniform: 1.1, hollow: 0.6, hollowCx: -10, hollowB: 15, flangeWear: 0.3, pose: { theta: -0.001, dx: -0.2, dy: -0.5 }, noise: 0.02, seed: 302 },
    { uniform: 0.9, hollow: 0.4, hollowCx: -14, hollowB: 17, flangeWear: 0.1, pose: { theta: 0.001, dx: 0.1, dy: -0.3 }, noise: 0.02, seed: 303 },
    { uniform: 1.5, hollow: 0.9, hollowCx: -12, hollowB: 14, flangeWear: 0.4, pose: { theta: -0.001, dx: -0.4, dy: -0.6 }, noise: 0.03, seed: 304 },
  ];
  return {
    id,
    label: '缺测（T2 加工区间缺段，无解示例）',
    description: 'T2 在 x∈[-8,2] mm 有约 10 mm 缺段，搜索被阻断并指出控制车轮。',
    target: 'S1002',
    nominalDiameter: 840,
    wheels: mkWheels('S1002', specs, [2.6, 3.0, 2.2, 4.2], [-8, 2], 3),
  };
}

export const DEFAULT_SETTINGS = {
  datumBand: [28, 38] as [number, number],
  cutZone: [-40, 35] as [number, number],
  feedStep: 0.5,
  minDiameter: 830,
  axleDiffLimit: 1.0,
  bogieDiffLimit: 4.0,
  maxPointGap: 2.0,
  noiseWarnSigma: 0.06,
  nominalDiameter: 840,
};
