import React, {createContext, useContext} from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {loadFont as loadDisplay} from '@remotion/google-fonts/BricolageGrotesque';
import {loadFont as loadBody} from '@remotion/google-fonts/Figtree';

// Mirrors src/theme.ts of the app (kept here so /video stays standalone).
export const C = {
  paper: '#FBF7F0', paperDeep: '#F1EADF', ink: '#2B2A33', inkSoft: '#6E6A78',
  rose: '#F4C7C3', butter: '#F7E3A1', mint: '#C8E6D0', sky: '#C7DDF2', lilac: '#DCCFF0',
  purple: '#B9A0E6', wall: '#F8E1DC', floor: '#F2DCA8',
};
export const FD = loadDisplay('normal', {weights: ['700', '800'], ignoreTooManyRequestsWarning: true}).fontFamily;
export const FB = loadBody('normal', {weights: ['500', '600'], ignoreTooManyRequestsWarning: true}).fontFamily;

export const W = 1920, H = 1080, FPS = 30;
export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
// Soft easings only: nothing in the videos moves linearly.
export const inOut = Easing.bezier(0.6, 0.02, 0.25, 1);
export const out = Easing.bezier(0.16, 0.84, 0.3, 1);
export const back = Easing.bezier(0.3, 1.35, 0.5, 1);
/** Eased 0..1 progress of `frame` over [start, start+dur]. */
export const T = (frame: number, start: number, dur: number, fn: (t: number) => number = inOut) =>
  fn(clamp((frame - start) / dur));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Stroke width in local units; scenes that zoom lower it so lines stay ink-weight on screen. */
export const SW = createContext(5);

/** One ink stroke that draws itself (dashoffset) plus an optional flat pastel fill. */
export const Ink: React.FC<{d: string; p?: number; f?: number; fill?: string; sw?: number; color?: string; dash?: string}> = ({
  d, p = 1, f = 0, fill = 'none', sw, color = C.ink, dash,
}) => {
  const w = useContext(SW);
  return (
    <>
      {f > 0 && <path d={d} fill={fill} opacity={f} />}
      {p > 0 && (
        <path d={d} fill="none" stroke={color} strokeWidth={sw ?? w} strokeLinecap="round" strokeLinejoin="round"
          {...(dash ? {strokeDasharray: dash} : {pathLength: 1, strokeDasharray: '1 1', strokeDashoffset: 1 - p})} />
      )}
    </>
  );
};

export const rr = (x: number, y: number, w: number, h: number, r = 14) =>
  `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
export const ell = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}Z`;

/** Scene shell: warm paper, soft fades in/out (never a hard cut), subtle hand-drawn wobble filter. */
export const Scene: React.FC<{dur: number; fadeIn?: number; fadeOut?: number; children: React.ReactNode}> = ({
  dur, fadeIn = 14, fadeOut = 16, children,
}) => {
  const f = useCurrentFrame();
  const o = Math.min(
    fadeIn ? Easing.out(Easing.quad)(clamp((f + 2) / fadeIn)) : 1,
    fadeOut ? Easing.out(Easing.quad)(clamp((dur - 1 - f) / fadeOut)) : 1,
  );
  return (
    <AbsoluteFill style={{background: C.paper, fontFamily: FB, color: C.ink}}>
      <svg width={0} height={0} style={{position: 'absolute'}}>
        <filter id="wob" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves={2} seed={4} />
          <feDisplacementMap in="SourceGraphic" scale={5} />
        </filter>
      </svg>
      <AbsoluteFill style={{opacity: o}}>{children}</AbsoluteFill>
    </AbsoluteFill>
  );
};

/** Small on-screen label pill, same look as the Studio nav pills. */
export const Label: React.FC<{text: string; at: number; x?: number; y?: number; fill?: string}> = ({
  text, at, x = 96, y = 72, fill = C.butter,
}) => {
  const f = useCurrentFrame();
  const t = T(f, at, 22, out);
  return (
    <div style={{
      position: 'absolute', left: x, top: y + (1 - t) * 14, opacity: t, padding: '12px 30px', borderRadius: 999,
      background: fill, border: `4px solid ${C.ink}`, boxShadow: `5px 6px 0 ${C.ink}`,
      fontFamily: FB, fontWeight: 600, fontSize: 38,
    }}>{text}</div>
  );
};

/** Castle doodle in a 200x170 box, like the app mark. p = draw progress, f = fill. */
export const Castle: React.FC<{p: number; f?: number}> = ({p, f = 0}) => (
  <g>
    <Ink d="M20 160V70H10V48H28V58H42V48H58V70H48V160" p={clamp(p * 1.6)} f={f} fill={C.rose} />
    <Ink d="M152 160V70H142V48H160V58H174V48H190V70H180V160" p={clamp(p * 1.6 - 0.3)} f={f} fill={C.sky} />
    <Ink d="M48 160V100H56V90H74V100H90V90H110V100H126V90H144V100H152V160" p={clamp(p * 1.6 - 0.2)} f={f} fill={C.lilac} />
    <Ink d="M80 160V132Q100 114 120 132V160" p={clamp(p * 1.6 - 0.6)} f={f} fill={C.butter} />
    <Ink d="M35 48V14L58 24L35 32" p={clamp(p * 1.6 - 0.9)} f={f} fill={C.butter} />
    <Ink d="M167 48V14L190 24L167 32" p={clamp(p * 1.6 - 1)} f={f} fill={C.mint} />
    <Ink d="M0 160H200" p={clamp(p * 1.6 - 0.1)} />
  </g>
);

/** LOCI wordmark drawn as fat ink strokes over pastel blobs. 760x180 box. */
export const Wordmark: React.FC<{frame: number; start?: number; stagger?: number; dur?: number; blobDelay?: number}> = ({frame, start = 0, stagger = 12, dur = 34, blobDelay = 18}) => {
  const cols = [C.rose, C.butter, C.sky, C.mint];
  const L = 'M20 10V160H110';
  const O = ell(205, 85, 62, 76);
  const Cc = 'M410 40A66 76 0 1 0 410 130';
  const I = 'M470 12V158';
  const paths = [L, O, Cc, I];
  const cx = [75, 205, 340, 470];
  const sw = 22;
  return (
    <g>
      {paths.map((d, i) => {
        const s = start + i * stagger;
        const blob = T(frame, s + blobDelay, 24, back);
        return (
          <g key={i}>
            <circle cx={cx[i]} cy={95} r={78 * blob} fill={cols[i]} />
            <Ink d={d} p={T(frame, s, dur)} sw={sw} />
          </g>
        );
      })}
    </g>
  );
};
