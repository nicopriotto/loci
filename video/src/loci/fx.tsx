import React from 'react';
import {AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame} from 'remotion';
import {C, FB, FD, T, W, H, back, clamp, inOut, out} from '../lib';

/** Camera keyframes: [frame, scale, cx, cy] (cx, cy = source point at screen centre). Eased between keys. */
export type Key4 = [number, number, number, number];
export const cam = (f: number, keys: Key4[]): [number, number, number] => {
  if (f <= keys[0][0]) return [keys[0][1], keys[0][2], keys[0][3]];
  for (let i = 1; i < keys.length; i++) {
    if (f <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      const t = inOut(clamp((f - a[0]) / Math.max(1, b[0] - a[0])));
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  const l = keys[keys.length - 1];
  return [l[1], l[2], l[3]];
};
export const camCss = (s: number, cx: number, cy: number): React.CSSProperties => ({
  position: 'absolute', left: 0, top: 0, width: W, height: H, transformOrigin: '0 0',
  transform: `translate(${W / 2}px, ${H / 2}px) scale(${s}) translate(${-cx}px, ${-cy}px)`,
});

/**
 * Footage segment. `from` = source seconds, `rate` = playback speed.
 * Camera keys are in local frames; coordinates are in 1920x1080 space (video is scaled to fill).
 */
export const VClip: React.FC<{
  src: string; from: number; rate?: number; keys?: Key4[]; clamped?: boolean; bg?: string; children?: React.ReactNode;
}> = ({src, from, rate = 1, keys = [[0, 1, W / 2, H / 2]], clamped = true, bg = '#000', children}) => {
  const f = useCurrentFrame();
  let [s, cx, cy] = cam(f, keys);
  if (clamped) {
    cx = clamp(cx, W / (2 * s), W - W / (2 * s));
    cy = clamp(cy, H / (2 * s), H - H / (2 * s));
  }
  return (
    <AbsoluteFill style={{background: bg, overflow: 'hidden'}}>
      <div style={camCss(s, cx, cy)}>
        <OffthreadVideo src={staticFile(`clips/${src}.mp4`)} startFrom={Math.round(from * 30)} playbackRate={rate} muted
          style={{width: W, height: H, objectFit: 'cover'}} />
      </div>
      {children}
    </AbsoluteFill>
  );
};

type IconName = 'doc' | 'pencil' | 'sparkle' | 'upload' | 'headset' | 'pin' | 'check' | 'cross' | 'eye' | 'pinch' | 'dots' | 'house' | 'browser' | 'brain' | 'bolt' | 'list';
export const Icon: React.FC<{n: IconName; size?: number; color?: string}> = ({n, size = 40, color = C.ink}) => {
  const p = {fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const};
  const d: Record<IconName, React.ReactNode> = {
    doc: <><path d="M6 3h8l5 5v13H6z" {...p} /><path d="M14 3v5h5M9 13h7M9 17h7" {...p} /></>,
    pencil: <><path d="M4 20l1-5L16 4l4 4L9 19z" {...p} /><path d="M14 6l4 4" {...p} /></>,
    sparkle: <><path d="M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" {...p} /><path d="M19 3v4M17 5h4" {...p} /></>,
    upload: <><path d="M12 16V5M7 10l5-5 5 5M5 20h14" {...p} /></>,
    headset: <><path d="M3 9h18v7a2 2 0 0 1-2 2h-3l-2-3h-4l-2 3H5a2 2 0 0 1-2-2z" {...p} /></>,
    pin: <><path d="M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z" {...p} /><circle cx="12" cy="10" r="2" {...p} /></>,
    check: <path d="M4 12l5 5L20 6" {...p} strokeWidth={3.4} />,
    cross: <path d="M5 5l14 14M19 5L5 19" {...p} strokeWidth={3.4} />,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" {...p} /><circle cx="12" cy="12" r="3" {...p} /></>,
    pinch: <><path d="M8 20c-3-3-3-6-1-9l2-3M9 8c1-2 3-2 3 0v2M12 10c1-2 4-1 3 1M15 11c2-1 3 0 2 2l-1 3c-1 3-4 4-8 4" {...p} /></>,
    dots: <><circle cx="5" cy="12" r="1.6" fill={color} /><circle cx="12" cy="12" r="1.6" fill={color} /><circle cx="19" cy="12" r="1.6" fill={color} /></>,
    house: <><path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6" {...p} /></>,
    browser: <><rect x="3" y="4" width="18" height="16" rx="3" {...p} /><path d="M3 9h18" {...p} /></>,
    brain: <><path d="M12 5c-2-2-6-1-6 3-2 1-2 4 0 5 0 3 3 5 6 4zM12 5c2-2 6-1 6 3 2 1 2 4 0 5 0 3-3 5-6 4z" {...p} /></>,
    bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" {...p} />,
    list: <><path d="M9 6h11M9 12h11M9 18h11" {...p} /><circle cx="4.5" cy="6" r="1.2" fill={color} /><circle cx="4.5" cy="12" r="1.2" fill={color} /><circle cx="4.5" cy="18" r="1.2" fill={color} /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" style={{flex: 'none'}}>{d[n]}</svg>;
};

/** Pop-in chip with the Studio look: pastel fill, ink border, hard shadow. Local frame `at` = when it lands. */
export const Chip: React.FC<{
  text?: string; at: number; until?: number; icon?: IconName; fill?: string; size?: number; rot?: number;
  x?: number; y?: number; flow?: boolean; children?: React.ReactNode; from?: 'top' | 'left' | 'right' | 'pop';
}> = ({text, at, until, icon, fill = C.butter, size = 44, rot = 0, x = 0, y = 0, flow, children, from = 'pop'}) => {
  const f = useCurrentFrame();
  const t = T(f, at, 14, back);
  const o = Math.min(f < at ? 0 : clamp((f - at + 1) / 3), until ? 1 - T(f, until, 8, inOut) : 1);
  if (o <= 0 && !flow) return null;
  const dx = from === 'left' ? -(1 - t) * 160 : from === 'right' ? (1 - t) * 160 : 0;
  const dy = from === 'top' ? -(1 - t) * 120 : 0;
  const sc = from === 'pop' ? 0.4 + 0.6 * t : 1;
  return (
    <div style={{
      position: flow ? 'relative' : 'absolute', left: flow ? undefined : x, top: flow ? undefined : y, opacity: o,
      transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg) scale(${sc})`, transformOrigin: 'center',
      display: 'flex', alignItems: 'center', gap: 14, padding: `${size * 0.26}px ${size * 0.7}px`, borderRadius: 999,
      background: fill, border: `4px solid ${C.ink}`, boxShadow: `5px 6px 0 ${C.ink}`, fontFamily: FB, fontWeight: 600, fontSize: size,
      whiteSpace: 'nowrap', color: C.ink, lineHeight: 1.1,
    }}>
      {icon && <Icon n={icon} size={size * 0.95} />}
      {text}
      {children}
    </div>
  );
};

/** "or" bubble between two options. */
export const Or: React.FC<{at: number; until?: number}> = ({at, until}) => {
  const f = useCurrentFrame();
  const t = T(f, at, 12, back);
  const o = Math.min(f < at ? 0 : clamp((f - at + 1) / 3), until ? 1 - T(f, until, 8, inOut) : 1);
  return (
    <div style={{
      transform: `scale(${0.3 + 0.7 * t}) rotate(${(1 - t) * -30}deg)`, opacity: o, width: 64, height: 64, borderRadius: 999,
      background: C.paper, border: `4px solid ${C.ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FD, fontWeight: 800, fontSize: 32, flex: 'none',
    }}>or</div>
  );
};

/** Absolutely placed flex row for chips. */
export const Row: React.FC<{x: number; y: number; gap?: number; right?: boolean; children: React.ReactNode}> = ({x, y, gap = 18, right, children}) => (
  <div style={{position: 'absolute', top: y, ...(right ? {right: x} : {left: x}), display: 'flex', alignItems: 'center', gap}}>{children}</div>
);

/** Expanding ink ring (tap / land feedback). */
export const Ring: React.FC<{at: number; x: number; y: number; r?: number; color?: string; dur?: number}> = ({at, x, y, r = 90, color = C.ink, dur = 16}) => {
  const f = useCurrentFrame();
  const t = (f - at) / dur;
  if (t < 0 || t > 1) return null;
  const e = out(t);
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
      <circle cx={x} cy={y} r={r * (0.3 + 0.9 * e)} fill="none" stroke={color} strokeWidth={8 * (1 - t) + 2} opacity={1 - t} />
    </svg>
  );
};

/** Little pastel confetti burst around (x, y). */
export const Burst: React.FC<{at: number; x: number; y: number; n?: number; r?: number; dur?: number}> = ({at, x, y, n = 10, r = 200, dur = 26}) => {
  const f = useCurrentFrame();
  const t = (f - at) / dur;
  if (t < 0 || t > 1) return null;
  const cols = [C.rose, C.butter, C.mint, C.sky, C.lilac, C.purple];
  return (
    <svg width={W} height={H} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
      {Array.from({length: n}, (_, i) => {
        const a = (i / n) * Math.PI * 2 + 0.4 * (i % 3);
        const d = r * (0.55 + 0.45 * ((i * 37) % 10) / 10) * out(t);
        return <circle key={i} cx={x + Math.cos(a) * d} cy={y + Math.sin(a) * d + t * 24} r={(i % 2 ? 11 : 16) * (1 - t * 0.6)}
          fill={cols[i % cols.length]} stroke={C.ink} strokeWidth={3.5} opacity={1 - t * t} />;
      })}
    </svg>
  );
};

/** Quick paper-white flash used on hard cuts. */
export const Flash: React.FC<{at: number; dur?: number; color?: string}> = ({at, dur = 6, color = C.paper}) => {
  const f = useCurrentFrame();
  const t = (f - at) / dur;
  if (t < 0 || t > 1) return null;
  return <AbsoluteFill style={{background: color, opacity: 0.85 * (1 - t), pointerEvents: 'none'}} />;
};

/** Plain pop transform helper for SVG groups. */
export const popScale = (f: number, at: number, dur = 16) => 0.2 + 0.8 * T(f, at, dur, back);
