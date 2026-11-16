import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Room, KEYS, Key} from './house';
import {C, Ink, Scene, SW, T, W, H, back, clamp, ell, inOut, lerp, out} from './lib';

export const TURN_FRAMES = 300;
const MINI = 'M-150 80C-120 30-100 20-90-40L-90 80C-70 30-60 10-40-20L-40 80C-20 40-10 20 10 0L10 80C30 50 40 30 60-5L60 80';

export const Turn: React.FC = () => {
  const f = useCurrentFrame();
  const merge = T(f, 70, 70), push = T(f, 205, 95, inOut);
  const S = lerp(0.62, 0.8, merge) * lerp(1, 2.75, push);
  const X = lerp(600, 960, merge);
  const fillT = (i: number) => T(f, 140 + i * 9, 40);
  const p = () => T(f, 0, 50);
  const fl = (k: Key) => (k === 'roof' || k === 'shell' ? T(f, 140, 40) : fillT(KEYS.indexOf(k)));
  const dots: [number, number, string][] = [[360, 100, C.rose], [560, 60, C.butter], [800, 290, C.mint]];
  return (
    <Scene dur={TURN_FRAMES} fadeOut={0}>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <SW.Provider value={5 / Math.pow(S / 0.62, 0.55)}>
          <g transform={`translate(${X} 540) scale(${S}) translate(-540 -260)`} filter="url(#wob)">
            <Room p={p} f={fl} />
            {dots.map(([x, y, c], i) => {
              const t = T(f, 118 + i * 8, 26, back);
              return <circle key={i} cx={x} cy={y - (1 - t) * 90} r={22 * t} fill={c} stroke={C.ink} strokeWidth={5} opacity={1 - T(f, 150, 30)} />;
            })}
          </g>
        </SW.Provider>
        {/* the spaced-repetition idea, folding into the house */}
        <g transform={`translate(${lerp(1360, 960, merge)} 520) scale(${lerp(1, 0.25, merge)})`} opacity={(1 - T(f, 110, 30)) * T(f, 6, 24, out)} filter="url(#wob)">
          <Ink d={ell(0, 0, 230, 230)} p={0} f={1} fill={C.butter} />
          <Ink d="M-190 150V-170M-190 150H180" p={T(f, 12, 30)} sw={6} />
          <Ink d={MINI} p={T(f, 30, 40)} sw={9} />
        </g>
      </svg>
    </Scene>
  );
};
