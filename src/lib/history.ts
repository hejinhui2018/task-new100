/** 采用历史：线性撤销/重做，新采用会截断当前指针之后的未来分支 */

export interface HistoryState<T> {
  entries: T[];
  /** 指向当前条目；-1 表示停留在“尚未采用任何方案”的位置 */
  index: number;
}

export function emptyHistory<T>(): HistoryState<T> {
  return { entries: [], index: -1 };
}

export function adopt<T>(h: HistoryState<T>, entry: T): HistoryState<T> {
  const base = h.entries.slice(0, h.index + 1);
  base.push(entry);
  return { entries: base, index: base.length - 1 };
}

export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  return { ...h, index: Math.max(-1, h.index - 1) };
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  return { ...h, index: Math.min(h.entries.length - 1, h.index + 1) };
}

export function current<T>(h: HistoryState<T>): T | null {
  return h.index >= 0 ? h.entries[h.index] ?? null : null;
}
