import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { reducer, initialState, type State, type Snapshot } from '../src/state/store';
import { loadSnapshot, saveSnapshot, memoryStorage, clearSnapshot, useStorage } from '../src/state/persistence';
import { buildExampleSet } from '../src/geometry/examples';
import type { Candidate } from '../src/geometry/search';

const ms = memoryStorage();
beforeAll(() => useStorage(ms));

function candidateMock(cuts: number[]): Candidate {
  const pos = ['A1L', 'A1R', 'A2L', 'A2R'] as const;
  return {
    wheels: cuts.map((d, i) => ({
      id: `w${i + 1}`,
      name: `轮${i + 1}`,
      position: pos[i],
      radiusCut: d,
      diameterReduction: 2 * d,
      finishedDiameter: 840 - 2 * d,
      extraOverMin: 0,
      removedArea: 0,
      materialGoverning: true,
    })),
    totalDiameterReduction: cuts.reduce((a, c) => a + 2 * c, 0),
    totalArea: 0,
    maxRadiusCut: Math.max(...cuts),
    axleDiffs: [
      { axle: 1, diff: Math.abs(840 - 2 * cuts[0] - (840 - 2 * cuts[1])) },
      { axle: 2, diff: Math.abs(840 - 2 * cuts[2] - (840 - 2 * cuts[3])) },
    ],
    bogieSpread: 2 * (Math.max(...cuts) - Math.min(...cuts)),
    minLifeMargin: 840 - 2 * Math.max(...cuts) - 826,
  };
}

describe('撤销/重做历史', () => {
  it('载入示例入栈，撤销回到空态，重做恢复', () => {
    let s: State = initialState;
    s = reducer(s, { type: 'LOAD_EXAMPLE', wheels: buildExampleSet('normal') });
    expect(s.wheels).toHaveLength(4);
    expect(s.past).toHaveLength(1);
    expect(s.future).toHaveLength(0);

    s = reducer(s, { type: 'UNDO' });
    expect(s.wheels).toHaveLength(0);
    expect(s.future).toHaveLength(1);

    s = reducer(s, { type: 'REDO' });
    expect(s.wheels).toHaveLength(4);
    expect(s.past).toHaveLength(1);
  });

  it('采用候选可撤销，撤销后 adopted 清空', () => {
    let s: State = reducer(initialState, { type: 'LOAD_EXAMPLE', wheels: buildExampleSet('normal') });
    s = reducer(s, { type: 'ADOPT', candidate: candidateMock([2, 2, 2, 2]), at: '2026-09-20 10:00' });
    expect(s.adopted).not.toBeNull();
    expect(s.adopted?.cuts).toHaveLength(4);
    expect(s.adopted?.totalDiameterReduction).toBe(16);

    s = reducer(s, { type: 'UNDO' });
    expect(s.adopted).toBeNull();
    expect(s.wheels).toHaveLength(4); // 车轮数据不受影响
  });

  it('新操作清空 redo 栈', () => {
    let s: State = reducer(initialState, { type: 'LOAD_EXAMPLE', wheels: buildExampleSet('normal') });
    s = reducer(s, { type: 'UNDO' });
    expect(s.future).toHaveLength(1);
    s = reducer(s, { type: 'LOAD_EXAMPLE', wheels: buildExampleSet('gap') });
    expect(s.future).toHaveLength(0);
    expect(s.wheels.find((w) => w.position === 'A1R')?.name).toContain('缺测');
  });

  it('同轮位导入替换旧轮', () => {
    let s: State = reducer(initialState, { type: 'LOAD_EXAMPLE', wheels: buildExampleSet('normal') });
    const [w] = buildExampleSet('gap');
    s = reducer(s, { type: 'IMPORT_WHEEL', wheel: w });
    const a1l = s.wheels.filter((x) => x.position === 'A1L');
    expect(a1l).toHaveLength(1);
    expect(a1l[0].id).toBe(w.id);
  });
});

describe('本地保存与刷新恢复', () => {
  beforeEach(() => {
    ms.clear();
  });

  it('快照写入后可原样读出（含已采用方案）', () => {
    let s: State = reducer(initialState, { type: 'LOAD_EXAMPLE', wheels: buildExampleSet('normal') });
    s = reducer(s, { type: 'ADOPT', candidate: candidateMock([1.5, 2, 1.5, 2]), at: '2026-09-20 11:30' });
    const snap: Snapshot = { wheels: s.wheels, config: s.config, adopted: s.adopted };
    saveSnapshot(snap);

    const restored = loadSnapshot();
    expect(restored).not.toBeNull();
    expect(restored!.wheels).toHaveLength(4);
    expect(restored!.adopted?.cuts).toHaveLength(4);
    expect(restored!.adopted?.maxRadiusCut).toBe(2);

    // 以 HYDRATE 回到应用：数据恢复、历史栈清空
    const hydrated = reducer(initialState, { type: 'HYDRATE', snapshot: restored! });
    expect(hydrated.wheels).toHaveLength(4);
    expect(hydrated.adopted?.adoptedAt).toBe('2026-09-20 11:30');
    expect(hydrated.past).toHaveLength(0);
    expect(hydrated.future).toHaveLength(0);
  });

  it('损坏的存储内容安全返回 null', () => {
    ms.setItem('wheelset-planner-v1', '{not json');
    expect(loadSnapshot()).toBeNull();
  });

  it('配置修改随快照持久化', () => {
    const s = reducer(initialState, { type: 'UPDATE_CONFIG', patch: { feedStep: 0.25, minDiameter: 830 } });
    saveSnapshot({ wheels: s.wheels, config: s.config, adopted: s.adopted });
    const r = loadSnapshot()!;
    expect(r.config.feedStep).toBe(0.25);
    expect(r.config.minDiameter).toBe(830);
  });

  it('无存储时返回 null；清除后同样为 null', () => {
    expect(loadSnapshot()).toBeNull();
    saveSnapshot({ wheels: buildExampleSet('normal'), config: initialState.config, adopted: null });
    expect(loadSnapshot()).not.toBeNull();
    clearSnapshot();
    expect(loadSnapshot()).toBeNull();
  });

  it('内存版存储满足接口语义（降级场景）', () => {
    const ms = memoryStorage();
    expect(ms.getItem('x')).toBeNull();
    ms.setItem('x', '1');
    expect(ms.getItem('x')).toBe('1');
    expect(ms.length).toBe(1);
    ms.removeItem('x');
    expect(ms.getItem('x')).toBeNull();
  });
});
