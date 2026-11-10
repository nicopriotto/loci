export interface Concept {
  id: string;
  title: string;
  explanation: string;
  /** Relative file name (resolved against deck.base), data URL, or absolute URL. */
  image: string;
  prompt: string;
  /** Optional transparent-background cutout (data URL or URL) for a 2.5D layer. */
  cutout?: string;
}

export interface Deck {
  id: string;
  title: string;
  source: string;
  style: string;
  concepts: Concept[];
  /** Base URL of the deck folder, used to resolve concept images. */
  base: string;
}

const CUSTOM_KEY = 'loci.deck.custom';
const USER_PREFIX = 'loci.deck.';
const isUserDeck = (id: string) => id.startsWith('u_');
const PENDING_KEY = 'loci.pendingDeck';

/** data: and http(s): URLs pass through, anything else is relative to deck.base. */
export function resolveImage(deck: Deck, concept: Concept): string {
  const img = concept.image;
  if (/^(data:|https?:\/\/|blob:)/i.test(img)) return img;
  return deck.base + img;
}

/** False if storage is full or unavailable. */
export function saveCustomDeck(deck: Omit<Deck, 'base'>): boolean {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify({ ...deck, id: 'custom' }));
    return true;
  } catch {
    return false;
  }
}

/** Saves a deck under its own id (one per palace) so several palaces never overwrite each other. Null if storage is full. */
export function saveDeck(deck: Omit<Deck, 'base' | 'id'>): string | null {
  const id = `u_${Date.now().toString(36)}`;
  try {
    localStorage.setItem(USER_PREFIX + id, JSON.stringify({ ...deck, id }));
    return id;
  } catch {
    return null;
  }
}

/** Removes a user-saved deck (fixtures and the legacy 'custom' slot are never touched). */
export function deleteDeck(id: string): void {
  try {
    if (!isUserDeck(id)) return;
    localStorage.removeItem(USER_PREFIX + id);
    if (getPendingDeck()?.id === id) localStorage.removeItem(PENDING_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** Title and concept count without a network round trip (null if the deck is gone). */
export function deckInfo(id: string): { title: string; count: number } | null {
  try {
    if (id === 'custom' || isUserDeck(id)) {
      const raw = localStorage.getItem(id === 'custom' ? CUSTOM_KEY : USER_PREFIX + id);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return { title: d.title, count: d.concepts.length };
    }
  } catch {
    return null;
  }
  return id === 'cells' ? { title: 'Inside the Cell', count: 8 } : { title: id, count: 0 };
}

export function setPendingDeck(id: string): void {
  try {
    if (id === 'custom' || isUserDeck(id)) {
      const info = deckInfo(id);
      if (!info) return;
      localStorage.setItem(PENDING_KEY, JSON.stringify({ id, ...info }));
    } else {
      // Title/count of fixtures are read lazily from the fixture file.
      const known: Record<string, { title: string; count: number }> = {
        cells: { title: 'Inside the Cell', count: 8 },
      };
      const k = known[id] ?? { title: id, count: 0 };
      localStorage.setItem(PENDING_KEY, JSON.stringify({ id, ...k }));
    }
  } catch {
    /* storage unavailable */
  }
}

export function getPendingDeck(): { id: string; title: string; count: number } | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** The seam where the AI API plugs in later: fixtures are committed, 'custom' lives in localStorage. */
export async function loadDeck(id: string): Promise<Deck> {
  if (id === 'custom' || isUserDeck(id)) {
    const raw = localStorage.getItem(id === 'custom' ? CUSTOM_KEY : USER_PREFIX + id);
    if (!raw) throw new Error('No custom deck saved');
    return { ...JSON.parse(raw), id, base: '' };
  }
  const base = `${import.meta.env.BASE_URL}decks/${id}/`;
  const res = await fetch(`${base}deck.json`);
  if (!res.ok) throw new Error(`Deck ${id} not found`);
  return { ...(await res.json()), base };
}
