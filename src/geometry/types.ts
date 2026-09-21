/** 基本几何与领域类型 */

export interface Pt {
  /** 横向坐标 mm：轮缘侧为负、踏面外侧为正，原点为基准（taping）横向位置 */
  x: number;
  /** 径向坐标 mm：y 越大越靠近轮缘顶点（半径外侧）；镟修切深沿 -y */
  y: number;
}

/** 轮位：第 1/2 轴，左/右（面对钢轨方向约定） */
export type WheelPosition = 'A1L' | 'A1R' | 'A2L' | 'A2R';

export interface WheelInput {
  id: string;
  name: string;
  position: WheelPosition;
  /** 实测滚动圆直径 mm（基准点所在圆） */
  rollingDiameter: number;
  /** 原始测量坐标系中的基准点；对齐后映射到 (0,0) */
  datum: Pt;
  /** 实测横向轮廓点（原始坐标） */
  points: Pt[];
}

export type TargetId = 'LM' | 'LMA';

export interface PlanningConfig {
  target: TargetId;
  /** 目标型面单边公差带 ±tolerance mm */
  tolerance: number;
  /** 离散进给步进 mm（半径方向） */
  feedStep: number;
  /** 允许的最小轮径 mm */
  minDiameter: number;
  /** 同轴两轮直径差上限 mm */
  sameAxleLimit: number;
  /** 同一转向架四轮直径极差上限 mm */
  bogieLimit: number;
  /** 加工区间横向范围 mm */
  machineXmin: number;
  machineXmax: number;
}

export const DEFAULT_CONFIG: PlanningConfig = {
  target: 'LM',
  tolerance: 0.3,
  feedStep: 0.5,
  minDiameter: 826,
  sameAxleLimit: 0.5,
  bogieLimit: 2.0,
  machineXmin: -45,
  machineXmax: 34,
};

export const POSITION_META: Record<WheelPosition, { axle: 1 | 2; side: 'L' | 'R'; label: string }> = {
  A1L: { axle: 1, side: 'L', label: '1轴左' },
  A1R: { axle: 1, side: 'R', label: '1轴右' },
  A2L: { axle: 2, side: 'L', label: '2轴左' },
  A2R: { axle: 2, side: 'R', label: '2轴右' },
};
