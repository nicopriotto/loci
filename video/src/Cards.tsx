import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Castle, C, FB, FD, Ink, Scene, T, Wordmark, W, H, out} from './lib';

export const LATER_FRAMES = 120;
export const END_FRAMES = 240;
/** Easy to change: shown on the end card. */
export const URL_TEXT = 'loci.vercel.app';
export const STACK_TEXT = 'Built with the Immersive Web SDK  ·  WebXR  ·  Meta Quest';
export const TAGLINE = ['Stop memorizing.', 'Start remembering.'];

export const Later: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene dur={LATER_FRAMES} fadeIn={16} fadeOut={16}>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g filter="url(#wob)">
          <circle cx={W / 2 - 640} cy={470} r={34 * T(f, 20, 40, out)} fill={C.butter} />
          <circle cx={W / 2 + 640} cy={470} r={28 * T(f, 28, 40, out)} fill={C.lilac} />
          <Ink d="M700 640Q820 596 940 640T1180 634T1220 626" p={T(f, 34, 50)} sw={8} />
        </g>
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, top: 380, textAlign: 'center', fontFamily: FD, fontWeight: 800, fontSize: 150,
        letterSpacing: -2, opacity: T(f, 6, 30, out), transform: `translateY(${(1 - T(f, 6, 30, out)) * 24}px)`}}>
        Two days later
      </div>
    </Scene>
  );
};

export const End: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Scene dur={END_FRAMES} fadeIn={14} fadeOut={0}>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g transform="translate(715 270)" filter="url(#wob)"><Wordmark frame={f} /></g>
        <g transform="translate(870 80) scale(0.9)" opacity={T(f, 28, 16, out)} filter="url(#wob)"><Castle p={T(f, 26, 40)} f={T(f, 90, 40)} /></g>
      </svg>
      <div style={{position: 'absolute', left: 0, right: 0, top: 510, textAlign: 'center', fontFamily: FD, fontWeight: 800, fontSize: 84, lineHeight: 1.18}}>
        {TAGLINE.map((l, i) => {
          const t = T(f, 70 + i * 24, 30, out);
          return <div key={i} style={{opacity: t, transform: `translateY(${(1 - t) * 20}px)`}}>{l}</div>;
        })}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 770, textAlign: 'center', fontSize: 32, fontWeight: 500, color: C.inkSoft, opacity: T(f, 140, 30, out), whiteSpace: 'pre'}}>
        {STACK_TEXT}
      </div>
      <div style={{position: 'absolute', left: 0, right: 0, top: 828, display: 'flex', justifyContent: 'center', opacity: T(f, 160, 30, out)}}>
        <div style={{padding: '10px 34px', borderRadius: 999, background: C.butter, border: `4px solid ${C.ink}`, boxShadow: `5px 6px 0 ${C.ink}`, fontWeight: 600, fontSize: 36}}>{URL_TEXT}</div>
      </div>
    </Scene>
  );
};
