import React from 'react';
import {useCurrentFrame} from 'remotion';
import {C, FB, FD, Ink, Label, Scene, T, W, H, back, clamp, inOut, out} from './lib';

export const SPACED_FRAMES = 510;
const X0 = 220, XW = 1480, Y0 = 690, YH = 400, XMAX = 12;
const sx = (t: number) => X0 + (t / XMAX) * XW;
const sy = (v: number) => Y0 - v * YH;
// review times (spread further apart) and decay rates (slower each time)
const REV = [0, 1.1, 2.9, 5.6, 9.2, 12];
const K = [1.5, 0.95, 0.6, 0.38, 0.22];
const SEG_START = [110, 160, 215, 280, 355], SEG_DUR = [50, 55, 65, 75, 95];
const seg = (i: number, p = 1) => {
  const t0 = REV[i], t1 = t0 + (REV[i + 1] - t0) * p;
  const n = Math.max(2, Math.round(40 * p));
  return 'M' + Array.from({length: n + 1}, (_, j) => {
    const t = t0 + ((t1 - t0) * j) / n;
    return `${sx(t)} ${sy(Math.exp(-K[i] * (t - t0)) * 0.96 + 0.0)}`;
  }).join('L');
};
const full = (() => {
  return 'M' + Array.from({length: 61}, (_, j) => `${sx((j / 60) * XMAX)} ${sy(Math.exp(-1.5 * (j / 60) * XMAX) * 0.96)}`).join('L');
})();

export const Spaced: React.FC = () => {
  const f = useCurrentFrame();
  const colors = [C.rose, C.butter, C.mint, C.sky, C.lilac];
  return (
    <Scene dur={SPACED_FRAMES}>
      <Label text="Spaced repetition" at={20} fill={C.mint} />
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g filter="url(#wob)">
          <Ink d={`M${X0} ${Y0 - YH - 40}V${Y0}H${X0 + XW + 30}`} p={T(f, 14, 40)} />
          {/* the curve with no review */}
          <Ink d={full} p={T(f, 40, 90)} sw={7} color={C.inkSoft} dash="1 18" />
          {REV.slice(0, 5).map((_, i) => {
            const s = SEG_START[i], d = SEG_DUR[i];
            const p = T(f, s, d);
            const jump = i > 0 ? T(f, s - 12, 14) : 0;
            const x = sx(REV[i]);
            const t = REV[i] + (REV[i + 1] - REV[i]) * p;
            const dotY = sy(Math.exp(-K[i] * (t - REV[i])) * 0.96);
            return (
              <g key={i}>
                {i > 0 && <Ink d={`M${x} ${sy(Math.exp(-K[i - 1] * (REV[i] - REV[i - 1])) * 0.96)}V${sy(0.96)}`} p={jump} sw={6} dash="0.01 14" />}
                {p > 0 && <Ink d={`${seg(i, p)}V${Y0}H${x}Z`} p={0} f={0.7 * T(f, s + d * 0.4, 40)} fill={colors[i]} />}
                {p > 0 && <Ink d={seg(i, p)} p={1} sw={9} dash="9999 0" />}
                {f >= s && f < s + d + 12 && <circle cx={sx(t)} cy={dotY} r={16} fill={C.butter} stroke={C.ink} strokeWidth={5} />}
              </g>
            );
          })}
        </g>
        {/* timeline of reviews */}
        <g filter="url(#wob)">
          <Ink d={`M${X0} 820H${X0 + XW}`} p={T(f, 20, 50)} sw={5} />
          {REV.slice(0, 5).map((r, i) => {
            const t = T(f, i === 0 ? 120 : SEG_START[i] - 6, 24, back);
            return (
              <g key={i} transform={`translate(${sx(r)} 820) scale(${t})`}>
                <path d="M0 0V-46" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
                <path d="M0 -46H30L22 -33L30 -20H0Z" fill={colors[i]} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
                <circle cx={0} cy={0} r={11} fill={C.ink} />
              </g>
            );
          })}
          {[1.1, 2.9, 5.6, 9.2].map((r, i) => {
            const a = T(f, SEG_START[i + 1] + 14, 30);
            return <Ink key={i} d={`M${sx(REV[i]) + 24} 850Q${(sx(REV[i]) + sx(r)) / 2} 884 ${sx(r) - 14} 850`} p={a} sw={4} color={C.inkSoft} />;
          })}
        </g>
        <text x={X0 + 6} y={Y0 + 62} fontFamily={FB} fontWeight={600} fontSize={32} fill={C.inkSoft} opacity={T(f, 30, 20)}>time</text>
        <text x={X0 - 10} y={Y0 - YH - 62} fontFamily={FB} fontWeight={600} fontSize={32} fill={C.inkSoft} opacity={T(f, 30, 20)}>what you remember</text>
        <text x={sx(3.8)} y={sy(0.12) - 20} fontFamily={FD} fontWeight={700} fontSize={34} fill={C.inkSoft} opacity={T(f, 100, 30) * (1 - T(f, 150, 30))}>no review</text>
        <text x={sx(0.1)} y={Y0 + 150} fontFamily={FB} fontWeight={600} fontSize={0} />
      </svg>
    </Scene>
  );
};
