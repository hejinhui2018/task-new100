import { useEffect, useState } from 'react';
import { usePlanner } from './state';
import type { ScenarioId } from './lib/samples';
import type { WheelPos } from './lib/types';
import { WHEEL_POS } from './lib/types';
import { ProfileChart, POS_COLOR } from './components/ProfileChart';
import { BogieLayout } from './components/BogieLayout';
import { CandidateTable } from './components/CandidateTable';
import { MetricsPanel } from './components/MetricsPanel';
import { NoticesPanel } from './components/NoticesPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { ImportPanel } from './components/ImportPanel';
import { HistoryBar } from './components/HistoryBar';
import { PlanBanner } from './components/PlanBanner';

const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: 'normal', label: '正常磨耗' },
  { id: 'eccentric', label: '偏磨/凹磨' },
  { id: 'missing', label: '缺测无解' },
];

export default function App() {
  const store = usePlanner();
  const [sideTab, setSideTab] = useState<'plan' | 'settings' | 'import'>('plan');
  const [dark, setDark] = useState(() => localStorage.getItem('wrp-theme') === 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('wrp-theme', dark ? 'dark' : 'light');
  }, [dark]);

  const tabState = (p: WheelPos): '' | 'warn' | 'err' => {
    const c = store.computed[p];
    if (!c) return 'warn';
    if (c.fatal) return 'err';
    if (c.notices.some((n) => n.severity === 'warning')) return 'warn';
    return '';
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1>轮对镟修余量规划台</h1>
        <div className="scenario-group" role="tablist" aria-label="内置示例">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              className={store.scenarioId === s.id ? 'active' : ''}
              onClick={() => store.loadScenario(s.id)}
              title={s.label}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <HistoryBar store={store} />
        <button className="btn sm" onClick={() => setDark(!dark)} title="切换明暗主题">
          {dark ? '☀ 浅色' : '☾ 深色'}
        </button>
      </header>

      <PlanBanner store={store} />

      <div className="grid">
        {/* 左列：叠图 + 尺寸 */}
        <div className="col">
          <section className="panel">
            <h2>
              轮廓叠图
              <span className="sub">实测（彩色）与目标（黑）按基准带刚体对齐；粉虚线为预览/已采用镟后型面</span>
            </h2>
            <div className="wheel-tabs" role="tablist">
              {WHEEL_POS.map((p) => (
                <button
                  key={p}
                  role="tab"
                  aria-selected={store.selectedPos === p}
                  className={`wheel-tab ${store.selectedPos === p ? 'active' : ''} ${tabState(p)}`}
                  style={{ ['--dot' as string]: POS_COLOR[p] }}
                  onClick={() => store.setSelectedPos(p)}
                >
                  <span className="dot" style={{ background: POS_COLOR[p] }} />
                  {p}
                  {store.wheels[p] ? ` D${store.wheels[p]!.rollingDiameter.toFixed(1)}` : ' 无数据'}
                </button>
              ))}
            </div>
            <div className="legend" style={{ margin: '8px 0 2px' }}>
              <span className="item"><span className="sw-line" style={{ borderColor: 'var(--c-target)' }} />目标型面</span>
              <span className="item"><span className="sw-line" style={{ borderColor: POS_COLOR[store.selectedPos] }} />实测（对齐后）</span>
              <span className="item"><span className="sw-line" style={{ borderColor: 'var(--c-cut)', borderTopStyle: 'dashed' }} />镟后预览</span>
              <span className="item">
                <svg width="16" height="10"><rect width="16" height="10" fill="var(--gap-hatch)" stroke="var(--critical)" /></svg>
                缺测段
              </span>
              <span className="item">
                <svg width="16" height="10"><rect width="16" height="10" fill="var(--band-shade)" stroke="var(--info)" /></svg>
                基准带 / 加工区
              </span>
            </div>
            <ProfileChart store={store} />
          </section>

          <section className="panel">
            <h2>轮缘尺寸与稳定性 <span className="sub">真实交点计算；不做最近点硬凑</span></h2>
            <MetricsPanel store={store} />
            <div style={{ height: 10 }} />
            <NoticesPanel store={store} />
          </section>
        </div>

        {/* 右列：布局 + 候选 + 设置/导入 */}
        <div className="col">
          <section className="panel">
            <h2>轮对布局 <span className="sub">点击车轮切换叠图；红圈=致命问题</span></h2>
            <BogieLayout store={store} />
          </section>

          <section className="panel">
            <div className="tabs">
              <button className={sideTab === 'plan' ? 'active' : ''} onClick={() => setSideTab('plan')}>
                候选方案
              </button>
              <button className={sideTab === 'settings' ? 'active' : ''} onClick={() => setSideTab('settings')}>
                约束与公差
              </button>
              <button className={sideTab === 'import' ? 'active' : ''} onClick={() => setSideTab('import')}>
                导入 / 导出
              </button>
            </div>

            {sideTab === 'plan' &&
              (store.plan.feasible ? (
                <CandidateTable store={store} />
              ) : (
                <div className="muted" style={{ padding: '8px 2px' }}>
                  无候选：请见顶部红色诊断；修正轮廓或放宽约束后自动重新搜索。
                </div>
              ))}
            {sideTab === 'settings' && <SettingsPanel store={store} />}
            {sideTab === 'import' && <ImportPanel store={store} />}
          </section>
        </div>
      </div>

      <footer style={{ margin: '14px 4px 0', color: 'var(--muted)', fontSize: 11.5 }}>
        教学/规划辅助工具：内置目标型面为关键尺寸标定的工程近似，不含刀具干涉、机床标定与规程判定；
        实际镟修以经认可的样板/刀路数据与现场工艺为准。全部数据仅保存在本浏览器 localStorage。
      </footer>
    </div>
  );
}
