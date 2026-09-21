import type { WheelPos } from '../lib/types';
import { TARGETS } from '../lib/profiles';
import type { PlannerStore } from '../state';
import { POS_COLOR } from './ProfileChart';

function fmt(v: number, d = 1): string {
  return Number.isFinite(v) ? v.toFixed(d) : '—';
}

export function MetricsPanel({ store }: { store: PlannerStore }) {
  const { computed, selectedPos, settings, preview, currentAdopted } = store;
  const cw = computed[selectedPos];
  const nominal = TARGETS[settings.target];

  const cut =
    preview?.cuts[selectedPos] ??
    currentAdopted?.candidate.cuts[selectedPos] ??
    null;

  if (!cw) return null;
  const a = cw.analysis;
  const postD =
    cut != null && Number.isFinite(a.tapingY)
      ? cw.input.rollingDiameter - 2 * (cut + a.tapingY)
      : null;

  const sdDev = Number.isFinite(a.metrics.sd) ? a.metrics.sd - nominal.nominalSd : NaN;
  const shDev = Number.isFinite(a.metrics.sh) ? a.metrics.sh - nominal.nominalSh : NaN;
  const qrDev = Number.isFinite(a.metrics.qr) ? a.metrics.qr - nominal.nominalQr : NaN;

  const cls = (dev: number, tol = 1.0) =>
    !Number.isFinite(dev) ? '' : Math.abs(dev) > tol ? 'bad' : Math.abs(dev) > 0.5 ? 'warn' : '';

  return (
    <div>
      <div className="metric-row">
        <Card
          label="实测直径 D"
          value={`${cw.input.rollingDiameter.toFixed(1)}`}
          unit="mm"
          delta={postD != null ? `镟后 ${postD.toFixed(1)}（限 ${settings.minDiameter}）` : `最小轮径限 ${settings.minDiameter}`}
          valueClass={postD != null && postD < settings.minDiameter ? 'bad' : ''}
        />
        <Card
          label={`最小切深 dMin（半径）${a.unstable ? '⚠' : ''}`}
          value={fmt(a.dMin, 2)}
          unit="mm"
          delta={Number.isFinite(a.dMax) ? `允许上限 ${a.dMax.toFixed(2)}` : '—'}
          valueClass={a.dMax < a.dMin ? 'bad' : ''}
        />
        <Card label="轮缘高 Sh" value={fmt(a.metrics.sh)} unit="mm" delta={`名义 ${nominal.nominalSh}（偏差 ${fmt(shDev)}）`} valueClass={cls(shDev, 1.5)} />
        <Card label="轮缘厚 Sd" value={fmt(a.metrics.sd)} unit="mm" delta={`名义 ${nominal.nominalSd}（偏差 ${fmt(sdDev)}）`} valueClass={cls(sdDev, 1.5)} />
      </div>
      <div className="metric-row" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Card label="qR 弧长" value={fmt(a.metrics.qr)} unit="mm" delta={`名义 ${nominal.nominalQr}（偏差 ${fmt(qrDev)}）`} valueClass={cls(qrDev, 1.2)} />
        <Card label="覆盖率" value={`${(a.coverage * 100).toFixed(0)}%`} unit="" delta={`${a.missingSegs.length} 段缺测`} valueClass={a.coverage < 1 ? 'bad' : ''} />
        <Card label="间隙变号" value={`${a.crossings}`} unit="次" delta="交叉复杂性" valueClass={a.crossings >= 3 ? 'warn' : ''} />
        <Card label="结果不确定度" value={fmt(a.uncertainty, 3)} unit="mm" delta="原始 vs 平滑" valueClass={a.uncertainty > 0.1 ? 'bad' : a.uncertainty > 0.03 ? 'warn' : ''} />
      </div>
      <p className="muted" style={{ margin: '6px 2px 0', fontSize: 11.5 }}>
        所选车轮：
        <span style={{ color: POS_COLOR[selectedPos as WheelPos], fontWeight: 700 }}> {selectedPos}</span>
        ；尺寸由水平切面与型线的真实交点计算（y=10 测 Sd，y=2/9 间弧长测 qR），镟后径向平移恢复名义型面。
      </p>
    </div>
  );
}

function Card({
  label,
  value,
  unit,
  delta,
  valueClass,
}: {
  label: string;
  value: string;
  unit: string;
  delta?: string;
  valueClass?: string;
}) {
  return (
    <div className="metric">
      <div className="lbl">{label}</div>
      <div className={`val ${valueClass ?? ''}`}>
        {value}
        <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}> {unit}</span>
      </div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  );
}
