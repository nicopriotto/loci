/**
 * AI seam for the Studio. Everything here is offline and deterministic for now.
 *
 * TODO(meta-model-api): replace extractConcepts with ONE request to the Meta Model API
 * (through a Vercel /api/concepts function, never from the client with a key) that returns
 * JSON: { title, concepts: [{ title, explanation, imagePrompt }] } so concepts and image
 * prompts come back together. Keep this signature, the Studio does not care where it runs.
 *
 * generateImage calls POST /api/image (Meta muse-image-1.0, server side) and falls back to the
 * offline doodle when the call fails. extractConcepts tries POST /api/concepts (muse-spark-1.3)
 * and falls back to the offline heuristic.
 */

import { THEME } from './theme.js';

export interface DraftConcept {
  title: string;
  explanation: string;
  prompt: string;
}

export const STYLE_SUFFIX =
  'vivid surreal illustration, bold colors, single subject, clean flat pastel background, high detail';

const MAX_CONCEPTS = 10;
const SKIP_HEADINGS = new Set([
  'introduction', 'contents', 'table of contents', 'summary', 'references', 'abstract',
  'conclusion', 'conclusions', 'overview', 'bibliography', 'notes', 'index', 'agenda', 'outline', 'key terms', 'key concepts', 'glossary', 'vocabulary', 'questions',
]);

export function buildPrompt(title: string, explanation: string): string {
  const hint = explanation.split(/[.;,]/)[0].trim().toLowerCase();
  return hint
    ? `an absurd, unforgettable scene that stands for "${title}": ${hint}`
    : `an absurd, unforgettable scene that stands for "${title}"`;
}

/** "Term: explanation", "Term - explanation" (explanation optional). One idea per line. */
export function parseList(text: string): DraftConcept[] {
  const out: DraftConcept[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^\s*(?:[-*•·]|\d+[.)])\s+/, '').trim();
    if (!line) continue;
    const m = line.match(/^(.{1,120}?)\s*(?::|\s[-–—]\s)\s*(.*)$/);
    const title = clean(m ? m[1] : line, 56);
    const explanation = clean(m ? m[2] : '', 180);
    if (!title) continue;
    out.push({ title, explanation, prompt: buildPrompt(title, explanation) });
  }
  return out;
}

function clean(s: string, max: number): string {
  let t = s.replace(/\*\*|__|^#+\s*/g, '').replace(/\s+/g, ' ').trim();
  t = t.replace(/[\s:;,\-–—]+$/, '');
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function firstSentence(s: string, max = 160): string {
  const t = s.replace(/\s+/g, ' ').trim();
  const m = t.match(/^(.+?[.!?])(\s|$)/);
  let out = m ? m[1] : t;
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return out;
}

type Kind = 'heading' | 'bullet' | 'termdef' | 'body' | 'blank';
interface Line {
  kind: Kind;
  text: string;
  term?: string;
  def?: string;
}

const BULLET = /^\s*(?:[-*•·▪–]|\d+[.)])\s+(.*)$/;
const TERMDEF = /^\**([^:–—]{2,44}?)\**\s*(?::|\s[-–—]\s)\s*(\S.*)$/;

function classify(raw: string): Line {
  const t = raw.trim();
  if (!t) return { kind: 'blank', text: '' };
  if (/^#{1,6}\s+/.test(t)) return { kind: 'heading', text: t.replace(/^#+\s+/, '') };
  const words = t.split(/\s+/);
  const bm = t.match(BULLET);
  const body = bm ? bm[1] : t;
  const td = body.match(TERMDEF);
  if (td && td[1].split(/\s+/).length <= 6) return { kind: 'termdef', text: body, term: td[1], def: td[2] };
  if (bm) return { kind: 'bullet', text: body };
  if (/^\*\*[^*]+\*\*:?$/.test(t)) return { kind: 'heading', text: t.replace(/\*/g, '') };
  const numbered = /^\d+(\.\d+)*[.)]?\s+\p{Lu}/u.test(t) && words.length <= 8 && !/[.!?]$/.test(t);
  const upper = t === t.toUpperCase() && /[A-Z]/.test(t) && words.length <= 6;
  const titleish =
    words.length <= 5 && !/[.!?,;]$/.test(t) && /^\p{Lu}/u.test(t) && t.length <= 44 && !/^\d+$/.test(t);
  if (numbered || upper || titleish) return { kind: 'heading', text: t.replace(/^\d+(\.\d+)*[.)]?\s+/, '') };
  return { kind: 'body', text: t };
}

/**
 * Offline heuristic: headings, bullets, "Term: definition" lines and short title-like lines
 * become concepts; the first sentence that follows becomes the explanation. Max 10.
 */
export async function extractConcepts(text: string, style: string): Promise<DraftConcept[]> {
  const live = await postJson<{ concepts?: DraftConcept[] }>('/api/concepts', { text }, 12000);
  const ok = live?.concepts?.filter((c) => c && c.title);
  if (ok && ok.length >= 3) return ok.slice(0, MAX_CONCEPTS).map((c) => ({ title: c.title, explanation: c.explanation ?? '', prompt: c.prompt || buildPrompt(c.title, c.explanation ?? '') }));
  return extractConceptsOffline(text, style);
}

