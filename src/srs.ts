import { createPalace, getActivePalace, listPalaces, savePalace } from './palaces.js';
const KEY = 'loci.v1';
const DAY = 86_400_000;
const INTERVALS = [1, 3, 7]; // days, the last one repeats

export interface Pose {
  p: [number, number, number];
  q: [number, number, number, number];
}

export interface State {
  deckId: string;
  poses: Record<string, Pose>;
  srs: Record<string, { step: number; due: number }>;
  /** The palace this state was loaded from: saves go to it even if another palace becomes active meanwhile. */
  palaceId?: string;
}

export const emptyState = (deckId: string): State => ({
  deckId,
  poses: {},
  srs: {},
});

/** State now lives in the active palace (src/palaces.ts). Legacy single-state key is migrated once. */
export function loadState(): State | null {
  const active = getActivePalace();
  if (active) return { deckId: active.deckId, poses: active.poses, srs: active.srs, palaceId: active.id };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const legacy = JSON.parse(raw) as State;
    // save the migrated palace first, only then drop the legacy key
    const p = createPalace('My first palace', legacy.deckId, 'home');
    if (savePalace({ ...p, poses: legacy.poses ?? {}, srs: legacy.srs ?? {} })) localStorage.removeItem(KEY);
    return { deckId: legacy.deckId, poses: legacy.poses ?? {}, srs: legacy.srs ?? {}, palaceId: p.id };
  } catch {
    return null;
  }
}

/**
 * Saves into the palace the state was loaded from (falls back to the active one, creating "My palace" if none).
 * Returns false when the browser refused the write (storage full).
 */
export function saveState(s: State): boolean {
  const target = (s.palaceId ? listPalaces().find((p) => p.id === s.palaceId) : undefined) ?? getActivePalace() ?? createPalace('My palace', s.deckId, 'home');
  s.palaceId = target.id;
  return savePalace({ ...target, deckId: s.deckId, poses: s.poses, srs: s.srs });
}

/** Clears the active palace's placements and progress (keeps the palace itself). */
export function clearState(palaceId?: string): void {
  const active = (palaceId ? listPalaces().find((p) => p.id === palaceId) : undefined) ?? getActivePalace();
  if (active) savePalace({ ...active, poses: {}, srs: {} });
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable */
  }
}

export const isDue = (s: State, id: string, now = Date.now()): boolean =>
  (s.srs[id]?.due ?? 0) <= now;

/** Missed: due again now. Got it: next interval of 1, 3, 7, 7... days. */
export function grade(s: State, id: string, got: boolean, now = Date.now()) {
  if (!got) {
    s.srs[id] = { step: 0, due: now };
    return;
  }
  const step = s.srs[id]?.step ?? 0;
  s.srs[id] = {
    step: step + 1,
    due: now + INTERVALS[Math.min(step, INTERVALS.length - 1)] * DAY,
  };
}
