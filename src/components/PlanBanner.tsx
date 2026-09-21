import type { PlannerStore } from '../state';

const CONSTRAINT_TEXT: Record<string, string> = {
  minDiameter: '最小轮径',
  axleDiff: '同轴径差',
  bogieDiff: '转向架径差',
  noValidProfile: '轮廓不可用（缺测/覆盖不足）',
  searchSpace: '搜索空间过大',
};

export function PlanBanner({ store }: { store: PlannerStore }) {
  const { plan, preview, currentAdopted } = store;

  if (!plan.feasible) {
    const inf = plan.infeasibility!;
    return (
      <div className="banner error">
        <b>无可行方案</b>
        <div>
          <div>
            控制约束：<b>{CONSTRAINT_TEXT[inf.constraint] ?? inf.constraint}</b>；控制车轮：
            <b>{inf.controlling.join('、')}</b>
          </div>
          <div className="muted">{inf.message}</div>
          {inf.detail && <div className="muted">{inf.detail}</div>}
        </div>
      </div>
    );
  }

  const shown = preview ?? currentAdopted?.candidate ?? plan.candidates[0];
  const isAdopted = currentAdopted && shown === currentAdopted.candidate;
  return (
    <div className={`banner ${shown.provisional ? 'warn' : 'good'}`}>
      <b>{isAdopted ? '已采用方案' : preview ? '候选预览' : '推荐方案（总去除最小）'}</b>
      <div>
        <div>
          M1 {shown.cuts.M1.toFixed(1)} / M2 {shown.cuts.M2.toFixed(1)} / T1{' '}
          {shown.cuts.T1.toFixed(1)} / T2 {shown.cuts.T2.toFixed(1)} mm（半径切深）
        </div>
        <div className="muted">
          镟后径差：同轴 M {shown.axleDiffs['M1-M2']?.toFixed(2)} / T {shown.axleDiffs['T1-T2']?.toFixed(2)}；
          转向架 {shown.bogieSpread.toFixed(2)} mm；直径总去除 {shown.totalRemovedDiameter.toFixed(1)} mm；
          镟后最小轮径余量 {shown.minRemaining.toFixed(2)} mm
          {shown.provisional && '；⚠ 含不稳定轮，方案仅供参考'}
        </div>
      </div>
    </div>
  );
}
