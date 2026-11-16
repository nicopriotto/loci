import React from 'react';
import {C, Ink, ell, rr} from './lib';

/** House cross-section in local coords: interior (0,0)-(1080,520), roof apex (540,-230). */
export const KEYS = ['shell', 'roof', 'window', 'sofa', 'lamp', 'frame', 'table', 'plant', 'rug'] as const;
export type Key = (typeof KEYS)[number];
type Get = (k: Key) => number;

export const Room: React.FC<{p: Get; f: Get}> = ({p, f}) => (
  <g>
    <Ink d="M0 0H1080V520H0Z" p={p('shell')} f={f('shell')} fill={C.wall} />
    <Ink d="M0 430H1080V520H0Z" p={p('shell')} f={f('shell')} fill={C.floor} />
    <Ink d="M-120 540H1200" p={p('shell')} />
    <Ink d="M-70 0L540 -230L1150 0Z" p={p('roof')} f={f('roof')} fill={C.lilac} />
    <Ink d="M880 -100V-190H960V-62" p={p('roof')} f={f('roof')} fill={C.rose} />
    <Ink d={ell(800, 478, 250, 26)} p={p('rug')} f={f('rug')} fill={C.rose} />
    <Ink d={rr(70, 70, 220, 210, 8)} p={p('window')} f={f('window')} fill={C.sky} />
    <Ink d="M180 70V280M70 175H290M55 285H305" p={p('window')} />
    <Ink d="M45 345Q45 335 70 335H280Q305 335 305 345V430H45Z" p={p('sofa')} f={f('sofa')} fill={C.lilac} />
    <Ink d={rr(30, 372, 50, 58, 18) + rr(270, 372, 50, 58, 18)} p={p('sofa')} f={f('sofa')} fill={C.mint} />
    <Ink d="M330 430H390M360 430V215" p={p('lamp')} sw={7} />
    <Ink d="M310 215L330 140H390L410 215Z" p={p('lamp')} f={f('lamp')} fill={C.butter} />
    <Ink d={rr(470, 80, 180, 130, 6)} p={p('frame')} f={f('frame')} fill={C.paper} />
    <Ink d={rr(488, 98, 144, 94, 4)} p={p('frame')} f={f('frame')} fill={C.mint} />
    <Ink d="M488 178L530 134L562 164L588 144L632 184" p={p('frame')} />
    <Ink d={rr(650, 330, 300, 24, 8)} p={p('table')} f={f('table')} fill={C.sky} />
    <Ink d="M685 354V430M915 354V430" p={p('table')} sw={8} />
    <Ink d="M990 430L1000 398H1040L1050 430Z" p={p('plant')} f={f('plant')} fill={C.rose} />
    <Ink d="M1020 398C985 350 990 300 1015 262C1050 300 1050 350 1020 398Z" p={p('plant')} f={f('plant')} fill={C.mint} />
    <Ink d="M1020 398C1050 380 1070 350 1068 316C1040 330 1022 360 1020 398Z" p={p('plant')} f={f('plant')} fill={C.mint} />
  </g>
);

const WOOD = '#D99A55', WOOD_D = '#A9703A', STEEL = '#C9D0DA', STEEL_D = '#97A1B0', DIRT = '#C9A06A';
/** Clear shovel drawn horizontally: D-grip at x=0, long wooden shaft, steel ferrule, spade blade at x~850. Total ~870 x 112. */
export const Shovel: React.FC<{o?: number}> = ({o = 1}) => (
  <g opacity={o} strokeLinejoin="round" strokeLinecap="round">
    {/* D grip (closed loop, straight side toward the shaft) */}
    <path d="M104 -38H42Q2 -38 2 0Q2 38 42 38H104Z" fill="none" stroke={C.ink} strokeWidth={42} />
    <path d="M104 -38H42Q2 -38 2 0Q2 38 42 38H104Z" fill="none" stroke={WOOD} strokeWidth={28} />
    {/* shaft */}
    <path d={rr(96, -19, 450, 38, 12)} fill={WOOD} stroke={C.ink} strokeWidth={6} />
    <path d="M150 -5H500" stroke={WOOD_D} strokeWidth={4} />
    <path d="M190 8H420" stroke={WOOD_D} strokeWidth={3} />
    {/* ferrule */}
    <path d={rr(540, -28, 58, 56, 8)} fill={STEEL} stroke={C.ink} strokeWidth={6} />
    <path d="M562 -28V28M580 -28V28" stroke={STEEL_D} strokeWidth={4} />
    {/* spade blade */}
    <path d="M598 -38L624 -66H700Q810 -64 858 -16Q870 0 858 16Q810 64 700 66H624L598 38Z" fill={STEEL} stroke={C.ink} strokeWidth={7} />
    <path d="M636 -40H706Q786 -38 822 -10" fill="none" stroke="#FFFFFF" strokeWidth={7} opacity={0.8} />
    <path d="M606 0H836" stroke={STEEL_D} strokeWidth={5} />
  </g>
);

/** Purple elephant shoveling with its trunk. Origin = between its feet at the base. Shovel held in front, blade digging a dirt pile. */
export const Elephant: React.FC<{p: number; f: number; frame: number}> = ({p, f, frame}) => {
  const P: [number, number] = [-226, -98]; // where the trunk grips the shaft
  const swing = Math.sin(frame / 8) * 8 - 2;
  const dirt = [0, 1, 2, 3].map((i) => {
    const ph = ((frame / 28 + i * 0.25) % 1);
    return {x: -285 - ph * 110, y: 96 - Math.sin(ph * Math.PI) * 150 + ph * 30, o: Math.sin(ph * Math.PI)};
  });
  return (
    <g>
      <Ink d={rr(25, 40, 38, 80, 14) + rr(-75, 40, 38, 80, 14)} p={p} f={f} fill={C.purple} />
      <Ink d="M105 -4Q150 -20 140 -52Q135 -30 110 -30" p={p} f={0} />
      <Ink d={ell(0, -20, 120, 82)} p={p} f={f} fill={C.purple} />
      <Ink d={rr(-35, 40, 38, 80, 14) + rr(65, 40, 38, 80, 14)} p={p} f={f} fill={C.purple} />
      <Ink d={ell(-112, -50, 56, 52)} p={p} f={f} fill={C.purple} />
      <Ink d="M-86 -92Q-40 -128 -22 -70Q-22 -22 -64 -26Q-96 -44 -86 -92Z" p={p} f={f} fill={C.lilac} />
      {f > 0 && (
        <g opacity={f}>
          <path d="M-352 122Q-338 70 -292 80Q-250 66 -228 122Z" fill={DIRT} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
          <g transform={`rotate(${swing} ${P[0]} ${P[1]})`}>
            <g transform="translate(-195 -205) rotate(107) scale(0.39)"><Shovel /></g>
          </g>
          {/* trunk reaching up to grip the shaft */}
          <path d={`M-156 -30Q-206 -22 ${P[0]} ${P[1]}`} fill="none" stroke={C.ink} strokeWidth={46} strokeLinecap="round" />
          <path d={`M-156 -30Q-206 -22 ${P[0]} ${P[1]}`} fill="none" stroke={C.purple} strokeWidth={36} strokeLinecap="round" />
          <path d="M-232 -96Q-216 -88 -222 -72" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
          <circle cx={-128} cy={-62} r={6} fill={C.ink} />
          {dirt.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={9} fill={i % 2 ? DIRT : C.butter} stroke={C.ink} strokeWidth={3} opacity={d.o} />
          ))}
        </g>
      )}
    </g>
  );
};
