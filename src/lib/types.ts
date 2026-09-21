/** 领域类型定义：轮对镟修余量规划 */

/** 四个轮位：M1/M2 为一位轮对（同轴），T1/T2 为二位轮对；M、T 构成同一转向架 */
export type WheelPos = 'M1' | 'M2' | 'T1' | 'T2';
export const WHEEL_POS: WheelPos[] = ['M1', 'T1', 'T2', 'M2'];
/** 同轴配对（左/右） */
export const AXLE_PAIRS: Array<[WheelPos, WheelPos]> = [
  ['M1', 'M2'],
  ['T1', 'T2'],
];

export interface Pt {
  /** 横向坐标 mm：轮缘外侧（基准面方向）为负，踏面外侧为正；-70 为规距面，-10 为滚动圆（70mm 线） */
  x: number;
  /** 径向坐标 mm：相对于新形面滚动圆切线，向上（远离轮心）为正 */
  y: number;
}

export type TargetId = 'S1002' | 'LM';

/** 单个车轮的实测输入 */
export interface WheelInput {
  pos: WheelPos;
  /** 实测轮廓点（导入原始坐标，方向/点序待校验） */
  points: Pt[];
  /** 实测滚动圆直径 mm（测量仪读数） */
  rollingDiameter: number;
}

/** 公差与镟修约束设置 */
export interface PlannerSettings {
  target: TargetId;
  /** 基准（刚体对齐）踏面条带 x 区间 mm */
  datumBand: [number, number];
  /** 加工区间 x 范围 mm（求最小切深的横向范围，不含规距面直立段） */
  cutZone: [number, number];
  /** 离散进刀步长（半径方向）mm */
  feedStep: number;
  /** 允许最小轮径（镟后）mm */
  minDiameter: number;
  /** 同轴轮径差限值 mm */
  axleDiffLimit: number;
  /** 同一转向架轮径差限值（max-min）mm */
  bogieDiffLimit: number;
  /** 点距超过该值视为缺段 mm */
  maxPointGap: number;
  /** 噪声标准差告警阈值 mm */
  noiseWarnSigma: number;
  /** 新轮参考直径（形面名义滚动圆直径）mm */
  nominalDiameter: number;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Notice {
  severity: Severity;
  code: string;
  message: string;
  detail?: string;
}

/** 对齐结果（刚体：微转角 θ + 平移 dx,dy，实测→目标坐标系） */
export interface AlignResult {
  theta: number; // 弧度
  dx: number;
  dy: number;
  /** 基准带 Huber 拟合残差中位绝对值 mm */
  fitMad: number;
  /** 基准带有效点数 */
  bandPoints: number;
  notices: Notice[];
}

export interface FlangeMetrics {
  /** 轮缘高度 Sh：最高点相对滚动圆切线 */
  sh: number;
  /** 轮缘厚度 Sd：Sh=10 高度处距规距面 */
  sd: number;
  /** qR：y=2 与 y=9 两交点的横向距离 */
  qr: number;
  /** 滚动圆切线相对名义的横向位置（一般≈-10） */
  tapingX: number;
}

/** 单轮最小切深分析 */
export interface CutAnalysis {
  pos: WheelPos;
  /** 加工区间最小内切深（半径方向）mm */
  dMin: number;
  /** 受最小轮径限制的最大允许切深（半径方向）mm，Infinity 表示不受限 */
  dMax: number;
  /** 对齐后实测轮廓在滚动圆 x=-10 处的 y（负值表示踏面凹磨） */
  tapingY: number;
  /** 最大间隙出现位置 */
  worstAt: Pt;
  /** 原始点 vs 平滑点的最小切深差（不确定性指示）mm */
  uncertainty: number;
  /** 间隙曲线正负穿越次数（交叉复杂性） */
  crossings: number;
  /** 加工区间内有效覆盖率 0..1（缺段=1-覆盖） */
  coverage: number;
  /** 缺段区间（对齐坐标） */
  missingSegs: Array<[number, number]>;
  /** 原始→对齐变换 */
  align: AlignResult;
  /** 实测（对齐后）轮缘尺寸 */
  metrics: FlangeMetrics;
  /** 镟后轮缘尺寸（=目标名义值，径向平移不改变尺寸） */
  postMetrics: FlangeMetrics;
  notices: Notice[];
  /** 结果是否不稳定（缺段/噪声/异常交叉），为 true 时数值仅供参考 */
  unstable: boolean;
}

export interface Candidate {
  /** 各轮切深（半径 mm），相对对齐后目标的内移量 */
  cuts: Record<WheelPos, number>;
  /** 镟后滚动圆直径 mm */
  postDiameters: Record<WheelPos, number>;
  /** 同轴径差 mm */
  axleDiffs: Record<string, number>;
  /** 转向架最大径差 mm */
  bogieSpread: number;
  /** 总去除量（直径方向合计）mm */
  totalRemovedDiameter: number;
  /** 最大单轮切深（半径）mm */
  maxCut: number;
  /** 镟后最小剩余寿命径量（相对最小轮径）mm */
  minRemaining: number;
  /** 含不稳定轮（缺测/噪声）时为 true，方案仅作参考 */
  provisional: boolean;
}

export interface Infeasibility {
  constraint: 'minDiameter' | 'axleDiff' | 'bogieDiff' | 'noValidProfile' | 'searchSpace';
  /** 控制车轮 */
  controlling: WheelPos[];
  message: string;
  detail?: string;
}

export interface PlanResult {
  feasible: boolean;
  candidates: Candidate[];
  perWheel: Record<WheelPos, CutAnalysis | null>;
  infeasibility?: Infeasibility;
}

/** 已采用的方案快照 */
export interface AdoptedPlan {
  at: number;
  label: string;
  candidate: Candidate;
}
