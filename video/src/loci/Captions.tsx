import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FB, clamp} from '../lib';
import {FPS, SECTIONS, startF} from './t';

type W = {w: string; s: number; e: number};
type Chunk = {words: W[]; s: number; e: number};

const ends = (w: string) => /[.,?!:;…]$/.test(w) || /\.\.\.$/.test(w);
const strong = (w: string) => /[.?!…]$/.test(w) || /\.\.\.$/.test(w);

const build = (): Chunk[] => {
  const all: W[] = SECTIONS.flatMap((s) => s.words);
  const chunks: W[][] = [];
  let cur: W[] = [];
  const len = (a: W[]) => a.map((x) => x.w).join(' ').length;
  for (let i = 0; i < all.length; i++) {
    cur.push(all[i]);
    const next = all[i + 1];
    const gap = next ? next.s - all[i].e : 9;
    const brk = !next || strong(all[i].w) || (ends(all[i].w) && cur.length >= 3) || cur.length >= 8 || (next && len(cur) + next.w.length > 44) || gap > 0.9;
    if (brk) {
      chunks.push(cur);
      cur = [];
    }
  }
  // merge tiny chunks (1-2 words) into a neighbour when it still fits
  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length <= 2 && i + 1 < chunks.length && chunks[i].length + chunks[i + 1].length <= 8 && len([...chunks[i], ...chunks[i + 1]]) <= 46 && !strong(chunks[i][chunks[i].length - 1].w)) {
      chunks.splice(i, 2, [...chunks[i], ...chunks[i + 1]]);
      i--;
    }
  }
  return chunks.map((words, i) => {
    const next = chunks[i + 1];
    const e = words[words.length - 1].e;
    const hold = Math.min(e + 0.55, next ? next[0].s - 0.02 : e + 0.7);
    return {words, s: Math.max(0, words[0].s - 0.12), e: Math.max(hold, e)};
  });
};
export const CHUNKS = build();

export const Captions: React.FC = () => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const studio = f >= startF('studio') && f < startF('enter');
  const ch = CHUNKS.find((c) => t >= c.s && t < c.e);
  if (!ch) return null;
  const lead = clamp((t - ch.s) / 0.1);
  let active = -1;
  ch.words.forEach((w, i) => { if (t >= w.s - 0.02) active = i; });
  return (
    <div style={{position: 'absolute', left: 0, right: studio ? 60 : 0, ...(studio ? {top: 80} : {bottom: 52}), display: 'flex', justifyContent: studio ? 'flex-end' : 'center', pointerEvents: 'none'}}>
      <div style={{
        maxWidth: 1700, whiteSpace: 'nowrap', padding: '14px 36px 16px', borderRadius: 40, background: 'rgba(251,247,240,0.97)', border: `3px solid ${C.ink}`,
        boxShadow: `4px 5px 0 ${C.ink}`, fontFamily: FB, fontWeight: 600, fontSize: 46, lineHeight: 1.22, color: C.ink, textAlign: 'center',
        transform: `scale(${0.96 + 0.04 * lead})`, opacity: lead,
      }}>
        {ch.words.map((w, i) => (
          <span key={i} style={{
            position: 'relative', display: 'inline-block', marginRight: i === ch.words.length - 1 ? 0 : '0.28em',
            color: i > active ? C.inkSoft : C.ink, padding: '0 6px', borderRadius: 12,
            background: i === active ? C.butter : 'transparent', boxShadow: i === active ? `inset 0 -4px 0 ${C.ink}` : 'none',
          }}>{w.w}</span>
        ))}
      </div>
    </div>
  );
};
