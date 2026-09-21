import { useMemo, useRef, useState } from 'react';
import type { LinearProfile } from '../geometry/interp';
import type { WheelReport } from '../geometry/pipeline';
import type { FlangeDimensions } from '../geometry/dimensions';

const W = 780;
const H = 380;
const M = { left: 46, right: 16, top: 26, bottom: 38 };
const X0 = -72;
const X1 = 44;
const Y0 = -4;
const Y1 = 29;

interface Props {
  report?: WheelReport;
  colorVar: string;
  target: LinearProfile;
  tolerance: number;
  machine: [number, number];
  /** 候选预览中该轮的半径切深 */
  previewCut?: number;
}

const sx = (x: number) => M.left + ((x - X0) / (X1 - X0)) * (W - M.left - M.right);
const sy = (y: number) => H - M.bottom - ((y - Y0) / (Y1 - Y0)) * (H - M.top - M.bottom);

function profilePath(p: LinearProfile, xmin?: number, xmax?: number, dy = 0): string {
  const lo = Math.max(p.xmin, xmin ?? -Infinity);
  const hi = Math.min(p.xmax, xmax ?? Infinity);
  let d = '';
  let first = true;
  for (let i = 0; i < p.xs.length; i++) {
    const x = p.xs[i];
    if (x < lo - 1e-9 || x > hi + 1e-9) continue;
    d += `${first ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(p.ys[i] + dy).toFixed(1)}`;
    first = false;
  }
  return d;
}

function bandPath(target: LinearProfile, tol: number): string {
  const xs = target.xs.filter((x) => x >= X0 && x <= X1);
  let upper = '';
  let lower = '';
  xs.forEach((x, i) => {
    const y = target.yAt(x);
    upper += `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(y + tol).toFixed(1)}`;
    lower = `L${sx(x).toFixed(1)},${sy(y - tol).toFixed(1)}` + lower;
  });
  return upper + lower + 'Z';
}

/**
 * 在区间内以 0.5mm 网格构造实测与目标(+dy)之间的填充区域。
 * mode='surplus'：实测高于目标（镟到该位置将去除的材料）；
 * mode='deficit'：目标高于实测（材料缺口/干涉，决定必须内移的切深）。
 */
function fillBetween(
  measured: LinearProfile,
  target: LinearProfile,
  xmin: number,
  xmax: number,
  dy: number,
  mode: 'surplus' | 'deficit',
): string {
  const step = 0.5;
  const upper: string[] = [];
  const lower: string[] = [];
  let n = 0;
  for (let x = xmin; x <= xmax + 1e-9; x += step) {
    const xx = Math.min(x, xmax);
    if (!measured.covers(xx)) continue;
    const ym = measured.yAt(xx);
    const yt = target.yAt(xx) + dy;
    const hit = mode === 'surplus' ? ym > yt + 1e-6 : yt > ym + 1e-6;
    if (!hit) continue;
    const hi = Math.max(ym, yt);
    const lo = Math.min(ym, yt);
    upper.push(`${upper.length === 0 ? 'M' : 'L'}${sx(xx).toFixed(1)},${sy(hi).toFixed(1)}`);
    lower.unshift(`L${sx(xx).toFixed(1)},${sy(lo).toFixed(1)}`);
    n++;
  }
  return n >= 2 ? upper.join('') + lower.join('') + 'Z' : '';
}

interface Hover {
  x: number;
  px: number;
}

