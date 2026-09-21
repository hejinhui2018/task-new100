import type { PlanningConfig, WheelInput } from '../geometry/types';
import { DEFAULT_CONFIG } from '../geometry/types';
import type { Candidate } from '../geometry/search';

export interface AdoptedPlan {
  adoptedAt: string;
  /** 采用时的配置（限值等），用于刷新后对比，不参与重算 */
  config: PlanningConfig;
  cuts: {
    id: string;
    name: string;
    position: string;
    radiusCut: number;
    diameterReduction: number;
    finishedDiameter: number;
  }[];
  totalDiameterReduction: number;
  maxRadiusCut: number;
}

export interface Snapshot {
  wheels: WheelInput[];
  config: PlanningConfig;
  adopted: AdoptedPlan | null;
}

export interface State extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
}

export const initialState: State = {
  wheels: [],
  config: { ...DEFAULT_CONFIG },
  adopted: null,
  past: [],
  future: [],
};

export type Action =
  | { type: 'LOAD_EXAMPLE'; wheels: WheelInput[]; clearAdopted?: boolean }
  | { type: 'IMPORT_WHEEL'; wheel: WheelInput }
  | { type: 'REMOVE_WHEEL'; id: string }
  | { type: 'UPDATE_CONFIG'; patch: Partial<PlanningConfig> }
  | { type: 'ADOPT'; candidate: Candidate; at: string }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'HYDRATE'; snapshot: Snapshot };

function pushHistory(state: State, next: Snapshot): State {
  return {
    ...state,
    ...next,
    past: [...state.past, { wheels: state.wheels, config: state.config, adopted: state.adopted }],
    future: [],
  };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'LOAD_EXAMPLE':
      return pushHistory(state, { wheels: action.wheels, config: state.config, adopted: action.clearAdopted === false ? state.adopted : null });
    case 'IMPORT_WHEEL': {
      const others = state.wheels.filter((w) => w.position !== action.wheel.position);
      return pushHistory(state, { wheels: [...others, action.wheel], config: state.config, adopted: state.adopted });
    }
    case 'REMOVE_WHEEL':
      return pushHistory(state, {
        wheels: state.wheels.filter((w) => w.id !== action.id),
        config: state.config,
        adopted: state.adopted,
      });
    case 'UPDATE_CONFIG':
      return pushHistory(state, { wheels: state.wheels, config: { ...state.config, ...action.patch }, adopted: state.adopted });
    case 'ADOPT': {
      const adopted: AdoptedPlan = {
        adoptedAt: action.at,
        config: state.config,
        cuts: action.candidate.wheels.map((w) => ({
          id: w.id,
          name: w.name,
          position: w.position,
          radiusCut: w.radiusCut,
          diameterReduction: w.diameterReduction,
          finishedDiameter: w.finishedDiameter,
        })),
        totalDiameterReduction: action.candidate.totalDiameterReduction,
        maxRadiusCut: action.candidate.maxRadiusCut,
      };
      return pushHistory(state, { wheels: state.wheels, config: state.config, adopted });
    }
    case 'UNDO': {
      if (!state.past.length) return state;
      const prev = state.past[state.past.length - 1];
      return {
        ...state,
        ...prev,
        past: state.past.slice(0, -1),
        future: [{ wheels: state.wheels, config: state.config, adopted: state.adopted }, ...state.future],
      };
    }
    case 'REDO': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        ...state,
        ...next,
        past: [...state.past, { wheels: state.wheels, config: state.config, adopted: state.adopted }],
        future: state.future.slice(1),
      };
    }
    case 'HYDRATE':
      return { ...state, ...action.snapshot, past: [], future: [] };
    default:
      return state;
  }
}
