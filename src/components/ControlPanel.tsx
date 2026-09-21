import { useRef, useState } from 'react';
import type { PlanningConfig, WheelPosition } from '../geometry/types';
import { POSITION_META } from '../geometry/types';
import type { WheelInput } from '../geometry/types';
import { parsePoints, parseWheelJson } from '../import/parse';

interface Props {
  config: PlanningConfig;
  onConfig: (patch: Partial<PlanningConfig>) => void;
  onExample: (kind: 'normal' | 'partial' | 'gap') => void;
  onImport: (w: WheelInput) => void;
  onRemove: (id: string) => void;
  wheels: WheelInput[];
}

export function ControlPanel({ config, onConfig, onExample, onImport, onRemove, wheels }: Props) {
  const [text, setText] = useState('');
  const [position, setPosition] = useState<WheelPosition>('A1L');
  const [diameter, setDiameter] = useState(840);
  const [datumX, setDatumX] = useState(0);
  const [datumY, setDatumY] = useState(0);
  const [msg, setMsg] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function doImport() {
    setMsg(null);
    if (!text.trim()) {
      setMsg({ kind: 'error', text: '请粘贴点列或选择文件' });
      return;
    }
    // JSON 优先
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const { wheels: ws, errors } = parseWheelJson(text);
      if (errors.length) setMsg({ kind: 'error', text: errors.join('；') });
      if (ws.length) {
        ws.forEach(onImport);
        setMsg({ kind: 'ok', text: `已导入 ${ws.length} 个车轮（${ws.map((w) => w.name).join('、')}）` });
        setText('');
      }
      return;
    }
    const { points, errors } = parsePoints(text);
    if (errors.length && !points.length) {
      setMsg({ kind: 'error', text: errors.join('；') });
      return;
    }
    if (points.length < 3) {
      setMsg({ kind: 'error', text: '有效点不足 3 个' });
      return;
    }
    const wheel: WheelInput = {
      id: `imp-${position}-${points.length}`,
      name: `导入·${POSITION_META[position].label}`,
      position,
      rollingDiameter: diameter,
      datum: { x: datumX, y: datumY },
      points,
    };
    onImport(wheel);
    setMsg({ kind: 'ok', text: `已导入 ${POSITION_META[position].label}：${points.length} 点${errors.length ? `（${errors.length} 行跳过）` : ''}` });
    setText('');
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setText(await f.text());
    e.target.value = '';
  }

  return (
    <div className="import-panel">
      <h2>数据与参数</h2>
      <div className="row">
        <button className="btn primary" onClick={() => onExample('normal')}>载入正常磨耗示例</button>
        <button className="btn" onClick={() => onExample('partial')}>偏磨（无解）示例</button>
        <button className="btn" onClick={() => onExample('gap')}>缺测示例</button>
      </div>

      <div className="row">
        <label className="field">目标型面
          <select value={config.target} onChange={(e) => onConfig({ target: e.target.value as PlanningConfig['target'] })}>
            <option value="LM">LM</option>
            <option value="LMA">LMA</option>
          </select>
        </label>
        <label className="field">公差±<input type="number" step={0.1} value={config.tolerance} onChange={(e) => onConfig({ tolerance: +e.target.value })} /></label>
        <label className="field">进给步进<input type="number" step={0.1} value={config.feedStep} onChange={(e) => onConfig({ feedStep: Math.max(0.05, +e.target.value) })} /></label>
      </div>
      <div className="row">
        <label className="field wide">最小轮径<input type="number" step={1} value={config.minDiameter} onChange={(e) => onConfig({ minDiameter: +e.target.value })} /></label>
        <label className="field wide">同轴差≤<input type="number" step={0.1} value={config.sameAxleLimit} onChange={(e) => onConfig({ sameAxleLimit: +e.target.value })} /></label>
        <label className="field wide">转向架差≤<input type="number" step={0.1} value={config.bogieLimit} onChange={(e) => onConfig({ bogieLimit: +e.target.value })} /></label>
        <label className="field wide">加工 x:<input type="number" step={1} value={config.machineXmin} onChange={(e) => onConfig({ machineXmin: +e.target.value })} /></label>
        <label className="field wide">至<input type="number" step={1} value={config.machineXmax} onChange={(e) => onConfig({ machineXmax: +e.target.value })} /></label>
      </div>

      <div className="wheel-list">
        {(['A1L', 'A1R', 'A2L', 'A2R'] as WheelPosition[]).map((p) => {
          const w = wheels.find((x) => x.position === p);
          return (
            <div className="wrow" key={p}>
              <span className="dot" style={{ width: 8, height: 8, borderRadius: '50%', background: `var(--${{ A1L: 's1', A1R: 's2', A2L: 's3', A2R: 's4' }[p]})` }} />
              <span className="nm">{w ? `${w.name} · Ø${w.rollingDiameter} · ${w.points.length}点` : `${POSITION_META[p].label}（未导入）`}</span>
              {w && <button className="link-btn danger" onClick={() => onRemove(w.id)}>移除</button>}
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: 12 }}>导入单点列 / JSON</h2>
      <div className="row">
        <label className="field">轮位
          <select value={position} onChange={(e) => setPosition(e.target.value as WheelPosition)}>
            {(['A1L', 'A1R', 'A2L', 'A2R'] as WheelPosition[]).map((p) => (
              <option key={p} value={p}>{POSITION_META[p].label}</option>
            ))}
          </select>
        </label>
        <label className="field">滚动圆直径<input type="number" step={0.1} value={diameter} onChange={(e) => setDiameter(+e.target.value)} /></label>
        <label className="field">基准 x<input type="number" step={0.1} value={datumX} onChange={(e) => setDatumX(+e.target.value)} /></label>
        <label className="field">基准 y<input type="number" step={0.1} value={datumY} onChange={(e) => setDatumY(+e.target.value)} /></label>
        <button className="btn" onClick={() => fileRef.current?.click()}>读文件…</button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.json" style={{ display: 'none' }} onChange={onFile} />
      </div>
      <textarea placeholder={'每行 x,y（支持逗号/制表符/空格，# 为注释）\n或完整 WheelInput JSON / 四轮数组'} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className={`hint`} style={{ color: msg?.kind === 'error' ? 'var(--critical)' : 'var(--good-text)' }}>{msg?.text ?? '点列为测量系原始坐标；基准 (datumX,datumY) 将被平移到型面原点，示例数据基准为 (137.5, 412.8)'}</span>
        <button className="btn primary" onClick={doImport}>导入</button>
      </div>
    </div>
  );
}
