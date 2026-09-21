import type { TargetId } from '../lib/types';
import { TARGETS } from '../lib/profiles';
import type { PlannerStore } from '../state';

function NumField({
  label,
  value,
  step = 0.1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  step?: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row tight">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          step={step}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
        />
        {suffix && <span className="muted">{suffix}</span>}
      </div>
    </div>
  );
}

export function SettingsPanel({ store }: { store: PlannerStore }) {
  const { settings, updateSettings } = store;

  const setBand = (i: 0 | 1, v: number) => {
    const b: [number, number] = [...settings.datumBand];
    b[i] = v;
    updateSettings({ datumBand: b });
  };
  const setZone = (i: 0 | 1, v: number) => {
    const z: [number, number] = [...settings.cutZone];
    z[i] = v;
    updateSettings({ cutZone: z });
  };

  return (
    <div className="form-grid">
      <div className="field">
        <label>目标型面</label>
        <select
          value={settings.target}
          onChange={(e) => updateSettings({ target: e.target.value as TargetId })}
        >
          {Object.values(TARGETS).map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}（Sh {t.nominalSh} / Sd {t.nominalSd} / qR {t.nominalQr}）
            </option>
          ))}
        </select>
      </div>
      <NumField label="名义滚动圆直径" value={settings.nominalDiameter} step={1} suffix="mm" onChange={(v) => updateSettings({ nominalDiameter: v })} />
      <NumField label="基准带起 x" value={settings.datumBand[0]} step={1} onChange={(v) => setBand(0, v)} />
      <NumField label="基准带止 x" value={settings.datumBand[1]} step={1} onChange={(v) => setBand(1, v)} />
      <NumField label="加工区间起 x" value={settings.cutZone[0]} step={1} onChange={(v) => setZone(0, v)} />
      <NumField label="加工区间止 x" value={settings.cutZone[1]} step={1} onChange={(v) => setZone(1, v)} />
      <NumField label="离散进刀步长" value={settings.feedStep} step={0.1} suffix="mm（半径）" onChange={(v) => updateSettings({ feedStep: Math.max(0.05, v) })} />
      <NumField label="最小轮径" value={settings.minDiameter} step={1} suffix="mm" onChange={(v) => updateSettings({ minDiameter: v })} />
      <NumField label="同轴径差限值" value={settings.axleDiffLimit} step={0.1} suffix="mm" onChange={(v) => updateSettings({ axleDiffLimit: v })} />
      <NumField label="转向架径差限值" value={settings.bogieDiffLimit} step={0.5} suffix="mm" onChange={(v) => updateSettings({ bogieDiffLimit: v })} />
      <NumField label="缺段点距阈值" value={settings.maxPointGap} step={0.5} suffix="mm" onChange={(v) => updateSettings({ maxPointGap: Math.max(0.5, v) })} />
      <NumField label="噪声告警 σ" value={settings.noiseWarnSigma} step={0.01} suffix="mm" onChange={(v) => updateSettings({ noiseWarnSigma: Math.max(0.005, v) })} />
    </div>
  );
}
