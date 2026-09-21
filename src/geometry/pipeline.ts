import type { PlanningConfig, WheelInput } from './types';
import { targetProfile } from './profiles';
import { validateWheel, type Issue } from './validate';
import { alignToDatum } from './align';
import { flangeDimensions, type FlangeDimensions } from './dimensions';
import { machiningMinCut, type CutAnalysis } from './cut';
import { searchCandidates, type SearchResult, type WheelGeom } from './search';
import type { LinearProfile } from './interp';

export interface WheelReport {
  input: WheelInput;
  issues: Issue[];
  profile: LinearProfile | null;
  dims: FlangeDimensions | null;
  analysis: CutAnalysis | null;
}

export interface PlanReport {
  wheels: WheelReport[];
  search: SearchResult;
}

/** 单车：校验 → 基准对齐 → 尺寸 → 加工区间最小切深 */
export function analyzeWheel(input: WheelInput, cfg: PlanningConfig): WheelReport {
  const vr = validateWheel(input, { xmin: cfg.machineXmin, xmax: cfg.machineXmax });
  const errors = vr.issues.filter((i) => i.severity === 'error');
  if (errors.length || !vr.cleaned.length) {
    return { input, issues: vr.issues, profile: null, dims: null, analysis: null };
  }
  const { profile } = alignToDatum(input, vr.cleaned);
  const dims = flangeDimensions(profile);
  const target = targetProfile(cfg.target);
  const analysis = machiningMinCut(profile, target, cfg.machineXmin, cfg.machineXmax);
  return { input, issues: vr.issues, profile, dims, analysis };
}

/** 整车：四轮分析 + 联合离散搜索 */
export function planWheelset(inputs: WheelInput[], cfg: PlanningConfig): PlanReport {
  const wheels = inputs.map((w) => analyzeWheel(w, cfg));
  const target = targetProfile(cfg.target);
  const geoms: WheelGeom[] = wheels.map((r) => {
    const err = r.issues.find((i) => i.severity === 'error');
    return {
      id: r.input.id,
      name: r.input.name,
      position: r.input.position,
      rollingDiameter: r.input.rollingDiameter,
      measured: r.profile,
      analysis: r.analysis,
      invalidReason: err?.message,
    };
  });
  const search = searchCandidates(geoms, cfg, target);
  return { wheels, search };
}
