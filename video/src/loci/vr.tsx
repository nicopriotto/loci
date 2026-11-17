import React from 'react';
import {Sequence, useCurrentFrame} from 'remotion';
import {C, FD, Ink, Scene, T, W, H, back, clamp, inOut, out, rr} from '../lib';
import {Castle, Wordmark} from '../lib';
import {Burst, Chip, Flash, Ring} from './fx';
import {Piece, Pieces, easedPieces, makeRamp} from './pieces';
import {FOOTAGE} from './footage';
import {durF, mono, startF, tagline, wf} from './t';

const SLOT = {x: 96, y: 72};

export const Cold: React.FC = () => {
  const F = FOOTAGE.cold;
  return <Pieces src={F.src} ps={easedPieces(0, durF('cold'), F.from, F.to, 0)} />;
};

export const Enter: React.FC = () => {
  const id = 'enter';
  const F = FOOTAGE.enter;
  const dur = durF(id);
  const settleF = Math.min(dur - 12, Math.max(30, wf(id, 'front')));
  return (
    <>
      <Pieces src={F.src} ps={[{l0: 0, l1: settleF, s0: F.from, s1: F.settle}, {l0: settleF, l1: dur, s0: F.settle, s1: F.to}]} />
      <Chip text="Put on your Quest" icon="headset" at={wf(id, 'Put')} until={wf(id, 'cards') - 4} fill={C.sky} x={SLOT.x} y={SLOT.y} />
      <Chip text="Your cards, waiting" icon="doc" at={wf(id, 'cards')} fill={C.butter} x={SLOT.x} y={SLOT.y} />
    </>
  );
};

export const Place: React.FC = () => {
  const id = 'place';
  const F = FOOTAGE.place;
  const w = (x: string, n = 0) => wf(id, x, n);
  const end = durF(id);
  // card 1 in real time, as long as the narration leaves room for the sped-up rest
  let card1 = Math.min(Math.round((F.card1.to - F.card1.from) * 30), Math.round(end * 0.45));
  let ramp = makeRamp(card1, end, F.card1.from + card1 / 30, F.rest.to, F.cuts, 24);
  if ((ramp as unknown as {R: number}).R > F.maxRate) {
    console.warn(`[place] speed ramp peaks at ${(ramp as unknown as {R: number}).R.toFixed(1)}x (limit ${F.maxRate}x): add cuts in footage.ts or lengthen the narration`);
  }
  const ps: Piece[] = [{l0: 0, l1: card1, s0: F.card1.from, s1: F.card1.from + card1 / 30}, ...ramp];
  return (
    <>
      <Pieces src={F.src} ps={ps} />
      <Chip text="Pinch" icon="pinch" at={0} until={w('wall') - 4} fill={C.butter} x={SLOT.x} y={SLOT.y} />
      <Chip text="On the wall" icon="pin" at={w('wall')} until={w('next') - 4} fill={C.mint} x={SLOT.x} y={SLOT.y} />
      <Chip text="Next to the lamp" icon="pin" at={w('next')} until={w('by') - 4} fill={C.rose} x={SLOT.x} y={SLOT.y} />
      <Chip text="By the window" icon="pin" at={w('by')} until={w('One') - 4} fill={C.sky} x={SLOT.x} y={SLOT.y} />
      <Chip text="Every idea gets a home" icon="house" at={w('One')} until={w('dotted') - 6} fill={C.butter} x={SLOT.x} y={SLOT.y} />
      <Chip text="A dotted path keeps the order" icon="dots" at={w('dotted')} fill={C.lilac} x={SLOT.x} y={SLOT.y} />
    </>
  );
};

/** Soft ink ring + button squeeze where the emulated fingertip presses a pill button (full-frame px). */
const Tap: React.FC<{at: number; x: number; y: number; bw?: number}> = ({at, x, y, bw = 196}) => {
  const f = useCurrentFrame();
  const t = (f - at) / 7;
  if (t < 0 || t > 1) return null;
  const e = out(t);
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
      <circle cx={x} cy={y} r={20 + 70 * e} fill="none" stroke={C.ink} strokeWidth={7 * (1 - t) + 1.5} opacity={0.5 * (1 - t)} />
      <g transform={`translate(${x} ${y}) scale(${0.95 + 0.05 * t})`} opacity={1 - t * t}>
        <path d={rr(-bw / 2, -31, bw, 62, 31)} fill={C.ink} opacity={0.12} />
      </g>
    </svg>
  );
};

