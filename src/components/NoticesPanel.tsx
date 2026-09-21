import type { Notice } from '../lib/types';
import type { PlannerStore } from '../state';

const ICON: Record<Notice['severity'], string> = {
  error: '✕',
  warning: '!',
  info: 'i',
};

export function NoticesPanel({ store }: { store: PlannerStore }) {
  const { computed, selectedPos, plan } = store;
  const cw = computed[selectedPos];
  const own = cw?.notices ?? [];
  // 错误排前
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = own.slice().sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div>
      <div className="notices" style={{ maxHeight: 150 }}>
        {plan.feasible && plan.candidates[0]?.provisional && (
          <div className="notice warning">
            <span className="ico">!</span>
            <span className="t">
              候选方案含不稳定轮（缺测/噪声），结果仅作参考，不得直接用于下刀。
            </span>
          </div>
        )}
        {sorted.length === 0 && (
          <div className="notice info">
            <span className="ico">i</span>
            <span className="t">方向、点序、覆盖与噪声校验通过；基准刚体对齐正常，结果稳定。</span>
          </div>
        )}
        {sorted.map((n, i) => (
          <div key={i} className={`notice ${n.severity}`}>
            <span className="ico">{ICON[n.severity]}</span>
            <span className="t">
              {n.message}
              {n.detail && <span className="detail">{n.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