async function postJson<T>(url: string, body: unknown, timeoutMs: number): Promise<T | null> {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function extractConceptsOffline(text: string, _style: string): Promise<DraftConcept[]> {
  const lines = text.split('\n').map(classify);
  const found: { title: string; explanation: string }[] = [];

  const following = (from: number): string => {
    const parts: string[] = [];
    for (let j = from; j < lines.length && parts.join(' ').length < 220; j++) {
      const l = lines[j];
      if (l.kind !== 'body') break;
      parts.push(l.text);
      if (/[.!?]$/.test(l.text)) break;
    }
    return firstSentence(parts.join(' '));
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.kind === 'termdef') {
      const def = l.def!;
      found.push({
        title: clean(l.term!, 44),
        explanation: firstSentence(def + (/[.!?]$/.test(def) ? '' : ' ' + following(i + 1))),
      });
    } else if (l.kind === 'heading') {
      const hk = l.text.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (SKIP_HEADINGS.has(hk) || /^(introduction|chapter|table of contents)\b/.test(hk)) continue;
      found.push({ title: clean(l.text, 44), explanation: following(i + 1) });
    } else if (l.kind === 'bullet') {
      const words = l.text.split(/\s+/);
      if (words.length <= 6) {
        found.push({ title: clean(l.text, 44), explanation: following(i + 1) });
      } else {
        const head = l.text.split(/,|;|\s(?:is|are|means|refers)\s/)[0].split(/\s+/).slice(0, 5).join(' ');
        found.push({ title: clean(head, 44), explanation: firstSentence(l.text) });
      }
    }
  }

  if (found.length < 3) {
    // Fallback: sentences shaped like definitions ("X is/are/refers to ...").
    for (const l of lines) {
      if (l.kind !== 'body') continue;
      const m = l.text.match(/^(?:The |A |An )?([\p{Lu}][\p{L} -]{2,32}?)\s+(?:is|are|refers to|means)\s+(.+)$/u);
      if (m) found.push({ title: clean(m[1], 44), explanation: firstSentence(l.text) });
    }
  }

  const seen = new Set<string>();
  const out: DraftConcept[] = [];
  for (const f of found) {
    const key = f.title.toLowerCase();
    if (!f.title || f.title.length < 2 || seen.has(key)) continue;
    seen.add(key);
    out.push({ title: f.title, explanation: f.explanation, prompt: buildPrompt(f.title, f.explanation) });
    if (out.length >= MAX_CONCEPTS) break;
  }
  return out;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Offline stub: flat pastel background, one wobbly ink doodle and the initial.
 * Returns a 512x512 JPEG data URL after a short, human-feeling delay.
 */
export async function generateImage(prompt: string, style: string, title?: string): Promise<string> {
  const live = await postJson<{ image?: string }>('/api/image', { prompt, style }, 90000);
  if (live?.image?.startsWith('data:image/')) return live.image;
  return generateDoodle(prompt, style, title);
}

async function generateDoodle(prompt: string, style: string, title?: string): Promise<string> {
  const rand = rng(hash((title ?? prompt) + '|' + style));
  const h0 = hash(title ?? prompt);
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = THEME.pastels[h0 % THEME.pastels.length];
  g.fillRect(0, 0, S, S);
  g.strokeStyle = THEME.ink;
  g.fillStyle = THEME.paper;
  g.lineWidth = 6;
  g.lineCap = g.lineJoin = 'round';
  const w = () => (rand() - 0.5) * 7;
  const poly = (pts: [number, number][], close = false) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x + w(), y + w()) : g.moveTo(x + w(), y + w())));
    if (close) g.closePath();
  };
  const kind = (h0 >> 4) % 4;
  if (kind === 0) {
    // little tower with a flag
    poly([[330, 430], [332, 250], [430, 248], [432, 430]], true); g.fill(); g.stroke();
    poly([[318, 256], [381, 170], [444, 254]], true); g.fill(); g.stroke();
    poly([[381, 170], [381, 120]]); g.stroke();
    poly([[382, 122], [425, 110], [420, 140], [382, 146]], true); g.fill(); g.stroke();
  } else if (kind === 1) {
    // moon and stars
    g.beginPath(); g.arc(380, 150, 52, 0, 7); g.fill(); g.stroke();
    for (const [x, y] of [[90, 110], [180, 70], [440, 270]] as const) { poly([[x - 14, y], [x + 14, y]]); g.stroke(); poly([[x, y - 14], [x, y + 14]]); g.stroke(); }
  } else if (kind === 2) {
    // cloud
    g.beginPath(); g.arc(340, 140, 34, Math.PI, 0); g.arc(392, 140, 26, Math.PI * 1.5, Math.PI * 0.5); g.lineTo(300, 166); g.arc(300, 140, 26, Math.PI * 0.5, Math.PI * 1.5); g.closePath(); g.fill(); g.stroke();
    poly([[60, 440], [452, 440]]); g.stroke();
  } else {
    // little tree
    g.beginPath(); g.arc(400, 200, 62, 0, 7); g.fill(); g.stroke();
    poly([[400, 262], [400, 430]]); g.stroke();
    poly([[340, 432], [460, 432]]); g.stroke();
  }
  try {
    await document.fonts.load('800 300px "Bricolage Grotesque"');
  } catch {
    /* fall back to the system font */
  }
  const initial = ((title ?? prompt).trim().match(/\p{L}/u)?.[0] ?? 'L').toUpperCase();
  g.font = '800 290px "Bricolage Grotesque", system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = THEME.ink;
  g.fillText(initial, 190, 300);
  await new Promise((r) => setTimeout(r, 650 + rand() * 900));
  return c.toDataURL('image/jpeg', 0.82);
}