/** Review timeline, every cut derived from word times: card 1 flips on "flip" and is answered on "Got it?", card 2 on "Great.", card 3 (Missed) on "Missed it?". */
const reviewPlan = () => {
  const id = 'review';
  const F = FOOTAGE.review;
  const dur = durF(id);
  const STAMP = 30;
  const flipF = Math.max(STAMP + 30, wf(id, 'flip'));
  const press1 = Math.max(flipF + 20, wf(id, 'it', 2) + 6);
  const press2 = Math.max(press1 + 14, wf(id, 'Great') + 8);
  const press3 = Math.max(press2 + 14, wf(id, 'it', 3) + 4);
  const [b1, b2, b3] = mono([press1 + 8, press2 + 8, press3 + 8], 12);
  const rest = Math.max(30, dur - b3);
  const ps: Piece[] = [];
  const s0 = Math.max(0, F.open[0] - (flipF - STAMP) / 30);
  ps.push({l0: STAMP, l1: flipF, s0, s1: F.open[0]});
  const r1 = ((F.press[0] - F.open[0]) * 30) / (press1 - flipF);
  ps.push({l0: flipF, l1: b1, s0: F.open[0], s1: F.open[0] + ((b1 - flipF) / 30) * r1});
  const r2 = 3.0, r3 = 4.0;
  const a2 = F.press[1] - ((press2 - b1) / 30) * r2;
  ps.push({l0: b1, l1: b2, s0: a2, s1: a2 + ((b2 - b1) / 30) * r2, fade: 4});
  const a3 = F.press[2] - ((press3 - b2) / 30) * r3;
  ps.push({l0: b2, l1: b3, s0: a3, s1: a3 + ((b3 - b2) / 30) * r3, fade: 4});
  const n = F.press.length - 3; // cards 4..8
  for (let i = 0; i < n; i++) {
    const l0 = b3 + Math.round((rest * i) / n), l1 = i === n - 1 ? dur : b3 + Math.round((rest * (i + 1)) / n);
    const P = F.press[i + 3];
    ps.push({l0, l1, s0: P - 3.2, s1: P + 0.2, fade: 3});
  }
  return {ps, STAMP, press: [press1, press2, press3]};
};

export const Review: React.FC = () => {
  const id = 'review';
  const w = (x: string, n = 0) => wf(id, x, n);
  const f = useCurrentFrame();
  const {ps, STAMP, press} = reviewPlan();
  const F = FOOTAGE.review;
  return (
    <>
      <Pieces src={F.src} ps={ps} />
      {f < STAMP + 6 && <LaterStamp len={STAMP} />}
      <Chip text="Look" icon="eye" at={w('Look')} until={w('try') - 4} fill={C.sky} x={SLOT.x} y={SLOT.y} />
      <Chip text="Try to recall" icon="brain" at={w('try')} until={w('pinch') - 4} fill={C.butter} x={SLOT.x} y={SLOT.y} />
      <Chip text="Pinch to flip" icon="pinch" at={w('pinch')} until={w('Got') - 2} fill={C.lilac} x={SLOT.x} y={SLOT.y} />
      {press.map((p, i) => <Tap key={i} at={p - 2} x={F.tap[i][0]} y={F.tap[i][1]} />)}
    </>
  );
};

