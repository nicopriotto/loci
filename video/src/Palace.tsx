import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Elephant, Room, Key} from './house';
import {C, FD, Ink, Label, Scene, SW, T, W, H, back, clamp, lerp, rr} from './lib';

export const PALACE_FRAMES = 690;
// start frame and duration (draw) per room element
const AT: Record<Key, number> = {shell: 14, roof: 70, rug: 130, window: 118, sofa: 140, lamp: 160, frame: 175, table: 190, plant: 205};
const DUR: Record<Key, number> = {shell: 60, roof: 50, rug: 30, window: 40, sofa: 40, lamp: 30, frame: 34, table: 34, plant: 30};

const Card: React.FC<{x: number; y: number; w: number; text: string; fill: string; t: number}> = ({x, y, w, text, fill, t}) => (
  <g transform={`translate(${x} ${y - (1 - t) * 260})`} opacity={clamp(t * 3)}>
    <path d={rr(5, 6, w, 64, 12)} fill={C.ink} />
    <path d={rr(0, 0, w, 64, 12)} fill={fill} stroke={C.ink} strokeWidth={4} />
    <text x={w / 2} y={43} textAnchor="middle" fontFamily={FD} fontWeight={700} fontSize={30} fill={C.ink}>{text}</text>
  </g>
);

export const Palace: React.FC = () => {
  const f = useCurrentFrame();
  const push = T(f, 440, 130);
  const S = lerp(1, 1.75, push);
  const cx = lerp(540, 790, push), cy = lerp(260, 250, push);
  const p = (k: Key) => T(f, AT[k], DUR[k]);
  const fl = (k: Key) => T(f, AT[k] + DUR[k] * 0.6, 30);
  const c1 = T(f, 215, 40, back), c2 = T(f, 275, 40, back), sh = T(f, 340, 45, back);
  const morph = T(f, 440, 70);
  return (
    <Scene dur={PALACE_FRAMES}>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <SW.Provider value={5 / Math.pow(S, 0.6)}>
          <g transform={`translate(${W / 2} ${H / 2}) scale(${S}) translate(${-cx} ${-cy})`} filter="url(#wob)">
            <Room p={p} f={fl} />
            <Card x={290} y={42} w={140} text="Energy" fill={C.rose} t={c1} />
            <Card x={500} y={-8} w={120} text="DNA" fill={C.lilac} t={c2} />
            {/* a boring shovel lands on the table, then morphs */}
            <g transform={`translate(0 ${(1 - sh) * -230}) translate(800 322) scale(${1 - morph * 0.35}) translate(-800 -322)`} opacity={clamp(sh * 3) * (1 - morph)}>
              <Ink d="M700 316H850" p={sh} sw={7} color={C.inkSoft} />
              <Ink d="M700 306V326" p={sh} sw={7} color={C.inkSoft} />
              <Ink d="M850 304H900Q912 316 900 328H850Z" p={sh} f={sh} fill={C.paperDeep} color={C.inkSoft} />
            </g>
            <g transform={`translate(830 218) scale(${0.3 + 0.52 * T(f, 450, 50, back)})`} opacity={clamp(T(f, 450, 70) * 2)}>
              <Elephant p={T(f, 450, 70)} f={T(f, 490, 40)} frame={Math.max(0, f - 520)} />
            </g>
          </g>
        </SW.Provider>
      </svg>
      <Label text="Method of loci" at={24} />
    </Scene>
  );
};
