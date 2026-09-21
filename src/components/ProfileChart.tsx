import { useMemo, useRef, useState } from 'react';
import type { Pt, WheelPos } from '../lib/types';
import { sampleTarget, GAUGE_X, TAPING_X } from '../lib/profiles';
import { crossingsAtY } from '../lib/geom';
import { gapCurve } from '../lib/cut';
import type { PlannerStore } from '../state';

export const POS_COLOR: Record<WheelPos, string> = {
  M1: 'var(--c-m1)',
  M2: 'var(--c-m2)',
  T1: 'var(--c-t1)',
  T2: 'var(--c-t2)',
};

const W = 820;
const H = 430;
const M = { l: 46, r: 14, t: 14, b: 30 };
const X0 = -68;
const X1 = 42;
const Y0 = -9;
const Y1 = 33;

const sx = (x: number) => M.l + ((x - X0) / (X1 - X0)) * (W - M.l - M.r);
const sy = (y: number) => H - M.b - ((y - Y0) / (Y1 - Y0)) * (H - M.t - M.b);

function pathFrom(points: Pt[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
    .join(' ');
}

interface Props {
  store: PlannerStore;
}

export function ProfileChart({ store }: Props) {
  const { computed, settings, selectedPos, preview, currentAdopted } = store;
  const cw = computed[selectedPos];
  const svgRef = useRef<SVGSVGElement>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number; mx: number } | null>(null);

  const targetPts = useMemo(() => sampleTarget(settings.target, 0.25), [settings.target]);
  const cutD = preview
    ? preview.cuts[selectedPos]
    : currentAdopted
      ? currentAdopted.candidate.cuts[selectedPos]
      : null;

  const gap = useMemo(
    () => (cw ? gapCurve(cw.aligned, settings) : []),
    [cw, settings],
  );

  if (!cw) {
    return <div className="muted" style={{ padding: 24 }}>该轮位暂无轮廓数据，请导入或切换示例。</div>;
  }

  const a = cw.analysis;
  const aligned = cw.aligned;
  const targetPath = pathFrom(targetPts);
  const measuredPath = pathFrom(aligned);
  const cutPath = cutD != null ? pathFrom(targetPts.map((p) => ({ x: p.x, y: p.y - cutD }))) : null;

  const x10 = crossingsAtY(aligned, 10);
  const x9 = crossingsAtY(aligned, 9);
  const x2 = crossingsAtY(aligned, 2);
  const flangeTop = aligned.reduce((m, p) => (p.y > m.y ? p : m), aligned[0]);
  const treadY = Number.isFinite(a.tapingY) ? a.tapingY : 0;

  const xTicks: number[] = [-60, -40, -20, 0, 20, 40];
  const yTicks: number[] = [-5, 0, 5, 10, 15, 20, 25, 30];

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const mx = X0 + ((px - M.l) / (W - M.l - M.r)) * (X1 - X0);
    if (mx >= X0 && mx <= X1) setMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top, mx });
  };

  // 光标处数值
  let tip: { ym: number; yt: number; g: number } | null = null;
  if (mouse) {
    const i = aligned.findIndex((p) => p.x >= mouse.mx);
    if (i > 0) {
      const p0 = aligned[i - 1];
      const p1 = aligned[i];
      const t = (mouse.mx - p0.x) / (p1.x - p0.x);
      if (t >= 0 && t <= 1 && p1.x - p0.x <= settings.maxPointGap) {
        const ym = p0.y + t * (p1.y - p0.y);
        const yt = targetPts.find((p) => p.x >= mouse.mx);
        const ytv = interpolate(targetPts, mouse.mx);
        tip = { ym, yt: yt ? ytv : NaN, g: ytv - ym };
      }
    }
  }

  return (
    <div className="chart-wrap">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${selectedPos} 轮廓叠图`}
        onMouseMove={onMove}
        onMouseLeave={() => setMouse(null)}
      >
        {/* 网格 */}
        {yTicks.map((y) => (
          <g key={`y${y}`}>
            <line x1={M.l} x2={W - M.r} y1={sy(y)} y2={sy(y)} stroke="var(--gridline)" strokeWidth={1} />
            <text x={M.l - 6} y={sy(y) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">
              {y}
            </text>
          </g>
        ))}
        {xTicks.map((x) => (
          <g key={`x${x}`}>
            <line x1={sx(x)} x2={sx(x)} y1={M.t} y2={H - M.b} stroke="var(--gridline)" strokeWidth={1} />
            <text x={sx(x)} y={H - M.b + 16} textAnchor="middle" fontSize={10} fill="var(--muted)">
              {x}
            </text>
          </g>
        ))}
        <text x={M.l - 34} y={M.t + 4} fontSize={10} fill="var(--muted)">y mm</text>
        <text x={W - M.r - 30} y={H - 6} fontSize={10} fill="var(--muted)">x mm（横向）</text>

        {/* 加工区间 */}
        <rect
          x={sx(settings.cutZone[0])}
          y={M.t}
          width={sx(settings.cutZone[1]) - sx(settings.cutZone[0])}
          height={H - M.t - M.b}
          fill="var(--cutzne-shade)"
        />
        {/* 基准带 */}
        <rect
          x={sx(settings.datumBand[0])}
          y={M.t}
          width={sx(settings.datumBand[1]) - sx(settings.datumBand[0])}
          height={H - M.t - M.b}
          fill="var(--band-shade)"
        />
        <text x={(sx(settings.datumBand[0]) + sx(settings.datumBand[1])) / 2} y={M.t + 11} textAnchor="middle" fontSize={9.5} fill="var(--info)">
          基准带
        </text>

        {/* 规距面 / 滚动圆刻线 */}
        <line x1={sx(GAUGE_X)} x2={sx(GAUGE_X)} y1={M.t} y2={H - M.b} stroke="var(--axis)" strokeDasharray="4 3" />
        <text x={sx(GAUGE_X) + 3} y={H - M.b - 4} fontSize={9.5} fill="var(--muted)">规距面 -70</text>
        <line x1={sx(TAPING_X)} x2={sx(TAPING_X)} y1={M.t} y2={H - M.b} stroke="var(--axis)" strokeDasharray="2 3" />

        {/* y=2/9/10 切面辅助线 */}
        {[2, 9, 10].map((y) => (
          <line key={y} x1={M.l} x2={W - M.r} y1={sy(y)} y2={sy(y)} stroke="var(--gridline)" strokeDasharray="5 4" />
        ))}

        {/* 缺段影线 */}
        <defs>
          <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="7" height="7" fill="var(--gap-hatch)" />
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--critical)" strokeWidth="1.4" opacity="0.55" />
          </pattern>
        </defs>
        {a.missingSegs.map(([u, v], i) => (
          <rect
            key={i}
            x={sx(u)}
            y={M.t}
            width={Math.max(1, sx(v) - sx(u))}
            height={H - M.t - M.b}
            fill="url(#hatch)"
          />
        ))}

        {/* 目标型面 */}
        <path d={targetPath} fill="none" stroke="var(--c-target)" strokeWidth={2} />
        {/* 实测 */}
        <path d={measuredPath} fill="none" stroke={POS_COLOR[selectedPos]} strokeWidth={1.6} />
        {/* 候选镟后型面（目标 -d） */}
        {cutPath && (
          <path d={cutPath} fill="none" stroke="var(--c-cut)" strokeWidth={1.8} strokeDasharray="6 3" />
        )}

        {/* 控制点 */}
        {Number.isFinite(a.worstAt.x) && (
          <g>
            <circle cx={sx(a.worstAt.x)} cy={sy(a.worstAt.y)} r={4} fill="none" stroke="var(--critical)" strokeWidth={1.6} />
            <line
              x1={sx(a.worstAt.x)}
              x2={sx(a.worstAt.x)}
              y1={sy(a.worstAt.y)}
              y2={sy(a.worstAt.y + a.dMin)}
              stroke="var(--critical)"
              strokeWidth={1.2}
            />
            <text x={sx(a.worstAt.x) + 6} y={sy(a.worstAt.y + a.dMin / 2)} fontSize={10.5} fill="var(--critical)">
              dMin {a.dMin.toFixed(2)}
            </text>
          </g>
        )}

        {/* Sh 标注 */}
        {Number.isFinite(a.metrics.sh) && (
          <g>
            <line x1={sx(flangeTop.x) - 8} x2={sx(flangeTop.x) - 8} y1={sy(flangeTop.y)} y2={sy(treadY)} stroke="var(--c-t2)" strokeWidth={1.4} />
            <line x1={sx(flangeTop.x) - 12} x2={sx(flangeTop.x) - 4} y1={sy(flangeTop.y)} y2={sy(flangeTop.y)} stroke="var(--c-t2)" />
            <line x1={sx(flangeTop.x) - 12} x2={sx(flangeTop.x) - 4} y1={sy(treadY)} y2={sy(treadY)} stroke="var(--c-t2)" />
            <text x={sx(flangeTop.x) - 14} y={sy((flangeTop.y + treadY) / 2)} textAnchor="end" fontSize={11} fill="var(--c-t2)" fontWeight={600}>
              Sh {a.metrics.sh.toFixed(1)}
            </text>
          </g>
        )}

        {/* Sd 标注（y=10，规距面→交点） */}
        {x10.length > 0 && Number.isFinite(a.metrics.sd) && (
          <g>
            <line x1={sx(GAUGE_X)} x2={sx(x10[x10.length - 1])} y1={sy(10) - 7} y2={sy(10) - 7} stroke="var(--c-m1)" strokeWidth={1.4} />
            <text x={(sx(GAUGE_X) + sx(x10[x10.length - 1])) / 2} y={sy(10) - 11} textAnchor="middle" fontSize={11} fill="var(--c-m1)" fontWeight={600}>
              Sd {a.metrics.sd.toFixed(1)}
            </text>
            <circle cx={sx(x10[x10.length - 1])} cy={sy(10)} r={2.6} fill="var(--c-m1)" />
          </g>
        )}

        {/* qR 段加粗 */}
        {x2.length > 0 && x9.length > 0 &&
          (() => {
            const xa = Math.min(x2[x2.length - 1], x9[x9.length - 1]);
            const xb = Math.max(x2[x2.length - 1], x9[x9.length - 1]);
            const segs: string[] = [];
            for (let i = 0; i < aligned.length - 1; i++) {
              const p = aligned[i];
              const q = aligned[i + 1];
              const mx = (p.x + q.x) / 2;
              const my = (p.y + q.y) / 2;
              if (mx >= xa && mx <= xb && my >= 2 && my <= 9) {
                segs.push(`M${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}L${sx(q.x).toFixed(1)},${sy(q.y).toFixed(1)}`);
              }
            }
            return (
              <g>
                <path d={segs.join(' ')} fill="none" stroke="var(--c-m2)" strokeWidth={4.2} opacity={0.55} strokeLinecap="round" />
                <text x={sx(xb) + 5} y={sy(5.5)} fontSize={11} fill="var(--good-text)" fontWeight={600}>
                  qR {Number.isFinite(a.metrics.qr) ? a.metrics.qr.toFixed(1) : '—'}
                </text>
              </g>
            );
          })()}

        {/* 十字光标 */}
        {mouse && tip && (
          <g>
            <line x1={sx(mouse.mx)} x2={sx(mouse.mx)} y1={M.t} y2={H - M.b} stroke="var(--muted)" strokeDasharray="3 3" strokeWidth={0.8} />
            <circle cx={sx(mouse.mx)} cy={sy(tip.ym)} r={3} fill={POS_COLOR[selectedPos]} />
          </g>
        )}

        {/* 坐标轴 */}
        <line x1={M.l} x2={W - M.r} y1={sy(0)} y2={sy(0)} stroke="var(--axis)" strokeWidth={1.2} />
        <line x1={M.l} x2={M.l} y1={M.t} y2={H - M.b} stroke="var(--axis)" strokeWidth={1.2} />
      </svg>

      {mouse && tip && (
        <div className="tt" style={{ left: mouse.x, top: mouse.y }}>
          <span className="k">x=</span>{mouse.mx.toFixed(1)}&nbsp;
          <span className="k">实测 y=</span>{tip.ym.toFixed(2)}&nbsp;
          <span className="k">目标 y=</span>{tip.yt.toFixed(2)}&nbsp;
          <span className="k">间隙=</span>
          <b style={{ color: tip.g > 0 ? 'var(--critical)' : 'var(--good-text)' }}>{tip.g.toFixed(2)}</b>
        </div>
      )}

      <GapStrip gap={gap} />
    </div>
  );
}

function interpolate(pts: Pt[], x: number): number {
  let i = 0;
  while (i < pts.length - 2 && pts[i + 1].x < x) i++;
  const a = pts[i];
  const b = pts[Math.min(i + 1, pts.length - 1)];
  const t = (x - a.x) / (b.x - a.x);
  return a.y + t * (b.y - a.y);
}

function GapStrip({ gap }: { gap: Array<{ x: number; g: number | null }> }) {
  const GW = 820;
  const GH = 86;
  const gm = { l: 46, r: 14, t: 8, b: 20 };
  const g0 = -6;
  const g1 = 6;
  const gsx = (x: number) => gm.l + ((x - X0) / (X1 - X0)) * (GW - gm.l - gm.r);
  const gsy = (g: number) => GH - gm.b - ((g - g0) / (g1 - g0)) * (GH - gm.t - gm.b);

  const valid = gap.filter((s) => s.g != null) as Array<{ x: number; g: number }>;
  const d =
    valid.length > 1
      ? valid.map((s, i) => `${i === 0 ? 'M' : 'L'}${gsx(s.x).toFixed(1)},${gsy(s.g).toFixed(1)}`).join(' ')
      : '';
  const maxG = valid.reduce((m, s) => Math.max(m, s.g), 0);

  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} style={{ marginTop: 2 }} aria-label="间隙曲线">
      <rect x={gm.l} y={gm.t} width={GW - gm.l - gm.r} height={GH - gm.t - gm.b} fill="var(--surface-1)" stroke="var(--border)" />
      <line x1={gm.l} x2={GW - gm.r} y1={gsy(0)} y2={gsy(0)} stroke="var(--axis)" />
      {[-4, -2, 0, 2, 4].map((g) => (
        <g key={g}>
          <line x1={gm.l} x2={GW - gm.r} y1={gsy(g)} y2={gsy(g)} stroke="var(--gridline)" strokeDasharray="3 3" />
          <text x={gm.l - 5} y={gsy(g) + 3} textAnchor="end" fontSize={9} fill="var(--muted)">{g}</text>
        </g>
      ))}
      {d && <path d={d} fill="none" stroke="var(--c-m1)" strokeWidth={1.5} />}
      {/* 正间隙区填充 */}
      {d && (
        <path
          d={`${d} L${gsx(valid[valid.length - 1].x)},${gsy(0)} L${gsx(valid[0].x)},${gsy(0)} Z`}
          fill="var(--c-cut)"
          opacity={0.12}
        />
      )}
      <text x={gm.l + 6} y={gm.t + 11} fontSize={9.5} fill="var(--muted)">
        间隙 g=T−M（正=需去料）；加工区间内最大 {maxG.toFixed(2)} mm
      </text>
      <text x={GW - gm.r - 4} y={GH - 5} textAnchor="end" fontSize={9} fill="var(--muted)">x mm</text>
    </svg>
  );
}