/** "Two days later" stamp on paper, retimed to ~1.2 s. */
const LaterStamp: React.FC<{len: number}> = ({len}) => {
  const f = useCurrentFrame();
  const t = T(f, 0, 12, back);
  const o = 1 - T(f, len - 2, 6);
  return (
    <Scene dur={len + 6} fadeIn={0} fadeOut={0}>
      <div style={{position: 'absolute', inset: 0, opacity: o, background: C.paper}}>
        <svg width={W} height={H} style={{position: 'absolute'}}>
          <g filter="url(#wob)">
            <circle cx={260} cy={420} r={70 * T(f, 4, 14, out)} fill={C.butter} />
            <circle cx={1680} cy={460} r={56 * T(f, 8, 14, out)} fill={C.lilac} />
            <Ink d="M620 640Q780 596 960 640T1300 634" p={T(f, 6, 20)} sw={9} />
          </g>
        </svg>
        <div style={{position: 'absolute', left: 0, right: 0, top: 330, textAlign: 'center', fontFamily: FD, fontWeight: 800, fontSize: 170,
          letterSpacing: -2, transform: `scale(${1.5 - 0.5 * t}) rotate(${(1 - t) * -4}deg)`, opacity: Math.min(1, 0.5 + t * 3)}}>Two days later</div>
      </div>
    </Scene>
  );
};

export const Done: React.FC = () => {
  const id = 'done';
  return (
    <>
      <Pieces src={FOOTAGE.done.src} ps={[{l0: 0, l1: durF(id), s0: FOOTAGE.done.from, s1: Math.min(FOOTAGE.done.len, FOOTAGE.done.from + durF(id) / 30)}]} />
      <Burst at={wf(id, 'know', 1)} x={960} y={380} r={330} n={12} />
    </>
  );
};

const TECH: [string, 'browser' | 'headset' | 'bolt' | 'eye' | 'house', string, number][] = [
  ['WebXR, in the browser', 'browser', C.sky, 0],
  ['Meta Quest', 'headset', C.butter, 1],
  ['Immersive Web SDK', 'bolt', C.mint, 2],
  ['Passthrough: your own room', 'eye', C.rose, 3],
  ['or a virtual room', 'house', C.lilac, 4],
];
export const Close: React.FC = () => {
  const id = 'close';
  const at = [wf(id, 'browser'), wf(id, 'Meta'), wf(id, 'Immersive'), wf(id, 'your', 0), wf(id, 'one')];
  // the card wipes in after the previous sentence ends, never over it, and at most 22 frames before "Stop"
  const tg = tagline();
  const L = (sec: number) => Math.round(sec * 30) - startF(id);
  const endAt = Math.min(L(tg.stop) - 1, Math.max(L(tg.prevEnd) + 1, L(tg.stop) - 22));
  return (
    <>
      <Pieces src={FOOTAGE.close.src} ps={easedPieces(0, endAt + 16, FOOTAGE.close.from, FOOTAGE.close.to, 0.25)} />
      {TECH.map(([t, ic, fill, i]) => (
        <Chip key={i} text={t} icon={ic} at={at[i]} fill={fill} size={36} x={SLOT.x} y={64 + i * 86} />
      ))}
      <Sequence from={endAt}><EndCard start={endAt} /></Sequence>
    </>
  );
};

