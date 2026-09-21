import type { PlanReport } from '../geometry/pipeline';
import type { Candidate } from '../geometry/search';
import type { AdoptedPlan } from '../state/store';
import type { PlanningConfig, WheelPosition } from '../geometry/types';
import { POSITION_META } from '../geometry/types';

const W = 620;
const H = 250;
const COLOR_VAR: Record<WheelPosition, string> = {
  A1L: '--s1',
  A1R: '--s2',
  A2L: '--s3',
  A2R: '--s4',
};

interface Props {
  plan: PlanReport;
  candidate: Candidate | null;
  adopted: AdoptedPlan | null;
  config: PlanningConfig;
}

interface WheelView {
  pos: WheelPosition;
  cx: number;
  cy: number;
  current: number;
  preview: number | null;
  minCut: number | null;
  valid: boolean;
}

export function WheelsetLayout({ plan, candidate, adopted, config }: Props) {
  const byPos = new Map(plan.wheels.map((r) => [r.input.position, r]));

  const previewByPos = new Map<string, number>();
  if (candidate) for (const w of candidate.wheels) previewByPos.set(w.position, w.finishedDiameter);
  const adoptedByPos = new Map<string, number>();
  if (adopted) for (const w of adopted.cuts) adoptedByPos.set(w.position, w.finishedDiameter);

  const axles: { y: number; idx: 1 | 2; left: WheelPosition; right: WheelPosition }[] = [
    { y: 78, idx: 1, left: 'A1L', right: 'A1R' },
    { y: 178, idx: 2, left: 'A2L', right: 'A2R' },
  ];

  const wheelViews: WheelView[] = [];
  for (const a of axles) {
    for (const [pos, cx] of [
      [a.left, 110],
      [a.right, 510],
    ] as [WheelPosition, number][]) {
      const r = byPos.get(pos);
      wheelViews.push({
        pos,
        cx,
        cy: a.y,
        current: r?.input.rollingDiameter ?? NaN,
        preview: previewByPos.get(pos) ?? adoptedByPos.get(pos) ?? null,
        minCut: r?.analysis?.feasible ? r.analysis!.minCutRadius : null,
        valid: !!r?.profile,
      });
    }
  }

  const fmt = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(1));

  function axleDiff(a: { left: WheelPosition; right: WheelPosition }): number | null {
    if (candidate) {
      const l = candidate.wheels.find((w) => w.position === a.left);
      const r = candidate.wheels.find((w) => w.position === a.right);
      return l && r ? Math.abs(l.finishedDiameter - r.finishedDiameter) : null;
    }
    const fl = adoptedByPos.get(a.left);
    const fr = adoptedByPos.get(a.right);
    if (fl !== undefined && fr !== undefined) return Math.abs(fl - fr);
    const l = byPos.get(a.left);
    const r = byPos.get(a.right);
    if (l?.analysis?.feasible && r?.analysis?.feasible) {
      return Math.abs(l.input.rollingDiameter - 2 * l.analysis!.minCutRadius - (r.input.rollingDiameter - 2 * r.analysis!.minCutRadius));
    }
    return null;
  }

  return (
    <svg className="bogie-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="转向架轮对布局与镟后直径">
      {/* 转向架框架 */}
      <rect x={70} y={42} width={480} height={172} rx={14} fill="none" stroke="var(--axis)" strokeWidth={1.4} strokeDasharray="6 4" />
      <text x={W / 2} y={30} textAnchor="middle" fontSize={11.5} fill="var(--muted)">转向架俯视（两轮轴 · 四车轮）</text>
      <text x={76} y={58} fontSize={10.5} fill="var(--muted)">← 左</text>
      <text x={544} y={58} textAnchor="end" fontSize={10.5} fill="var(--muted)">右 →</text>

      {axles.map((a) => {
        const diff = axleDiff(a);
        const ok = diff !== null && diff <= config.sameAxleLimit + 1e-9;
        return (
          <g key={a.idx}>
            {/* 轴 */}
            <line x1={110} y1={a.y} x2={510} y2={a.y} stroke="var(--ink-2)" strokeWidth={7} strokeLinecap="round" />
            <text x={62} y={a.y + 4} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--ink)">{a.idx}轴</text>
            {/* 同轴差标注 */}
            <g>
              <line x1={150} y1={a.y - 14} x2={470} y2={a.y - 14} stroke="var(--muted)" strokeWidth={0.9} />
              <text x={W / 2} y={a.y - 19} textAnchor="middle" fontSize={11} fill={ok ? 'var(--good-text)' : diff === null ? 'var(--muted)' : 'var(--critical)'} fontWeight={600}>
                同轴差 {fmt(diff)} / ≤{config.sameAxleLimit} mm {diff === null ? '' : ok ? '✓' : '✗'}
              </text>
            </g>
          </g>
        );
      })}

      {wheelViews.map((v) => {
        const color = `var(${COLOR_VAR[v.pos]})`;
        const label = POSITION_META[v.pos].label;
        const reduction = v.preview !== null ? v.current - v.preview : null;
        return (
          <g key={v.pos}>
            <circle cx={v.cx} cy={v.cy} r={22} fill="color-mix(in srgb, var(--surface-2) 60%, transparent)" stroke={v.valid ? color : 'var(--critical)'} strokeWidth={2.4} />
            {!v.valid && (
              <text x={v.cx} y={v.cy + 4} textAnchor="middle" fontSize={13} fill="var(--critical)" fontWeight={700}>!</text>
            )}
            {v.valid && (
              <text x={v.cx} y={v.cy + 4} textAnchor="middle" fontSize={10} fill={color} fontWeight={700}>
                {Math.round(v.minCut ?? 0) > 0 ? `d*${(v.minCut ?? 0).toFixed(1)}` : 'd*0'}
              </text>
            )}
            <text x={v.cx} y={v.cy + 40} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink)">{label}</text>
            <text x={v.cx} y={v.cy + 55} textAnchor="middle" fontSize={10.5} fill="var(--ink-2)">现径 {fmt(v.valid ? v.current : null)}</text>
            <text x={v.cx} y={v.cy + 69} textAnchor="middle" fontSize={10.5} fill={v.preview !== null ? color : 'var(--muted)'} fontWeight={v.preview !== null ? 700 : 400}>
              {v.preview !== null ? `镟后 ${fmt(v.preview)}（−${(reduction ?? 0).toFixed(1)}）` : '— 未选方案 —'}
            </text>
          </g>
        );
      })}

      {/* 转向架极差 */}
      {(() => {
        const previews = wheelViews.map((v) => v.preview).filter((v): v is number => v !== null);
        const spread = previews.length === 4 ? Math.max(...previews) - Math.min(...previews) : candidate ? candidate.bogieSpread : null;
        const ok = spread !== null && spread <= config.bogieLimit + 1e-9;
        return (
          <text x={W / 2} y={H - 6} textAnchor="middle" fontSize={11.5} fontWeight={600} fill={ok ? 'var(--good-text)' : spread === null ? 'var(--muted)' : 'var(--critical)'}>
            转向架镟后直径极差 {fmt(spread)} / ≤{config.bogieLimit} mm {spread === null ? '' : ok ? '✓' : '✗'}
          </text>
        );
      })()}
    </svg>
  );
}
