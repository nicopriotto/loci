import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FB, FD, Ink, Label, Scene, T, W, H, clamp, inOut, out} from './lib';

export const PROBLEM_FRAMES = 450;
const LINES = [
  ['Mitochondria', 'make', 'most', 'of', 'the', 'energy'],
  ['The', 'nucleus', 'holds', 'the', 'DNA'],
  ['Ribosomes', 'build', 'proteins'],
  ['The', 'Golgi', 'packs', 'and', 'ships', 'them'],
  ['Membranes', 'decide', 'what', 'gets', 'in'],
  ['Lysosomes', 'recycle', 'old', 'parts'],
];
// deterministic scatter so words vanish in an organic order
const thr = (i: number) => (((i * 7919 + 13) % 31) / 31) * 0.8 + 0.1;
const AX = 1010, AY = 780, AW = 760, AH = 480;
const mem = (x: number) => Math.exp(-3.1 * x) * 0.92 + 0.04; // x in 0..1
const pt = (x: number) => `${AX + x * AW} ${AY - mem(x) * AH}`;
const CURVE = 'M' + Array.from({length: 61}, (_, i) => pt(i / 60)).join('L');

export const Problem: React.FC = () => {
  const f = useCurrentFrame();
  const draw = T(f, 120, 270); // curve drawing, drives the erasing
  let n = 0;
  return (
    <Scene dur={PROBLEM_FRAMES}>
      <Label text="Reading, then forgetting" at={20} />
      <div style={{
        position: 'absolute', left: 120, top: 190, width: 800, height: 640, background: '#FFFDF8', border: `4px solid ${C.ink}`,
        borderRadius: 18, boxShadow: `10px 12px 0 ${C.ink}`, transform: 'rotate(-1.4deg)', opacity: T(f, 6, 24, out), padding: '52px 56px', boxSizing: 'border-box',
      }}>
        <div style={{fontFamily: FD, fontWeight: 800, fontSize: 50, marginBottom: 26, opacity: 1 - T(f, 150, 200)}}>Cell biology</div>
        {LINES.map((line, li) => (
          <div key={li} style={{display: 'flex', gap: 14, fontSize: 38, fontWeight: 500, lineHeight: '66px', whiteSpace: 'nowrap'}}>
            {line.map((w, wi) => {
              const idx = n++;
              const appear = T(f, 30 + idx * 2.5, 18, out);
              const e = clamp((draw - thr(idx)) / 0.16);
              const hl = idx % 4 === 1 ? T(f, 90 + idx, 18) * (1 - e) : 0;
              return (
                <span key={wi} style={{
                  position: 'relative', opacity: appear * (1 - e), filter: `blur(${e * 7}px)`,
                  transform: `translateY(${(1 - appear) * 8 + e * 6}px) scale(${1 + e * 0.06})`, color: e > 0 ? C.inkSoft : C.ink,
                }}>
                  <span style={{position: 'absolute', left: -4, right: -4, top: 12, bottom: 10, background: C.butter, opacity: hl, zIndex: -1, borderRadius: 6}} />
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g filter="url(#wob)">
          <Ink d={`M${AX} ${AY - AH - 30}V${AY}H${AX + AW + 20}`} p={T(f, 100, 40)} />
          <Ink d={`${CURVE}L${AX + AW} ${AY}L${AX} ${AY}Z`} p={0} f={0.9 * T(f, 330, 70)} fill={C.rose} />
          <Ink d={CURVE} p={draw} sw={9} />
          <circle cx={AX + draw * AW} cy={AY - mem(draw) * AH} r={draw > 0 ? 16 : 0} fill={C.butter} stroke={C.ink} strokeWidth={5} />
        </g>
        <text x={AX + 4} y={AY + 58} fontFamily={FB} fontWeight={600} fontSize={34} fill={C.inkSoft} opacity={T(f, 120, 20)}>time</text>
        <text x={AX - 28} y={AY - AH - 50} fontFamily={FB} fontWeight={600} fontSize={34} fill={C.inkSoft} opacity={T(f, 120, 20)}>what you remember</text>
        <text x={AX + 150} y={AY - AH + 40} fontFamily={FD} fontWeight={700} fontSize={40} fill={C.inkSoft} opacity={T(f, 150, 40, inOut) * 0.8}>1885</text>
      </svg>
    </Scene>
  );
};
