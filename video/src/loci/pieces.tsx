import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {clamp, inOut} from '../lib';
import {VClip} from './fx';

/** A footage piece: local frames [l0, l1) play source seconds [s0, s1] at constant rate. `fade` frames of cross-dissolve in (starts early, plays under). */
export type Piece = {l0: number; l1: number; s0: number; s1: number; fade?: number};

const Fade: React.FC<{n: number; children: React.ReactNode}> = ({n, children}) => {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{opacity: n ? clamp((f + 1) / n) : 1}}>{children}</AbsoluteFill>;
};

/** Renders footage pieces, no zoom, full frame. */
export const Pieces: React.FC<{src: string; ps: Piece[]}> = ({src, ps}) => (
  <>
    {ps.map((p, i) => {
      const fade = p.fade ?? 0;
      const n = p.l1 - p.l0;
      const rate = Math.max(0.05, ((p.s1 - p.s0) * 30) / n);
      return (
        <Sequence key={i} from={p.l0 - fade} durationInFrames={n + fade}>
          <Fade n={fade}><VClip src={src} from={Math.max(0, p.s0 - (fade * rate) / 30)} rate={rate} /></Fade>
        </Sequence>
      );
    })}
  </>
);

/** Eased playback of [s0, s1] over local frames [l0, l1) using short constant-rate pieces. */
export const easedPieces = (l0: number, l1: number, s0: number, s1: number, mix = 0.7, step = 6): Piece[] => {
  const out: Piece[] = [];
  const at = (f: number) => {
    const t = clamp((f - l0) / (l1 - l0));
    return s0 + (s1 - s0) * (t * (1 - mix) + inOut(t) * mix);
  };
  for (let f = l0; f < l1; f += step) {
    const fb = Math.min(l1, f + step);
    out.push({l0: f, l1: fb, s0: at(f), s1: at(fb)});
  }
  return out;
};

/** Source timeline with cut windows removed (virtual -> real). */
export const makeRamp = (startF: number, endF: number, srcStart: number, srcEnd: number, cuts: [number, number][], rampFrames: number, step = 6): Piece[] => {
  const kept: [number, number][] = [];
  let cur = srcStart;
  for (const [a, b] of cuts) { kept.push([cur, a]); cur = b; }
  kept.push([cur, srcEnd]);
  const total = kept.reduce((s, [a, b]) => s + (b - a), 0);
  const v2r = (u: number): {r: number; k: number} => {
    let rem = u;
    for (let k = 0; k < kept.length; k++) {
      const len = kept[k][1] - kept[k][0];
      if (rem <= len || k === kept.length - 1) return {r: kept[k][0] + Math.min(rem, len), k};
      rem -= len;
    }
    return {r: srcEnd, k: kept.length - 1};
  };
  const rho = (f: number, R: number) => 1 + (R - 1) * inOut(clamp((f - startF) / rampFrames));
  const integ = (R: number) => { let u = 0; for (let f = startF; f < endF; f++) u += rho(f, R) / 30; return u; };
  let lo = 1, hi = 20;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (integ(m) < total) lo = m; else hi = m; }
  const R = (lo + hi) / 2;
  const u: number[] = [0];
  for (let f = startF; f < endF; f++) u.push(u[u.length - 1] + rho(f, R) / 30);
  const ps: Piece[] = [];
  let fa = startF;
  while (fa < endF) {
    const ka = v2r(u[fa - startF]).k;
    let fb = fa + 1;
    while (fb < endF && fb - fa < step && v2r(u[fb - startF]).k === ka) fb++;
    const ra = v2r(u[fa - startF]).r;
    const rb = ra + (u[fb - startF] - u[fa - startF]);
    const prevK = fa > startF ? v2r(u[fa - 1 - startF]).k : ka;
    ps.push({l0: fa, l1: fb, s0: ra, s1: Math.min(rb, srcEnd), fade: prevK !== ka ? 5 : 0});
    fa = fb;
  }
  (ps as unknown as {R: number}).R = R;
  return ps;
};
