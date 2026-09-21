import type { Snapshot } from './store';

const KEY = 'wheelset-planner-v1';

let store: Storage | null = resolveDefault();

function resolveDefault(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && (globalThis as { localStorage?: Storage }).localStorage) {
      return (globalThis as { localStorage: Storage }).localStorage;
    }
  } catch {
    // 访问受限（沙箱）时降级
  }
  return null;
}

/** 注入存储实现（测试或非浏览器环境）；传 null 恢复自动探测 */
export function useStorage(s: Storage | null): void {
  store = s ?? resolveDefault();
}

export function saveSnapshot(s: Snapshot): void {
  if (!store) return;
  try {
    store.setItem(KEY, JSON.stringify(s));
  } catch {
    // 存储不可用（隐私模式/超额）时静默降级，内存状态仍可用
  }
}

export function loadSnapshot(): Snapshot | null {
  if (!store) return null;
  try {
    const raw = store.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!Array.isArray(parsed.wheels) || typeof parsed.config !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSnapshot(): void {
  try {
    store?.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** 供测试注入的内存版存储 */
export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}
