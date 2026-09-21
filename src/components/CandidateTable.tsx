import type { Candidate } from '../geometry/search';
import type { WheelPosition } from '../geometry/types';
import { POSITION_META } from '../geometry/types';

interface Props {
  candidates: Candidate[];
  totalFeasible: number;
  truncated: boolean;
  selectedIndex: number | null;
  onSelect: (i: number) => void;
}

const POS: WheelPosition[] = ['A1L', 'A1R', 'A2L', 'A2R'];
const COLOR: Record<WheelPosition, string> = { A1L: 'var(--s1)', A1R: 'var(--s2)', A2L: 'var(--s3)', A2R: 'var(--s4)' };

export function CandidateTable({ candidates, totalFeasible, truncated, selectedIndex, onSelect }: Props) {
  return (
    <div className="table-scroll">
      <table className="cands">
        <thead>
          <tr>
            <th>#</th>
            {POS.map((p) => (
              <th key={p} style={{ color: COLOR[p] }}>{POSITION_META[p].label}<br />切深/镟后</th>
            ))}
            <th>总去除<br />(直径合计)</th>
            <th>最大单轮<br />切深</th>
            <th>同轴差<br />(1轴/2轴)</th>
            <th>转向架<br />极差</th>
            <th>最小轮径<br />余量</th>
          </tr>
        </thead>
        <tbody>
          {candidates.map((c, i) => (
            <tr
              key={i}
              className={`cand-row${selectedIndex === i ? ' selected' : ''}`}
              onClick={() => onSelect(i)}
            >
              <td><span className="rank-tag">{i + 1}</span></td>
              {POS.map((p) => {
                const w = c.wheels.find((x) => x.position === p)!;
                return (
                  <td key={p} style={{ color: w.materialGoverning ? 'var(--ink)' : COLOR[p], fontWeight: w.materialGoverning ? 700 : 400 }}>
                    {w.radiusCut.toFixed(1)}
                    <span className="cell-sub">{w.finishedDiameter.toFixed(1)}{w.materialGoverning ? ' ●最小' : ''}</span>
                  </td>
                );
              })}
              <td><b>{c.totalDiameterReduction.toFixed(1)}</b></td>
              <td>{c.maxRadiusCut.toFixed(1)}</td>
              <td>{c.axleDiffs.map((a) => a.diff.toFixed(1)).join(' / ')}</td>
              <td>{c.bogieSpread.toFixed(1)}</td>
              <td style={{ color: c.minLifeMargin < 1 ? 'var(--critical)' : undefined }}>{c.minLifeMargin.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint" style={{ margin: '6px 2px 0' }}>
        共 {totalFeasible} 个可行离散组合{truncated ? '（枚举达上限，已截断显示——可加大进给步进缩小空间）' : ''}，按总去除量 → 最大单轮切深 → 剩余寿命排序；点击行预览，●最小 表示该轮取材料最小进给。
      </p>
    </div>
  );
}
