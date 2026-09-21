import { useMemo, useState } from 'react';
import type { Candidate } from '../lib/types';
import { WHEEL_POS } from '../lib/types';
import type { PlannerStore } from '../state';

type SortKey = 'totalRemovedDiameter' | 'maxCut' | 'minRemaining' | 'bogieSpread';

const HEAD: Array<{ key: SortKey | null; label: string; title: string }> = [
  { key: null, label: '#', title: '' },
  { key: null, label: 'M1', title: 'M1 径向切深 mm' },
  { key: null, label: 'M2', title: 'M2 径向切深 mm' },
  { key: null, label: 'T1', title: 'T1 径向切深 mm' },
  { key: null, label: 'T2', title: 'T2 径向切深 mm' },
  { key: 'bogieSpread', label: '转向架差', title: '镟后转向架最大径差 mm' },
  { key: 'totalRemovedDiameter', label: '总去除', title: '直径方向总去除量 mm' },
  { key: 'maxCut', label: '最大切深', title: '最大单轮径向切深 mm' },
  { key: 'minRemaining', label: '最小余量', title: '镟后最小轮径 − 最小允许轮径 mm' },
];

export function CandidateTable({ store }: { store: PlannerStore }) {
  const { plan, preview, setPreview, adopt } = store;
  const [sortKey, setSortKey] = useState<SortKey>('totalRemovedDiameter');
  const [asc, setAsc] = useState(true);

  const rows = useMemo(() => {
    if (!plan.feasible) return [];
    const arr = plan.candidates.slice();
    arr.sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      return asc ? va - vb : vb - va;
    });
    return arr;
  }, [plan, sortKey, asc]);

  if (!plan.feasible) return null;

  const onHead = (k: SortKey) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      // 总去除/切深/差越小越好（升序），余量越大越好（降序）
      setAsc(k !== 'minRemaining');
    }
  };

  return (
    <div>
      <table className="cand">
        <thead>
          <tr>
            {HEAD.map((h, i) => (
              <th
                key={i}
                className={`${h.key ? 'sortable' : ''} ${i === 0 ? 'name' : ''}`}
                title={h.title}
                onClick={() => h.key && onHead(h.key)}
              >
                {h.label}
                {h.key === sortKey ? (asc ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c, idx) => {
            const selected = preview === c;
            return (
              <tr
                key={idx}
                className={selected ? 'sel' : ''}
                onClick={() => setPreview(selected ? null : c)}
              >
                <td className="name">
                  {idx + 1}
                  {c.provisional && <span className="tag" title="含缺测/噪声不稳定轮，仅作参考">参考</span>}
                </td>
                {WHEEL_POS.map((p) => (
                  <td key={p}>{c.cuts[p].toFixed(1)}</td>
                ))}
                <td>{c.bogieSpread.toFixed(2)}</td>
                <td>{c.totalRemovedDiameter.toFixed(1)}</td>
                <td>{c.maxCut.toFixed(1)}</td>
                <td>{c.minRemaining.toFixed(2)}</td>
                <td>
                  {selected && (
                    <button
                      className="btn sm primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        adopt(c);
                      }}
                    >
                      采用
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted" style={{ margin: '6px 2px 0', fontSize: 11.5 }}>
        默认按 总去除量 → 最大单轮切深 → 剩余寿命 排序；点击列头可改排序。点行预览叠图与布局，再点“采用”记入历史。切深为半径方向 mm，镟后直径变化为其 2 倍。
      </p>
    </div>
  );
}

export function postDiameterOf(c: Candidate, pos: (typeof WHEEL_POS)[number]): number {
  return c.postDiameters[pos];
}
