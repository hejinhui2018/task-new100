import { useRef, useState } from 'react';
import type { WheelPos } from '../lib/types';
import { WHEEL_POS } from '../lib/types';
import { parseWheelCsv, parseWheelJson, parseWheelsFile, stringifyWheelsFile, ImportError } from '../lib/import';
import type { PlannerStore } from '../state';

export function ImportPanel({ store }: { store: PlannerStore }) {
  const { wheels, settings, updateWheel, replaceAllWheels } = store;
  const [text, setText] = useState('');
  const [pos, setPos] = useState<WheelPos>('M1');
  const [diam, setDiam] = useState(837);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
  };

  const importText = () => {
    try {
      const t = text.trim();
      if (!t.startsWith('{')) {
        const w = parseWheelCsv(t, pos, diam);
        updateWheel(w);
        flash('ok', `已导入车轮 ${w.pos}（${w.points.length} 点，D=${w.rollingDiameter}）`);
      } else {
        // 可能是整车或单轮
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed) || parsed.wheels) {
          const f = parseWheelsFile(t);
          replaceAllWheels(f.wheels, f.target, f.nominalDiameter);
          flash('ok', `已导入整车数据（${f.wheels.length} 轮）`);
        } else {
          const w = parseWheelJson(t);
          updateWheel(w);
          flash('ok', `已导入车轮 ${w.pos}（${w.points.length} 点）`);
        }
      }
      setText('');
    } catch (e) {
      flash('err', e instanceof ImportError || e instanceof Error ? e.message : '解析失败');
    }
  };

  const onFile = async (file: File) => {
    const t = await file.text();
    try {
      if (file.name.endsWith('.csv') || (!file.name.endsWith('.json') && !t.trim().startsWith('{') && !t.trim().startsWith('['))) {
        const w = parseWheelCsv(t, pos, diam);
        updateWheel(w);
      } else {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed) || parsed.wheels) {
          const f = parseWheelsFile(t);
          replaceAllWheels(f.wheels, f.target, f.nominalDiameter);
          flash('ok', `已导入整车文件 ${file.name}（${f.wheels.length} 轮）`);
          return;
        } else {
          const w = parseWheelJson(t);
          updateWheel(w);
        }
      }
      flash('ok', `已导入文件 ${file.name}`);
    } catch (e) {
      flash('err', `${file.name}：${e instanceof Error ? e.message : '解析失败'}`);
    }
  };

  const exportJson = () => {
    const list = WHEEL_POS.map((p) => wheels[p]).filter((w): w is NonNullable<typeof w> => w != null);
    const blob = new Blob([stringifyWheelsFile(list, settings.target, settings.nominalDiameter)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wheelset-profiles.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={pos} onChange={(e) => setPos(e.target.value as WheelPos)}>
          {WHEEL_POS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={diam}
          step={0.1}
          style={{ width: 110 }}
          onChange={(e) => setDiam(parseFloat(e.target.value))}
          title="CSV 无直径声明时使用"
        />
        <span className="muted">CSV 缺省轮位 / 实测直径</span>
      </div>
      <textarea
        className="io"
        placeholder={'粘贴 CSV（x,y 每行一点，首行可写 "# M1,837.4"）或单轮/整车 JSON'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={importText} disabled={!text.trim()}>
          导入文本
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          选择文件…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.json,.txt"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = '';
          }}
        />
        <button className="btn" onClick={exportJson}>
          导出当前整车 JSON
        </button>
      </div>
      {msg && (
        <div className={`notice ${msg.kind === 'ok' ? 'info' : 'error'}`} style={{ marginTop: 8 }}>
          <span className="ico">{msg.kind === 'ok' ? '✓' : '✕'}</span>
          <span className="t">{msg.text}</span>
        </div>
      )}
      <p className="muted" style={{ fontSize: 11.5, margin: '8px 2px 0' }}>
        坐标约定：规距面 x≈-70，滚动圆刻线 x=0，踏面外侧为正；y 相对滚动圆切线向上为正。反向点序会被自动识别翻转。
      </p>
    </div>
  );
}
