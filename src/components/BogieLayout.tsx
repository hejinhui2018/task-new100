import type { WheelPos } from '../lib/types';
import { AXLE_PAIRS, WHEEL_POS } from '../lib/types';
import type { PlannerStore } from '../state';
import { POS_COLOR } from './ProfileChart';

const W = 460;
const H = 250;

/** 俯视：两条轴（M 轴在上），每轴左右两轮；显示实测/镟后直径与径差 */
export function BogieLayout({ store }: { store: PlannerStore }) {
  const { computed, settings, selectedPos, setSelectedPos, plan, preview, currentAdopted } = store;
  const cuts =
    preview?.cuts ??
    (currentAdopted ? currentAdopted.candidate.cuts : null);

  const axleY: Record<string, number> = { M: 58, T: 178 };
  const wheelX = [70, W - 70];

  const fmt = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : '—');

  return (
    <div className="bogie">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="转向架轮对布局">
        {/* 构架 */}
        <rect x={34} y={36} width={W - 68} height={H - 64} rx={12} fill="none" stroke="var(--gridline)" strokeWidth={2} />
        <text x={W / 2} y={24} textAnchor="middle" fontSize={11} fill="var(--muted)">转向架俯视（M 一位端 / T 二位端）</text>

        {AXLE_PAIRS.map(([l, r]) => {
          const key = l[0];
          const y = axleY[key];
          const [pl, pr] = [l, r] as WheelPos[];
          const dl = computed[pl]?.input.rollingDiameter;
          const dr = computed[pr]?.input.rollingDiameter;
          const diff = dl != null && dr != null ? Math.abs(dl - dr) : NaN;
          const postDiff = plan.feasible && preview
            ? Math.abs(preview.postDiameters[pl] - preview.postDiameters[pr])
            : currentAdopted
              ? Math.abs(currentAdopted.candidate.postDiameters[pl] - currentAdopted.candidate.postDiameters[pr])
              : null;
          const over = Number.isFinite(diff) && diff > settings.axleDiffLimit;

          return (
            <g key={key}>
              {/* 轴 */}
              <line x1={wheelX[0]} x2={wheelX[1]} y1={y} y2={y} stroke="var(--axis)" strokeWidth={5} strokeLinecap="round" />
              <text x={W / 2} y={y - 12} textAnchor="middle" fontSize={10.5} fill={over ? 'var(--critical)' : 'var(--muted)'}>
                {key} 轴 实测径差 {fmt(diff)} mm{over ? `（>限值 ${settings.axleDiffLimit}）` : ''}
                {postDiff != null && ` → 镟后 ${postDiff.toFixed(2)}`}
              </text>
              <Wheel
                pos={pl}
                cx={wheelX[0]}
                cy={y}
                sel={selectedPos === pl}
                onClick={() => setSelectedPos(pl)}
                color={POS_COLOR[pl]}
                measured={dl}
                post={cuts ? cuts[pl] != null && computed[pl] ? computed[pl]!.input.rollingDiameter - 2 * (cuts[pl] + computed[pl]!.analysis.tapingY) : null : null}
                cut={cuts?.[pl] ?? null}
                fatal={!!computed[pl]?.fatal}
              />
              <Wheel
                pos={pr}
                cx={wheelX[1]}
                cy={y}
                sel={selectedPos === pr}
                onClick={() => setSelectedPos(pr)}
                color={POS_COLOR[pr]}
                measured={dr}
                post={cuts ? cuts[pr] != null && computed[pr] ? computed[pr]!.input.rollingDiameter - 2 * (cuts[pr] + computed[pr]!.analysis.tapingY) : null : null}
                cut={cuts?.[pr] ?? null}
                fatal={!!computed[pr]?.fatal}
              />
            </g>
          );
        })}

        {/* 转向架 spread 汇总 */}
        {(() => {
          const ds = WHEEL_POS.map((p) => computed[p]?.input.rollingDiameter).filter((v): v is number => v != null);
          const spread = ds.length === 4 ? Math.max(...ds) - Math.min(...ds) : NaN;
          const postSpread = preview
            ? preview.bogieSpread
            : currentAdopted
              ? currentAdopted.candidate.bogieSpread
              : null;
          const over = spread > settings.bogieDiffLimit;
          return (
            <text x={W / 2} y={H - 16} textAnchor="middle" fontSize={10.5} fill={over ? 'var(--critical)' : 'var(--muted)'}>
              转向架径差（max-min）实测 {fmt(spread)} mm（限值 {settings.bogieDiffLimit}）
              {postSpread != null && ` → 镟后 ${postSpread.toFixed(2)} mm`}
            </text>
          );
        })()}
      </svg>
    </div>
  );
}

function Wheel({
  pos,
  cx,
  cy,
  sel,
  onClick,
  color,
  measured,
  post,
  cut,
  fatal,
}: {
  pos: WheelPos;
  cx: number;
  cy: number;
  sel: boolean;
  onClick: () => void;
  color: string;
  measured?: number;
  post: number | null;
  cut: number | null;
  fatal: boolean;
}) {
  return (
    <g className="wheel-card" onClick={onClick}>
      <circle cx={cx} cy={cy} r={26} fill="var(--panel)" stroke={fatal ? 'var(--critical)' : color} strokeWidth={sel ? 3.4 : 2} />
      <text x={cx} y={cy - 5} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={color}>
        {pos}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize={8.5} fill="var(--muted)">
        {measured != null ? measured.toFixed(1) : '无数据'}
      </text>
      {cut != null && (
        <text x={cx} y={cy + 40} textAnchor="middle" fontSize={9.5} fill="var(--c-cut)" fontWeight={600}>
          r={cut.toFixed(1)} → {post?.toFixed(1)}
        </text>
      )}
      {fatal && <circle cx={cx + 20} cy={cy - 20} r={5} fill="var(--critical)" />}
    </g>
  );
}
