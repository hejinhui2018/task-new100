import type { PlannerStore } from '../state';

export function HistoryBar({ store }: { store: PlannerStore }) {
  const { adopted, historyIndex, undo, redo, resetHistory, canUndo, canRedo } = store;
  return (
    <div className="hist-strip">
      <button className="btn sm" onClick={undo} disabled={!canUndo} title="撤销最近采用">
        ↶ 撤销
      </button>
      <button className="btn sm" onClick={redo} disabled={!canRedo} title="重做">
        ↷ 重做
      </button>
      <span className="muted">已采用：</span>
      <div className="hist-list">
        {adopted.length === 0 && <span className="muted">无（从候选表点行预览后采用）</span>}
        {adopted.map((h, i) => (
          <span key={i} className={`hist-chip ${i === historyIndex ? 'cur' : ''}`} title={new Date(h.at).toLocaleString()}>
            {h.label}
            {i === historyIndex ? ' ●' : ''}
          </span>
        ))}
      </div>
      {adopted.length > 0 && (
        <button className="btn sm danger" onClick={resetHistory} title="清空采用历史">
          清空
        </button>
      )}
    </div>
  );
}