export function ProfileChart({ report, colorVar, target, tolerance, machine, previewCut }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const measured = report?.profile ?? null;
  const analysis = report?.analysis ?? null;
  const dims: FlangeDimensions | null = report?.dims ?? null;

  const ticksX = useMemo(() => {
    const t: number[] = [];
    for (let x = -70; x <= 40; x += 10) t.push(x);
    return t;
  }, []);
  const ticksY = useMemo(() => {
    const t: number[] = [];
    for (let y = 0; y <= 25; y += 5) t.push(y);
    return t;
  }, []);

  const interferencePath = useMemo(
    () => (measured && analysis?.feasible ? fillBetween(measured, target, machine[0], machine[1], 0, 'deficit') : ''),
    [measured, analysis, target, machine],
  );
  const removedPath = useMemo(
    () => (measured && previewCut !== undefined ? fillBetween(measured, target, machine[0], machine[1], -previewCut, 'surplus') : ''),
    [measured, previewCut, target, machine],
  );

  function onMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const vx = ((e.clientX - rect.left) / rect.width) * W;
    const x = X0 + ((vx - M.left) / (W - M.left - M.right)) * (X1 - X0);
    setHover({ x, px: vx });
  }

  const hoverInfo = hover && measured && measured.covers(hover.x) && target.covers(hover.x)
    ? {
        x: hover.x,
        ym: measured.yAt(hover.x),
        yt: target.yAt(hover.x),
        int: target.yAt(hover.x) - measured.yAt(hover.x),
      }
    : null;

  return (
    <div className="chart-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="实测轮廓与目标型面对齐叠图">
        <defs>
          <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-2)" />
          </marker>
          <pattern id="hatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="color-mix(in srgb, var(--critical) 10%, transparent)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--critical)" strokeWidth="1.1" opacity="0.7" />
          </pattern>
        </defs>

        {/* 加工区间底色 */}
        <rect x={sx(machine[0])} y={M.top} width={sx(machine[1]) - sx(machine[0])} height={H - M.top - M.bottom} fill="var(--surface-2)" opacity={0.55} />

        {/* 网格 */}
        {ticksX.map((x) => (
          <g key={`gx${x}`}>
            <line x1={sx(x)} y1={M.top} x2={sx(x)} y2={H - M.bottom} stroke="var(--grid)" strokeWidth={1} />
            <text x={sx(x)} y={H - M.bottom + 15} textAnchor="middle" fontSize={10} fill="var(--muted)">{x}</text>
          </g>
        ))}
        {ticksY.map((y) => (
          <g key={`gy${y}`}>
            <line x1={M.left} y1={sy(y)} x2={W - M.right} y2={sy(y)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.left - 6} y={sy(y) + 3.5} textAnchor="end" fontSize={10} fill="var(--muted)">{y}</text>
          </g>
        ))}
        {/* 坐标轴 */}
        <line x1={M.left} y1={sy(0)} x2={W - M.right} y2={sy(0)} stroke="var(--axis)" strokeWidth={1.4} />
        <line x1={M.left} y1={M.top} x2={M.left} y2={H - M.bottom} stroke="var(--axis)" strokeWidth={1.4} />
        <text x={W - M.right} y={sy(0) - 5} textAnchor="end" fontSize={10} fill="var(--muted)">滚动圆基准 y=0</text>
        <text x={W - M.right} y={H - 8} textAnchor="end" fontSize={10} fill="var(--muted)">x / mm（←轮缘 踏面外侧→）</text>
        <text x={12} y={M.top + 4} fontSize={10} fill="var(--muted)">y/mm</text>

        {/* 内侧面 */}
        <line x1={sx(-70)} y1={M.top} x2={sx(-70)} y2={H - M.bottom} stroke="var(--ink-2)" strokeWidth={1.2} strokeDasharray="4 3" />
        <text x={sx(-70) + 3} y={M.top + 11} fontSize={10} fill="var(--ink-2)">内侧面</text>
        {/* 70mm 基准距 */}
        <line x1={sx(-70)} y1={sy(Y0 + 0.4)} x2={sx(0)} y2={sy(Y0 + 0.4)} stroke="var(--ink-2)" strokeWidth={1} markerStart="url(#arr)" markerEnd="url(#arr)" />
        <text x={(sx(-70) + sx(0)) / 2} y={sy(Y0 + 0.4) - 4} textAnchor="middle" fontSize={10} fill="var(--ink-2)">70 mm 基准距</text>

        {measured && (
          <>
            {/* 公差带 */}
            <path d={bandPath(target, tolerance)} fill="var(--s1)" opacity={0.13} stroke="none" />

            {/* 干涉区（恢复型面必须去掉的材料缺口：目标高于实测处） */}
            {interferencePath && <path d={interferencePath} fill="var(--critical)" opacity={0.22} />}

            {/* 候选预览：镟后目标位置 + 去除区 */}
            {previewCut !== undefined && (
              <>
                {removedPath && <path d={removedPath} fill="var(--s2)" opacity={0.3} />}
                <path d={profilePath(target, machine[0], machine[1], -previewCut)} fill="none" stroke={`var(${colorVar})`} strokeWidth={1.6} />
              </>
            )}

            {/* 目标型面（虚线） */}
            <path d={profilePath(target)} fill="none" stroke="var(--s7)" strokeWidth={1.6} strokeDasharray="6 3.5" />
            {/* 实测轮廓 */}
            <path d={profilePath(measured)} fill="none" stroke={`var(${colorVar})`} strokeWidth={2} />

            {/* 基准点 */}
            <circle cx={sx(0)} cy={sy(0)} r={3.2} fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.4} />

            {/* 控制点与最小切深标注 */}
            {analysis?.feasible && analysis.minCutRadius > 0 && (
              <g>
                <line x1={sx(analysis.governingX)} y1={sy(measured.yAt(analysis.governingX))} x2={sx(analysis.governingX)} y2={sy(target.yAt(analysis.governingX))} stroke="var(--critical)" strokeWidth={1.4} strokeDasharray="2 2" />
                <circle cx={sx(analysis.governingX)} cy={sy(target.yAt(analysis.governingX))} r={3} fill="var(--critical)" />
                <text x={sx(analysis.governingX) + 5} y={sy((measured.yAt(analysis.governingX) + target.yAt(analysis.governingX)) / 2)} fontSize={10.5} fontWeight={700} fill="var(--critical)">
                  d*={analysis.minCutRadius.toFixed(2)}
                </text>
              </g>
            )}

            {/* 交叉点 */}
            {analysis?.crossingXs.map((x, i) => (
              <circle key={i} cx={sx(x)} cy={sy(target.yAt(x))} r={3.4} fill="var(--surface)" stroke="var(--warning)" strokeWidth={1.8} />
            ))}

            {/* 缺测段 */}
            {analysis?.uncovered.map((u, i) => (
              <rect key={i} x={sx(Math.max(u.from, X0))} y={M.top} width={Math.max(2, sx(Math.min(u.to, X1)) - sx(Math.max(u.from, X0)))} height={H - M.top - M.bottom} fill="url(#hatch)" opacity={0.9} />
            ))}
            {!analysis?.feasible && report?.issues.filter((i) => i.severity === 'error').map((iss, i) => {
              const det = iss.detail as { from?: number; to?: number } | undefined;
              if (iss.code !== 'gap' || !det) return null;
              return (
                <rect key={`g${i}`} x={sx(det.from!)} y={M.top} width={Math.max(2, sx(det.to!) - sx(det.from!))} height={H - M.top - M.bottom} fill="url(#hatch)" opacity={0.9} />
              );
            })}

            {/* 尺寸标注 Sh / Sd / qR */}
            {dims && Number.isFinite(dims.yTip) && (
              <g>
                <line x1={M.left + 4} y1={sy(0)} x2={M.left + 4} y2={sy(dims.yTip)} stroke="var(--ink-2)" strokeWidth={1} markerStart="url(#arr)" markerEnd="url(#arr)" />
                <text x={M.left + 8} y={sy(dims.yTip / 2) + 3} fontSize={10.5} fill="var(--ink-2)" fontWeight={600}>Sh {dims.Sh.toFixed(1)}</text>
                {Number.isFinite(dims.xAt10) && (
                  <g>
                    <line x1={sx(-70)} y1={sy(dims.yTip - 10)} x2={sx(dims.xAt10)} y2={sy(dims.yTip - 10)} stroke="var(--ink-2)" strokeWidth={1} markerStart="url(#arr)" markerEnd="url(#arr)" />
                    <text x={(sx(-70) + sx(dims.xAt10)) / 2} y={sy(dims.yTip - 10) - 4} textAnchor="middle" fontSize={10.5} fill="var(--ink-2)" fontWeight={600}>Sd {dims.Sd.toFixed(1)}</text>
                  </g>
                )}
                {dims.valid && (
                  <g>
                    <line x1={sx(dims.xAt2)} y1={sy(dims.yTip - 2)} x2={sx(dims.xAt10)} y2={sy(dims.yTip - 10)} stroke="var(--s5, #e87ba4)" strokeWidth={2.2} />
                    <circle cx={sx(dims.xAt2)} cy={sy(dims.yTip - 2)} r={2.4} fill="var(--s5, #e87ba4)" />
                    <circle cx={sx(dims.xAt10)} cy={sy(dims.yTip - 10)} r={2.4} fill="var(--s5, #e87ba4)" />
                    <text x={sx((dims.xAt2 + dims.xAt10) / 2) - 6} y={sy((dims.yTip - 2 + dims.yTip - 10) / 2) - 5} fontSize={10.5} fontWeight={700} fill="var(--s5, #e87ba4)">qR {dims.qR.toFixed(1)}</text>
                  </g>
                )}
              </g>
            )}

            {/* 悬停十字线 */}
            {hoverInfo && (
              <g pointerEvents="none">
                <line x1={sx(hoverInfo.x)} y1={M.top} x2={sx(hoverInfo.x)} y2={H - M.bottom} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
                <circle cx={sx(hoverInfo.x)} cy={sy(hoverInfo.ym)} r={3} fill={`var(${colorVar})`} stroke="var(--surface)" strokeWidth={1.2} />
                <circle cx={sx(hoverInfo.x)} cy={sy(hoverInfo.yt)} r={3} fill="var(--s7)" stroke="var(--surface)" strokeWidth={1.2} />
              </g>
            )}
          </>
        )}

        {!measured && (
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={13} fill="var(--muted)">
            {report ? '该轮校验未通过，无法对齐成图（见下方问题清单）' : '请导入或选择示例车轮'}
          </text>
        )}

        {/* 鼠标捕获层 */}
        <rect x={M.left} y={M.top} width={W - M.left - M.right} height={H - M.top - M.bottom} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>

      {hoverInfo && (
        <div className="tooltip" style={{ left: `${(sx(hoverInfo.x) / W) * 100}%`, top: 8 }}>
          x=<b>{hoverInfo.x.toFixed(1)}</b> mm　实测 y=<b>{hoverInfo.ym.toFixed(2)}</b>　目标 y=<b>{hoverInfo.yt.toFixed(2)}</b>
          <br />
          过盈 t−m=<b style={{ color: hoverInfo.int > 0 ? 'var(--critical)' : 'var(--good-text)' }}>{hoverInfo.int >= 0 ? '+' : ''}{hoverInfo.int.toFixed(2)}</b> mm
        </div>
      )}
    </div>
  );
}
