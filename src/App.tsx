import { useEffect, useMemo, useReducer, useState } from 'react';
import { reducer, initialState } from './state/store';
import { loadSnapshot, saveSnapshot } from './state/persistence';
import { planWheelset } from './geometry/pipeline';
import { targetProfile } from './geometry/profiles';
import type { WheelPosition } from './geometry/types';
import { POSITION_META } from './geometry/types';
import { buildExampleSet } from './geometry/examples';
import type { WheelInput } from './geometry/types';
import { ProfileChart } from './components/ProfileChart';
import { WheelsetLayout } from './components/WheelsetLayout';
import { CandidateTable } from './components/CandidateTable';
import { ControlPanel } from './components/ControlPanel';

const POS_ORDER: WheelPosition[] = ['A1L', 'A1R', 'A2L', 'A2R'];
const COLOR_VAR: Record<WheelPosition, string> = { A1L: '--s1', A1R: '--s2', A2L: '--s3', A2R: '--s4' };

function init() {
  const snap = loadSnapshot();
  if (snap) return { ...initialState, ...snap, past: [], future: [] };
  return initialState;
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, init);
  const [selected, setSelected] = useState<WheelPosition>('A1L');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('wp-theme') as 'dark') === 'dark' ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('wp-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (loadSnapshot()) setRestored(true);
  }, []);

  // 持久化当前快照（不含撤销栈）
  useEffect(() => {
    saveSnapshot({ wheels: state.wheels, config: state.config, adopted: state.adopted });
  }, [state.wheels, state.config, state.adopted]);

  // 输入或参数变化后清除候选预览
  useEffect(() => {
    setPreviewIndex(null);
  }, [state.wheels, state.config]);

  const plan = useMemo(() => (state.wheels.length ? planWheelset(state.wheels, state.config) : null), [state.wheels, state.config]);
  const target = useMemo(() => targetProfile(state.config.target), [state.config.target]);

  const selectedReport = plan?.wheels.find((w) => w.input.position === selected) ?? null;
  const search = plan?.search ?? null;
  const preview = search?.feasible && previewIndex !== null ? search.candidates[previewIndex] ?? null : null;
  const previewCut = preview?.wheels.find((w) => w.position === selected)?.radiusCut;

  const loadExample = (kind: 'normal' | 'partial' | 'gap') => {
    dispatch({ type: 'LOAD_EXAMPLE', wheels: buildExampleSet(kind) });
    setSelected('A1L');
  };
  const importWheel = (w: WheelInput) => dispatch({ type: 'IMPORT_WHEEL', wheel: w });
  const adopt = () => {
    if (preview) {
      dispatch({ type: 'ADOPT', candidate: preview, at: new Date().toLocaleString('zh-CN') });
      setPreviewIndex(null);
    }
  };

  const dims = selectedReport?.dims ?? null;
  const issues = selectedReport ? [...selectedReport.issues, ...(selectedReport.analysis?.notes.map((message) => ({ severity: 'note' as const, code: 'note' as const, message })) ?? []), ...(selectedReport.dims?.issues.map((message) => ({ severity: 'warning' as const, code: 'note' as const, message })) ?? [])] : [];

  return (
    <div className="app">
      <header className="topbar">
        <h1>🚇 轮对镟修余量规划台</h1>
        <span className="hint">基准刚体对齐 · 加工区间最小切深 · 四轮离散进给耦合搜索</span>
        <div className="spacer" />
        {restored && state.wheels.length > 0 && <span className="hint" title="数据保存在浏览器 localStorage">↻ 已从本地恢复</span>}
        <button className="btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>{theme === 'light' ? '🌙 暗色' : '☀️ 亮色'}</button>
        <button className="btn" disabled={!state.past.length} onClick={() => dispatch({ type: 'UNDO' })} title="撤销">↶ 撤销</button>
        <button className="btn" disabled={!state.future.length} onClick={() => dispatch({ type: 'REDO' })} title="重做">↷ 重做</button>
      </header>

      <div className="main">
        <div className="col-left">
          <section className="card">
            <h2>轮廓对齐叠图
              <span className="sub">{selectedReport ? selectedReport.input.name : POSITION_META[selected].label}</span>
            </h2>
            <div className="wheel-tabs">
              {POS_ORDER.map((p) => {
                const r = plan?.wheels.find((w) => w.input.position === p);
                const hasErr = r?.issues.some((i) => i.severity === 'error');
                return (
                  <button
                    key={p}
                    className={`chip${selected === p ? ' active' : ''}`}
                    style={{ ['--chip-color' as string]: `var(${COLOR_VAR[p]})` }}
                    onClick={() => setSelected(p)}
                  >
                    <span className="dot" />
                    {POSITION_META[p].label}
                    {!r ? '' : hasErr ? <span className="badge-err">✕</span> : ' ✓'}
                  </button>
                );
              })}
            </div>

            {plan ? (
              <ProfileChart
                report={selectedReport ?? undefined}
                colorVar={COLOR_VAR[selected]}
                target={target}
                tolerance={state.config.tolerance}
                machine={[state.config.machineXmin, state.config.machineXmax]}
                previewCut={previewCut}
              />
            ) : (
              <div className="empty-hint">
                暂无车轮数据。<br />请在右侧「数据与参数」载入内置示例（正常磨耗 / 偏磨无解 / 缺测），或导入各轮横向轮廓点、基准与滚动圆直径。
              </div>
            )}

            <div className="legend">
              <span className="item"><span className="swatch" style={{ background: `var(${COLOR_VAR[selected]})` }} />实测轮廓（对齐后）</span>
              <span className="item"><span className="swatch dashed" style={{ color: 'var(--s7)' }} />目标 {state.config.target}</span>
              <span className="item"><span className="swatch band" style={{ background: 'var(--s1)' }} />公差带 ±{state.config.tolerance} mm</span>
              <span className="item"><span className="swatch fill" style={{ background: 'var(--critical)' }} />材料缺口（目标高于实测，决定最小切深）</span>
              <span className="item"><span className="swatch fill" style={{ background: 'var(--s2)' }} />候选去除区（镟后将切掉的材料）</span>
              <span className="item">○ 交叉点　▨ 缺测段</span>
            </div>

            {dims && (
              <div className="dim-row">
                <DimBadge k="轮缘高 Sh" v={dims.Sh} ok />
                <DimBadge k="轮缘厚 Sd" v={Number.isFinite(dims.Sd) ? dims.Sd : null} ok={Number.isFinite(dims.Sd)} />
                <DimBadge k="厚度梯度 qR" v={dims.valid ? dims.qR : null} ok={dims.valid} />
                {selectedReport?.analysis?.feasible && (
                  <DimBadge k="最小半径切深 d*" v={selectedReport.analysis!.minCutRadius} ok />
                )}
                {selectedReport?.analysis?.feasible && (
                  <DimBadge k="直径削减" v={selectedReport.analysis!.diameterReduction} ok />
                )}
              </div>
            )}

            {issues.length > 0 && (
              <div className="issues">
                {issues.map((iss, i) => (
                  <div key={i} className={`issue ${iss.severity === 'note' ? 'note' : iss.severity}`}>
                    <span className="icon">{iss.severity === 'error' ? '✕' : iss.severity === 'warning' ? '⚠' : 'ℹ'}</span>
                    <span>{iss.message}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h2>轮对布局与直径协调</h2>
            {plan ? (
              <WheelsetLayout plan={plan} candidate={preview} adopted={preview ? null : state.adopted} config={state.config} />
            ) : (
              <div className="empty-hint">载入数据后显示四轮布局、同轴差与转向架极差</div>
            )}
          </section>
        </div>

        <div className="col-right">
          <section className="card">
            <ControlPanel
              config={state.config}
              onConfig={(patch) => dispatch({ type: 'UPDATE_CONFIG', patch })}
              onExample={loadExample}
              onImport={importWheel}
              onRemove={(id) => dispatch({ type: 'REMOVE_WHEEL', id })}
              wheels={state.wheels}
            />
          </section>

          {plan && (
            <section className="card">
              {search?.feasible ? (
                <>
                  <h2>候选镟修方案
                    <span className="sub">点击行在叠图与布局中预览</span>
                  </h2>
                  <CandidateTable
                    candidates={search.candidates}
                    totalFeasible={search.totalFeasibleVectors}
                    truncated={search.truncated}
                    selectedIndex={previewIndex}
                    onSelect={setPreviewIndex}
                  />
                  <div className="row" style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button className="btn good" disabled={preview === null} onClick={adopt}>采用预览方案 #{previewIndex !== null ? previewIndex + 1 : '—'}</button>
                  </div>
                </>
              ) : search ? (
                <NoSolution search={search} />
              ) : null}
            </section>
          )}

          {state.adopted && (
            <section className="card">
              <h2>已采用方案（加工记录）</h2>
              <div className="adopted-banner">
                <span>✅ 采用时间 <b>{state.adopted.adoptedAt}</b></span>
                <span>直径削减合计 <b>{state.adopted.totalDiameterReduction.toFixed(1)} mm</b></span>
                <span>最大单轮切深 <b>{state.adopted.maxRadiusCut.toFixed(1)} mm</b></span>
              </div>
              <div className="table-scroll" style={{ marginTop: 8 }}>
                <table className="cands">
                  <thead><tr><th>轮位</th><th>半径切深</th><th>直径削减</th><th>镟后直径</th></tr></thead>
                  <tbody>
                    {state.adopted.cuts.map((c) => (
                      <tr key={c.id}><td style={{ textAlign: 'left' }}>{c.name}</td><td>{c.radiusCut.toFixed(1)}</td><td>{c.diameterReduction.toFixed(1)}</td><td>{c.finishedDiameter.toFixed(1)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint" style={{ marginTop: 6 }}>刷新页面后记录自动恢复；修改数据或参数可撤销（↶）回到采用前状态。</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function DimBadge({ k, v, ok }: { k: string; v: number | null; ok: boolean }) {
  return (
    <div className={`dim-badge${ok ? '' : ' bad'}`}>
      <div className="k">{k}</div>
      <div className="v">{v === null || !Number.isFinite(v) ? '—' : v.toFixed(2)} <span className="u">mm</span></div>
    </div>
  );
}

function NoSolution({ search }: { search: { diagnoses: { code: string; message: string; constraint?: string; controllingWheels: string[] }[] } }) {
  return (
    <div className="no-solution">
      <h2>⚠ 无可行镟修方案</h2>
      <p className="hint" style={{ color: 'var(--ink-2)' }}>
        在当前「只能去料 + 最小轮径 + 同轴差/转向架差 + 离散进给」约束下，四轮联合搜索没有找到任何组合。诊断如下：
      </p>
      {search.diagnoses.map((d, i) => (
        <div key={i} className="diagnosis">
          <span className="tag">{d.code === 'min-diameter' ? '最小轮径' : d.code === 'missing-segment' ? '缺段/校验' : '离散网格'}</span>
          {d.message}
          {d.constraint && <div className="hint" style={{ marginTop: 2 }}>违反约束：{d.constraint}；控制车轮：{d.controllingWheels.join('、')}</div>}
        </div>
      ))}
      <p className="hint" style={{ marginTop: 8 }}>
        处置建议：补测缺段或修正方向/基准 → 减小进给步进 → 复核限值是否可放宽；若控制轮即使零切深协调也越限，则需换轮或镟修后降速管理，系统不会以最近点方式“凑”出方案。
      </p>
    </div>
  );
}
