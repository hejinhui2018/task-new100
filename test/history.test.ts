import { describe, it, expect } from 'vitest';
import { adopt, current, emptyHistory, redo, undo } from '../src/lib/history';

describe('采用历史（撤销/重做/分支截断）', () => {
  it('采用三条后撤销、重做', () => {
    let h = emptyHistory<string>();
    h = adopt(h, 'A');
    h = adopt(h, 'B');
    h = adopt(h, 'C');
    expect(h.index).toBe(2);
    expect(current(h)).toBe('C');
    h = undo(h);
    expect(current(h)).toBe('B');
    h = undo(h);
    expect(current(h)).toBe('A');
    h = redo(h);
    expect(current(h)).toBe('B');
  });

  it('撤销后新采用截断未来分支', () => {
    let h = emptyHistory<string>();
    h = adopt(h, 'A');
    h = adopt(h, 'B');
    h = adopt(h, 'C');
    h = undo(h);
    h = undo(h); // 停在 A
    h = adopt(h, 'D');
    expect(h.entries).toEqual(['A', 'D']);
    expect(current(h)).toBe('D');
    expect(redo(h).index).toBe(1); // 已无未来
  });

  it('空历史 current=null，撤销到底不越界', () => {
    let h = emptyHistory<string>();
    expect(current(h)).toBeNull();
    h = undo(h);
    expect(h.index).toBe(-1);
  });
});
