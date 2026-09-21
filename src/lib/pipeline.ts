/** 单轮处理管线：校验 → 刚体对齐 → 切深/尺寸 →（由上层调用耦合搜索） */
import type {
  AlignResult,
  CutAnalysis,
  Notice,
  Pt,
  WheelInput,
  PlannerSettings,
} from './types';
import { checkProfile } from './validate';
import { alignToTarget, applyTransform, type Transform } from './align';
import { analyzeCutDepth } from './cut';
import { targetMetrics } from './metrics';

export interface WheelComputed {
  input: WheelInput;
  normalized: Pt[];
  aligned: Pt[];
  transform: Transform;
  alignResult: AlignResult;
  analysis: CutAnalysis;
  notices: Notice[];
  fatal: boolean;
}

export function processWheel(wheel: WheelInput, settings: PlannerSettings): WheelComputed {
  const checked = checkProfile(
    wheel.points,
    settings.cutZone,
    settings.maxPointGap,
    settings.noiseWarnSigma,
  );

  // 点数不足 / 完全无法规范化：兜底结果（搜索层会剔除）
  if (checked.points.length < 2) {
    return {
      input: wheel,
      normalized: [],
      aligned: [],
      transform: { theta: 0, dx: 0, dy: 0 },
      alignResult: { theta: 0, dx: 0, dy: 0, fitMad: NaN, bandPoints: 0, notices: [] },
      analysis: dummyAnalysis(wheel, checked.notices),
      notices: checked.notices,
      fatal: true,
    };
  }

  // 即使存在缺段/覆盖类致命错误，仍完成对齐与切深分析：缺段不参与约束、
  // 结果标记 unstable/致命，由搜索层剔除；这样界面上仍可看到下界与缺段位置。
  const align = alignToTarget(checked.points, settings.target, settings.datumBand);
  const thetaFatal = align.notices.some((n) => n.severity === 'error');
  const t: Transform = { theta: align.theta, dx: align.dx, dy: align.dy };
  const aligned = checked.points.map((p) => applyTransform(p, t));
  const notices = [...checked.notices, ...align.notices];

  const analysis = analyzeCutDepth(
    wheel,
    settings,
    aligned,
    t,
    align,
    targetMetrics(settings.target),
    notices,
  );

  return {
    input: wheel,
    normalized: checked.points,
    aligned,
    transform: t,
    alignResult: align,
    analysis,
    notices: analysis.notices,
    fatal: thetaFatal || analysis.notices.some((n) => n.severity === 'error'),
  };
}

function dummyAnalysis(wheel: WheelInput, notices: Notice[]): CutAnalysis {
  return {
    pos: wheel.pos,
    dMin: Infinity,
    dMax: -Infinity,
    tapingY: NaN,
    worstAt: { x: NaN, y: NaN },
    uncertainty: 0,
    crossings: 0,
    coverage: 0,
    missingSegs: [],
    align: { theta: 0, dx: 0, dy: 0, fitMad: NaN, bandPoints: 0, notices: [] },
    metrics: { sh: NaN, sd: NaN, qr: NaN, tapingX: 0 },
    postMetrics: { sh: NaN, sd: NaN, qr: NaN, tapingX: 0 },
    notices,
    unstable: true,
  };
}