const Star: React.FC<{x: number; y: number; s: number; col: string; rot?: number}> = ({x, y, s, col, rot = 0}) => (
  <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <path d="M0 -26L8 -8L26 0L8 8L0 26L-8 8L-26 0L-8 -8Z" fill={col} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
  </g>
);
const EndCard: React.FC<{start: number}> = ({start}) => {
  const f = useCurrentFrame();
  const tg = tagline();
  const g = (sec: number) => Math.round(sec * 30) - startF('close') - start;
  const wipe = T(f, 0, 14);
  const stop = g(tg.stop), memS = g(tg.memS), memE = g(tg.memE), strt = g(tg.strt), rem = g(tg.rem), remE = g(tg.remE);
  // a word that slams in exactly when it is spoken: invisible until its first frame
  const slam = (at: number, from = 2.1): React.CSSProperties => {
    const t = T(f, at, 11, back);
    return {opacity: f < at ? 0 : clamp((f - at + 1) / 2), transform: `scale(${from - (from - 1) * t}) rotate(${(1 - t) * -5}deg)`};
  };
  const shake = (at: number, amp = 10) => (f >= at && f < at + 14 ? Math.sin((f - at) * 2.4) * amp * (1 - (f - at) / 14) : 0);
  const sk = shake(memS, 6) + shake(strt, 6) + shake(rem, 14);
  // strike-through is drawn while "memorizing" is being said; highlight lands with "remembering"
  const strike = T(f, memS, Math.max(6, memE - memS), inOut);
  const mark = T(f, rem, Math.max(8, Math.min(14, remE - rem)));
  const beat = f >= rem ? f - rem : -1;
  const wd: React.CSSProperties = {display: 'inline-block', position: 'relative'};
  return (
    <div style={{position: 'absolute', inset: 0, clipPath: `circle(${wipe * 1500}px at 50% 50%)`}}>
      <Scene dur={9999} fadeIn={0} fadeOut={0}>
        <div style={{position: 'absolute', inset: 0, transform: `translate(${sk}px, ${sk * 0.5}px)`}}>
          <svg width={W} height={H} style={{position: 'absolute'}}>
            <g transform="translate(700 70) scale(0.95)" filter="url(#wob)"><Wordmark frame={f} start={4} stagger={5} dur={18} blobDelay={8} /></g>
            <g transform={`translate(1500 90) scale(${0.9 * T(f, rem, 14, back)}) translate(0 ${Math.sin(f / 9) * 5})`} filter="url(#wob)" opacity={f >= rem ? T(f, rem, 4) : 0}>
              <Castle p={1} f={1} />
            </g>
            {[[300, 650, C.butter, 0], [1620, 600, C.mint, 20], [260, 430, C.rose, 40], [1680, 400, C.lilac, 10], [520, 760, C.sky, 30], [1440, 770, C.butter, 50]].map(([x, y, c, ph], i) => {
              const s = beat >= 0 ? clamp((beat - i * 2) / 10) * (0.85 + 0.25 * Math.sin(f / 6 + i)) : 0;
              return <Star key={i} x={x as number} y={y as number} s={s} col={c as string} rot={f * 2 + (ph as number)} />;
            })}
          </svg>
          <div style={{position: 'absolute', left: 0, right: 0, top: 300, textAlign: 'center', fontFamily: FD, fontWeight: 800, fontSize: 158, lineHeight: 1.0, whiteSpace: 'nowrap'}}>
            <div style={{height: 190}}>
              <span style={{...wd, ...slam(stop), marginRight: '0.26em', color: C.ink}}>Stop</span>
              <span style={{...wd, ...slam(memS), color: strike > 0.5 ? C.inkSoft : C.ink}}>
                memorizing.
                <span style={{position: 'absolute', left: -10, top: '54%', height: 16, width: `${strike * 104}%`, background: C.rose, border: strike > 0 ? `4px solid ${C.ink}` : 'none', borderRadius: 10, transform: 'rotate(-3deg)'}} />
              </span>
            </div>
            <div style={{height: 200, marginTop: 8}}>
              <span style={{...wd, ...slam(strt), marginRight: '0.26em'}}>Start</span>
              <span style={{...wd, ...slam(rem, 2.6)}}>
                <span style={{position: 'absolute', left: -18, right: -18, top: '16%', bottom: '2%', background: C.butter, border: mark > 0 ? `5px solid ${C.ink}` : 'none', borderRadius: 24, zIndex: -1, transformOrigin: 'left', transform: `scaleX(${mark}) rotate(-1.5deg)`, boxShadow: mark > 0 ? `8px 9px 0 ${C.ink}` : 'none'}} />
                remembering.
              </span>
            </div>
          </div>
        </div>
        <Burst at={rem} x={960} y={620} n={16} r={620} />
        <Burst at={rem + 6} x={960} y={620} n={10} r={380} />
        <Ring at={rem} x={960} y={620} r={420} />
        <Ring at={rem + 7} x={960} y={620} r={320} color={C.purple} />
        <Burst at={memS} x={1060} y={400} n={7} r={260} />
        <Flash at={rem} dur={5} />
      </Scene>
    </div>
  );
};
