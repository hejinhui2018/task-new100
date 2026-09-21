import type { Pt, WheelInput, WheelPosition } from './types';
import { targetProfile } from './profiles';
import { buildLinear } from './interp';

/**
 * 内置示例：以 LM 新轮型面为底，叠加物理上合理的磨耗场生成“实测点”。
 * 磨耗使材料外移量减少：measured.y = target.y − wear(x)。
 * 所有点再整体平移到一个虚拟测量坐标系（基准非原点），以同时演示基准对齐。
 */

const RAW_OFFSET: Pt = { x: 137.5, y: 412.8 };
const NOMINAL_D = 840;

// 可复现的轻量伪随机（LCG），示例不依赖 Math.random
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const gauss = (rng: () => number) => {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export interface WearSpec {
  /** 踏面凹磨深度（中心附近） */
  hollowDepth: number;
  hollowCenter?: number;
  hollowWidth?: number;
  /** 轮缘喉/外侧磨耗深度（轮缘磨薄） */
  flangeWear: number;
  flangeCenter?: number;
  flangeWidth?: number;
  /** 测量噪声标准差 mm */
  noise?: number;
  seed?: number;
  /** 缺测区间（对齐坐标） */
  gap?: { from: number; to: number };
}

const lm = targetProfile('LM');
const full = buildLinear(lm.xs.map((x, i) => ({ x, y: lm.ys[i] })));

function wearAt(x: number, spec: WearSpec): number {
  const c = spec.hollowCenter ?? -2;
  const w = spec.hollowWidth ?? 16;
  const hollow = spec.hollowDepth * Math.exp(-(((x - c) / w) ** 2));
  const fc = spec.flangeCenter ?? -38;
  const fw = spec.flangeWidth ?? 4.5;
  const flange = spec.flangeWear * Math.exp(-(((x - fc) / fw) ** 2));
  // 轮缘顶平台不参与磨耗（接触不到钢轨），快速衰减
  const tipShield = x < -47 ? 0 : 1;
  return (hollow + flange) * tipShield;
}

export function buildMeasuredWheel(
  id: string,
  name: string,
  position: WheelPosition,
  spec: WearSpec,
): WheelInput {
  const rng = makeRng(spec.seed ?? hash0(id));
  const noiseSigma = spec.noise ?? 0.015;
  const pts: Pt[] = [];
  for (let x = -55; x <= 42 + 1e-9; x += 1) {
    if (spec.gap && x >= spec.gap.from && x <= spec.gap.to) continue;
    const w = wearAt(x, spec);
    const yAligned = full.yAt(x) - w + gauss(rng) * noiseSigma;
    pts.push({ x: x + RAW_OFFSET.x, y: yAligned + RAW_OFFSET.y });
  }
  const wearAt0 = wearAt(0, spec);
  return {
    id,
    name,
    position,
    rollingDiameter: +(NOMINAL_D - 2 * wearAt0).toFixed(2),
    datum: { ...RAW_OFFSET },
    points: pts,
  };
}

function hash0(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type ExampleKind = 'normal' | 'partial' | 'gap';

export function buildExampleSet(kind: ExampleKind): WheelInput[] {
  if (kind === 'normal') {
    // 正常磨耗：踏面凹磨 1.3~2.2 mm，轮缘基本完好；四轮直径差要求联合抬刀协调
    return [
      buildMeasuredWheel('w1', '1轴左 (A1L)', 'A1L', { hollowDepth: 1.5, flangeWear: 0.1, seed: 11 }),
      buildMeasuredWheel('w2', '1轴右 (A1R)', 'A1R', { hollowDepth: 1.9, flangeWear: 0.15, seed: 22 }),
      buildMeasuredWheel('w3', '2轴左 (A2L)', 'A2L', { hollowDepth: 1.2, flangeWear: 0.05, seed: 33 }),
      buildMeasuredWheel('w4', '2轴右 (A2R)', 'A2R', { hollowDepth: 2.1, flangeWear: 0.2, seed: 44 }),
    ];
  }
  if (kind === 'partial') {
    // 偏磨/轮缘偏磨：1轴右轮缘喉磨耗 5.5 mm，恢复型面需深切，越过最小轮径
    // 其余三轮轻微磨耗——最小轮径直接冲突，用于演示无解诊断与控制轮定位
    return [
      buildMeasuredWheel('w1', '1轴左 (A1L)', 'A1L', { hollowDepth: 1.3, flangeWear: 0.1, seed: 11 }),
      buildMeasuredWheel('w2', '1轴右 (A1R) 偏磨', 'A1R', { hollowDepth: 2.0, flangeWear: 5.5, seed: 22 }),
      buildMeasuredWheel('w3', '2轴左 (A2L)', 'A2L', { hollowDepth: 1.4, flangeWear: 0.1, seed: 33 }),
      buildMeasuredWheel('w4', '2轴右 (A2R)', 'A2R', { hollowDepth: 1.6, flangeWear: 0.1, seed: 44 }),
    ];
  }
  // 缺测：1轴右在喉弧-弧底区间缺一段（导出/遮挡），校验必须拦截、搜索拒绝硬凑
  return [
    buildMeasuredWheel('w1', '1轴左 (A1L)', 'A1L', { hollowDepth: 1.5, flangeWear: 0.1, seed: 11 }),
    buildMeasuredWheel('w2', '1轴右 (A1R) 缺测', 'A1R', {
      hollowDepth: 1.8,
      flangeWear: 0.15,
      seed: 22,
      gap: { from: -30, to: -26 },
    }),
    buildMeasuredWheel('w3', '2轴左 (A2L)', 'A2L', { hollowDepth: 1.2, flangeWear: 0.05, seed: 33 }),
    buildMeasuredWheel('w4', '2轴右 (A2R)', 'A2R', { hollowDepth: 2.0, flangeWear: 0.2, seed: 44 }),
  ];
}
