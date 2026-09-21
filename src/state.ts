import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AdoptedPlan,
  Candidate,
  PlannerSettings,
  WheelInput,
  WheelPos,
} from './lib/types';
import { WHEEL_POS } from './lib/types';
import { buildScenario, DEFAULT_SETTINGS, type ScenarioId } from './lib/samples';
import { processWheel, type WheelComputed } from './lib/pipeline';
import { searchPlan } from './lib/planner';
import {
  adopt as histAdopt,
  current as histCurrent,
  emptyHistory,
  redo as histRedo,
  undo as histUndo,
  type HistoryState,
} from './lib/history';

const STORAGE_KEY = 'wrp-state-v1';

interface PersistShape {
  wheels: Record<WheelPos, WheelInput | null>;
  settings: PlannerSettings;
  scenarioId: ScenarioId | 'custom';
  target: PlannerSettings['target'];
  nominalDiameter: number;
  history: HistoryState<AdoptedPlan>;
}

function scenarioDefaults(scenarioId: ScenarioId): {
  wheels: Record<WheelPos, WheelInput | null>;
  settings: PlannerSettings;
  target: PlannerSettings['target'];
  nominalDiameter: number;
} {
  const sc = buildScenario(scenarioId);
  const wheels = Object.fromEntries(WHEEL_POS.map((p) => [p, null])) as Record<WheelPos, WheelInput | null>;
  for (const w of sc.wheels) wheels[w.pos] = w;
  return {
    wheels,
    settings: {
      target: sc.target,
      datumBand: DEFAULT_SETTINGS.datumBand,
      cutZone: DEFAULT_SETTINGS.cutZone,
      feedStep: DEFAULT_SETTINGS.feedStep,
      minDiameter: DEFAULT_SETTINGS.minDiameter,
      axleDiffLimit: DEFAULT_SETTINGS.axleDiffLimit,
      bogieDiffLimit: DEFAULT_SETTINGS.bogieDiffLimit,
      maxPointGap: DEFAULT_SETTINGS.maxPointGap,
      noiseWarnSigma: DEFAULT_SETTINGS.noiseWarnSigma,
      nominalDiameter: sc.nominalDiameter,
    },
    target: sc.target,
    nominalDiameter: sc.nominalDiameter,
  };
}

function loadInitial(): PersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistShape;
      if (parsed.wheels && parsed.settings) {
        // 兼容旧版本（adopted/historyIndex 平铺）
        const legacy = parsed as unknown as { adopted?: AdoptedPlan[]; historyIndex?: number };
        const history: HistoryState<AdoptedPlan> =
          parsed.history ??
          (legacy.adopted
            ? { entries: legacy.adopted, index: legacy.historyIndex ?? legacy.adopted.length - 1 }
            : emptyHistory());
        return { ...parsed, history };
      }
    }
  } catch {
    /* 损坏的本地缓存：回退默认 */
  }
  const d = scenarioDefaults('normal');
  return { ...d, scenarioId: 'normal', history: emptyHistory() };
}

export function usePlanner() {
  const initial = useRef(loadInitial());
  const [wheels, setWheels] = useState(initial.current.wheels);
  const [settings, setSettings] = useState<PlannerSettings>(initial.current.settings);
  const [scenarioId, setScenarioId] = useState<ScenarioId | 'custom'>(initial.current.scenarioId);
  const [history, setHistory] = useState<HistoryState<AdoptedPlan>>(initial.current.history);
  const [selectedPos, setSelectedPos] = useState<WheelPos>('M1');
  const [preview, setPreview] = useState<Candidate | null>(null);

  // 持久化（刷新恢复）
  useEffect(() => {
    const data: PersistShape = {
      wheels,
      settings,
      scenarioId,
      target: settings.target,
      nominalDiameter: settings.nominalDiameter,
      history,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      /* 配额不足时静默 */
    }
  }, [wheels, settings, scenarioId, history]);

  const computed = useMemo(
    () =>
      Object.fromEntries(
        WHEEL_POS.map((p) => {
          const w = wheels[p];
          return [p, w ? processWheel(w, settings) : null];
        }),
      ) as Record<WheelPos, WheelComputed | null>,
    [wheels, settings],
  );

  const plan = useMemo(() => searchPlan(computed, settings), [computed, settings]);

  // 输入变化后若预览候选已不属于当前候选集则清除
  useEffect(() => {
    if (!plan.feasible) {
      setPreview(null);
    } else if (preview && !plan.candidates.includes(preview)) {
      setPreview(null);
    }
  }, [plan, preview]);

  const loadScenario = useCallback((id: ScenarioId) => {
    const d = scenarioDefaults(id);
    setWheels(d.wheels);
    setSettings(d.settings);
    setScenarioId(id);
    setPreview(null);
  }, []);

  const updateWheel = useCallback((w: WheelInput) => {
    setWheels((prev) => ({ ...prev, [w.pos]: w }));
    setScenarioId('custom');
  }, []);

  const replaceAllWheels = useCallback((ws: WheelInput[], target?: string, nominalDiameter?: number) => {
    const next = Object.fromEntries(WHEEL_POS.map((p) => [p, null])) as Record<WheelPos, WheelInput | null>;
    for (const w of ws) next[w.pos] = w;
    setWheels(next);
    setScenarioId('custom');
    if (target === 'S1002' || target === 'LM') {
      setSettings((s) => ({
        ...s,
        target: target,
        nominalDiameter: nominalDiameter ?? s.nominalDiameter,
      }));
    }
    setPreview(null);
  }, []);

  const updateSettings = useCallback((patch: Partial<PlannerSettings>) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const adopt = useCallback(
    (candidate: Candidate) => {
      setHistory((h) =>
        histAdopt(h, {
          at: Date.now(),
          label: `方案 #${h.entries.slice(0, h.index + 1).length + 1}`,
          candidate,
        }),
      );
      setPreview(null);
    },
    [],
  );

  const undo = useCallback(() => setHistory((h) => histUndo(h)), []);
  const redo = useCallback(() => setHistory((h) => histRedo(h)), []);
  const resetHistory = useCallback(() => setHistory(emptyHistory()), []);

  const currentAdopted = histCurrent(history);

  return {
    wheels,
    settings,
    scenarioId,
    computed,
    plan,
    selectedPos,
    setSelectedPos,
    preview,
    setPreview,
    adopted: history.entries,
    currentAdopted,
    historyIndex: history.index,
    canUndo: history.index >= 0,
    canRedo: history.index < history.entries.length - 1,
    loadScenario,
    updateWheel,
    replaceAllWheels,
    updateSettings,
    adopt,
    undo,
    redo,
    resetHistory,
  };
}

export type PlannerStore = ReturnType<typeof usePlanner>;
