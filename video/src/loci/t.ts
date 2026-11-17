import vo from '../../public/vo/vo.json';

export const FPS = 30;
type Word = {w: string; s: number; e: number};
type Sec = {id: string; text: string; start: number; end: number; words: Word[]};
export const SECTIONS = (vo as {sections: Sec[]}).sections;
export const IDS = SECTIONS.map((s) => s.id);
const clean = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, '');
const sec = (id: string) => {
  const s = SECTIONS.find((x) => x.id === id);
  if (!s) throw new Error('no section ' + id);
  return s;
};
/** Absolute start frame of a section. */
export const startF = (id: string) => (id === IDS[0] ? 0 : Math.round(sec(id).start * FPS));
/** Section length in frames (until the next section starts). */
export const durF = (id: string) => {
  const i = IDS.indexOf(id);
  return i === IDS.length - 1 ? TOTAL_FRAMES - startF(id) : startF(IDS[i + 1]) - startF(id);
};
/** Seconds the final card holds after the last spoken word. */
export const HOLD = 2.5;
const lastWord = () => { const w = sec('close').words; return w[w.length - 1]; };
/** Timing (absolute seconds) of the closing tagline "Stop memorizing. Start remembering.", read from the spoken words. */
export const tagline = () => {
  const ws = sec('close').words;
  const at = (w: string) => {
    const x = ws.find((y) => clean(y.w) === w);
    if (!x) throw new Error(`close section has no spoken word "${w}"`);
    return x;
  };
  const stop = at('stop'), mem = at('memorizing'), strt = at('start'), rem = at('remembering');
  return {stop: stop.s, memS: mem.s, memE: mem.e, strt: strt.s, rem: rem.s, remE: rem.e, prevEnd: ws[ws.indexOf(stop) - 1]?.e ?? 0};
};
export const TOTAL_FRAMES = Math.ceil((tagline().remE + HOLD) * FPS);
/** Local frame (inside section `id`) at which the nth occurrence of `word` starts. */
export const wf = (id: string, word: string, nth = 0) => {
  const hits = sec(id).words.filter((x) => clean(x.w) === clean(word));
  if (!hits[nth]) throw new Error(`word ${word}#${nth} not in ${id}`);
  return Math.round(hits[nth].s * FPS) - startF(id);
};
/** Local frame where the nth word (index) of the section starts. */
export const wi = (id: string, idx: number) => Math.round(sec(id).words[idx].s * FPS) - startF(id);
/** Seconds to frames. */
export const sf = (s: number) => Math.round(s * FPS);

const hit = (id: string, word: string, nth: number) => {
  const ws = sec(id).words;
  const idx = ws.map((x, i) => (clean(x.w) === clean(word) ? i : -1)).filter((i) => i >= 0)[nth];
  if (idx === undefined) throw new Error(`word ${word}#${nth} not in ${id}`);
  return {idx, w: ws[idx], ws};
};
/** Local frame where the nth occurrence of `word` ends. */
export const we = (id: string, word: string, nth = 0) => Math.round(hit(id, word, nth).w.e * FPS) - startF(id);
/** Local frame where the word before the nth `word` ends (0 if it is the first word). */
export const prevEnd = (id: string, word: string, nth = 0) => {
  const {idx, ws} = hit(id, word, nth);
  return idx === 0 ? 0 : Math.round(ws[idx - 1].e * FPS) - startF(id);
};
/** Keep an ascending list of local frames at least `gap` apart (robust to unusual voice timings). */
export const mono = (xs: number[], gap = 6) => xs.reduce<number[]>((a, x) => [...a, Math.max(x, a.length ? a[a.length - 1] + gap : x)], []);
