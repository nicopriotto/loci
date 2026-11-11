import type { State } from './srs.js';

/**
 * A palace = one deck placed in one setting. Its poses/srs are the classic State.
 * 'home' = passthrough (your real room); the others are pregenerated VR environments (src/envs/).
 */
export type Setting = 'home' | 'sunlit_living_room' | 'kitchen' | 'bedroom' | 'home_office' | 'music_studio' | 'open_studio';

export interface Palace extends State {
  id: string;
  name: string;
  setting: Setting;
  createdAt: number;
}

const LIST = 'loci.palaces';
const ACTIVE = 'loci.activePalace';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
/** True while the last write failed (storage full or blocked): placements and progress are not being kept. */
export let storageFailed = false;
function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    storageFailed = false;
    return true;
  } catch {
    storageFailed = true;
    return false;
  }
}

/** Hand-built castle/garden settings were dropped: those palaces move to the sunlit living room. */
const migrate = (p: Palace): Palace =>
  ['castle', 'garden'].includes(p.setting as string) ? { ...p, setting: 'sunlit_living_room' } : p;

export const listPalaces = (): Palace[] => read<Palace[]>(LIST, []).map(migrate);

/** Replaces the palace in place (keeps the gallery order) or appends a new one. False if it could not be stored. */
export function savePalace(p: Palace): boolean {
  const all = listPalaces();
  const i = all.findIndex((x) => x.id === p.id);
  if (i >= 0) all[i] = p;
  else all.push(p);
  return write(LIST, all);
}

export function deletePalace(id: string): void {
  write(LIST, listPalaces().filter((x) => x.id !== id));
  if (read<string | null>(ACTIVE, null) === id) write(ACTIVE, null);
}

export function createPalace(name: string, deckId: string, setting: Setting): Palace {
  const p: Palace = {
    id: `p${Date.now().toString(36)}`,
    name,
    deckId,
    setting,
    createdAt: Date.now(),
    poses: {},
    srs: {},
  };
  savePalace(p);
  setActivePalace(p.id);
  return p;
}

export const setActivePalace = (id: string | null): void => void write(ACTIVE, id);

export function getActivePalace(): Palace | null {
  const id = read<string | null>(ACTIVE, null);
  return listPalaces().find((p) => p.id === id) ?? null;
}

/** Number of cards due now in a palace (cards never reviewed count as due once placed). */
export const dueCount = (p: Palace, now = Date.now()): number =>
  Object.keys(p.poses).filter((id) => (p.srs[id]?.due ?? 0) <= now).length;
