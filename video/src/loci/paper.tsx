import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Elephant, Key, KEYS, Room, Shovel} from '../house';
import {C, Castle, FB, FD, Ink, Label, Scene, SW, T, W, H, Wordmark, back, clamp, ell, inOut, lerp, out, rr} from '../lib';
import {Burst, Chip, Flash, Icon, Key4, Ring, VClip, cam} from './fx';
import {durF, wf} from './t';

/* ------------------------------------------------------------------ helpers */
const catmull = (pts: [number, number][], seg = 14): [number, number][] => {
  const o: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < seg; j++) {
      const t = j / seg, t2 = t * t, t3 = t2 * t;
      o.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  o.push(pts[pts.length - 1]);
  return o;
};
const cum = (poly: [number, number][]) => {
  const L = [0];
  for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  return L;
};
const atLen = (poly: [number, number][], L: number[], d: number): [number, number] => {
  for (let i = 1; i < poly.length; i++) {
    if (L[i] >= d) {
      const t = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
      return [lerp(poly[i - 1][0], poly[i][0], t), lerp(poly[i - 1][1], poly[i][1], t)];
    }
  }
  return poly[poly.length - 1];
};
const bump = (f: number, at: number, dur = 14) => {
  const t = (f - at) / dur;
  return t < 0 || t > 1 ? 0 : Math.sin(t * Math.PI);
};

/** Big "Trick N" sticker. Word pops at `wordAt`, the numeral stamps exactly at `at`, then it flies to the top-left at `until`. */
const NumSticker: React.FC<{n: string; wordAt: number; at: number; until: number; cx?: number; top?: number}> = ({n, wordAt, at, until, cx = 960, top = 150}) => {
  const f = useCurrentFrame();
  if (f < wordAt) return null;
  const tw = T(f, wordAt, 12, back);
  const ghost = T(f, wordAt, 8, out) * (1 - T(f, at, 3));
  const tn = T(f, at, 12, back);
  const e = T(f, until, 11, inOut);
  const o = 1 - T(f, until + 5, 6);
  if (o <= 0) return null;
  const sparkle = f >= at ? 1 : 0;
  return (
    <>
      <div style={{
        position: 'absolute', left: cx - 500, width: 1000, top, textAlign: 'center', opacity: o,
        transform: `translate(${-(cx - 160) * e}px, ${-170 * e}px) scale(${1 - 0.78 * e})`, transformOrigin: 'center top',
      }}>
        <div style={{height: 176, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', fontFamily: FD, fontWeight: 800, fontSize: 104, lineHeight: 1, marginBottom: 0, transform: `scale(${0.3 + 0.7 * tw}) rotate(${(1 - tw) * -14}deg)`, opacity: clamp(tw * 3)}}>Trick</div>
        <div style={{position: 'relative', display: 'block', margin: '0 auto', width: 330, height: 330}}>
          <div style={{position: 'absolute', inset: 0, borderRadius: 999, border: `8px dashed ${C.inkSoft}`, opacity: ghost * 0.8, transform: `scale(${0.8 + 0.2 * ghost})`}} />
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 999, background: C.butter, border: `9px solid ${C.ink}`, boxShadow: `12px 14px 0 ${C.ink}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FD, fontWeight: 800, fontSize: 250, lineHeight: 1,
            transform: `scale(${0.1 + 0.9 * tn}) rotate(${(1 - tn) * 24}deg)`, opacity: clamp(tn * 4),
          }}>{n}</div>
          {sparkle > 0 && [0, 1, 2, 3, 4].map((i) => {
            const a = (i / 5) * Math.PI * 2 + f / 30;
            const s = clamp((f - at - i * 2) / 10);
            return (
              <svg key={i} width={60} height={60} viewBox="-30 -30 60 60" style={{position: 'absolute', left: 165 + Math.cos(a) * 215 - 30, top: 165 + Math.sin(a) * 215 - 30, transform: `scale(${s * (0.8 + 0.3 * Math.sin(f / 5 + i))}) rotate(${f * 3 + i * 20}deg)`}}>
                <path d="M0 -24L7 -7L24 0L7 7L0 24L-7 7L-24 0L-7 -7Z" fill={[C.rose, C.butter, C.mint, C.sky, C.lilac][i]} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
              </svg>
            );
          })}
        </div>
      </div>
      <Burst at={at} x={cx} y={top + 341} n={12} r={420} />
      <Ring at={at} x={cx} y={top + 341} r={175} />
    </>
  );
};
/** Persistent small "Trick N" chip + topic label shown after the sticker has flown away. */
const TrickTag: React.FC<{n: string; at: number; until?: number}> = ({n, at, until}) => (
  <Chip text={`Trick ${n}`} icon="bolt" at={at} until={until} fill={C.butter} size={40} x={96} y={64} />
);

/* ------------------------------------------------------------------ 2 problem */
const LINES = [
  ['Mitochondria', 'make', 'most', 'of', 'the', 'energy'],
  ['The', 'nucleus', 'holds', 'the', 'DNA'],
  ['Ribosomes', 'build', 'proteins'],
  ['The', 'Golgi', 'packs', 'and', 'ships', 'them'],
  ['Membranes', 'decide', 'what', 'gets', 'in'],
  ['Lysosomes', 'recycle', 'old', 'parts'],
];
const thr = (i: number) => (((i * 7919 + 13) % 31) / 31) * 0.8 + 0.1;
const AX = 1010, AY = 780, AW = 760, AH = 480;
const memK = (x: number, k = 3.1) => Math.exp(-k * x) * 0.92 + 0.04;
const curveD = (k: number, n = 60) => 'M' + Array.from({length: n + 1}, (_, i) => `${AX + (i / n) * AW} ${AY - memK(i / n, k) * AH}`).join('L');

export const Problem: React.FC = () => {
  const id = 'problem';
  const f = useCurrentFrame();
  const dur = durF(id);
  const w = (x: string, n = 0) => wf(id, x, n);
  const start = w('by');
  const draw = T(f, start, w('gone') - w('by') + 14);
  const forget = w('forgetting');
  let n = 0;
  return (
    <Scene dur={dur} fadeIn={5} fadeOut={0}>
      <Label text="Reading, then forgetting" at={4} />
      <div style={{
        position: 'absolute', left: 120, top: 200, width: 800, height: 640, background: '#FFFDF8', border: `4px solid ${C.ink}`,
        borderRadius: 18, boxShadow: `10px 12px 0 ${C.ink}`, transform: `rotate(${-1.4 + T(f, w('week'), 30) * 1.6}deg) scale(${0.85 + 0.15 * T(f, 0, 14, back)})`,
        opacity: T(f, 0, 8, out), padding: '52px 56px', boxSizing: 'border-box',
      }}>
        <div style={{fontFamily: FD, fontWeight: 800, fontSize: 50, marginBottom: 26, opacity: 1 - T(f, start + 10, 24)}}>Cell biology</div>
        {LINES.map((line, li) => (
          <div key={li} style={{display: 'flex', gap: 14, fontSize: 38, fontWeight: 500, lineHeight: '66px', whiteSpace: 'nowrap'}}>
            {line.map((word, wi) => {
              const idx = n++;
              const appear = T(f, 4 + idx * 1.3, 10, out);
              const e = clamp((draw - thr(idx)) / 0.16);
              const hl = idx % 4 === 1 ? T(f, w('read') + idx * 1.5, 12) * (1 - e) : 0;
              return (
                <span key={wi} style={{
                  position: 'relative', opacity: appear * (1 - e), filter: `blur(${e * 7}px)`,
                  transform: `translateY(${(1 - appear) * 8 + e * 6}px) scale(${1 + e * 0.06})`, color: e > 0 ? C.inkSoft : C.ink,
                }}>
                  <span style={{position: 'absolute', left: -4, right: -4, top: 12, bottom: 10, background: C.butter, opacity: hl, zIndex: -1, borderRadius: 6}} />
                  {word}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => {
        const t = T(f, w('gone') + 4 + i * 5, 12, back);
        return <div key={i} style={{position: 'absolute', left: 300 + i * 160, top: 400 + (i % 2) * 70 - bump(f, w('gone') + i * 5, 24) * 24, fontFamily: FD, fontWeight: 800, fontSize: 150, color: [C.rose, C.lilac, C.butter][i], WebkitTextStroke: `5px ${C.ink}`, paintOrder: 'stroke fill', opacity: clamp(t * 3), transform: `scale(${t}) rotate(${(i - 1) * 10}deg)`}}>?</div>;
      })}
      <Chip text="Today" icon="check" at={w('today')} until={w('week') - 3} fill={C.mint} size={40} x={640} y={150} rot={-4} />
      <Chip text="Next week" icon="eye" at={w('week')} fill={C.rose} size={40} x={600} y={150} rot={3} until={w('most')} />
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g filter="url(#wob)">
          <Ink d={`M${AX} ${AY - AH - 30}V${AY}H${AX + AW + 20}`} p={T(f, w('problem') - 6, 24)} />
          <Ink d={`${curveD(3.1)}L${AX + AW} ${AY}L${AX} ${AY}Z`} p={0} f={0.85 * T(f, start + 40, 30)} fill={C.rose} />
          <Ink d={curveD(3.1)} p={draw} sw={9} />
          <circle cx={AX + draw * AW} cy={AY - memK(draw) * AH} r={draw > 0 ? 16 : 0} fill={C.butter} stroke={C.ink} strokeWidth={5} />
          <Ink d={curveD(2.3)} p={T(f, w('we'), 22)} sw={8} color={C.purple} />
          <Ink d={curveD(4.2)} p={T(f, w('all'), 22)} sw={8} color="#7DBF93" />
          <Ink d={curveD(1.7)} p={T(f, w('have'), 22)} sw={8} color="#E0A33B" />
        </g>
        <text x={AX + 4} y={AY + 58} fontFamily={FB} fontWeight={600} fontSize={34} fill={C.inkSoft} opacity={T(f, w('problem'), 14)}>time</text>
        <text x={AX - 28} y={AY - AH - 50} fontFamily={FB} fontWeight={600} fontSize={34} fill={C.inkSoft} opacity={T(f, w('problem'), 14)}>what you remember</text>
        <g filter="url(#wob)" opacity={T(f, forget, 8)}>
          <Ink d={`M1330 372Q1290 380 1228 520`} p={T(f, forget + 6, 14)} sw={6} />
          <Ink d="M1228 520L1226 490M1228 520L1252 506" p={T(f, forget + 16, 8)} sw={6} />
        </g>
      </svg>
      <Chip text="The forgetting curve" at={forget} fill={C.butter} size={54} x={1210} y={300} rot={-3} />
      <Chip text="Most of it: gone" icon="cross" at={w('gone')} until={forget - 6} fill={C.rose} size={46} x={1300} y={330} rot={-3} />
      <Burst at={w('gone')} x={1560} y={440} n={8} r={160} />
      <Burst at={forget} x={1500} y={330} n={9} r={150} />
      <Chip text="We all have one" icon="brain" at={w('we')} fill={C.mint} size={44} x={1330} y={200} rot={3} />
    </Scene>
  );
};

/* ------------------------------------------------------------------ 3 palace */
const AT: Record<Key, number> = {shell: 4, roof: 24, rug: 42, window: 36, sofa: 46, lamp: 56, frame: 64, table: 72, plant: 80};
const DUR: Record<Key, number> = {shell: 26, roof: 24, rug: 16, window: 20, sofa: 20, lamp: 16, frame: 18, table: 18, plant: 16};

/** Little grocery icons in a 60x60 box centred on (0,0). */
const Grocery: React.FC<{k: 'milk' | 'eggs' | 'bread'}> = ({k}) => {
  const st = {stroke: C.ink, strokeWidth: 3.6, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const};
  if (k === 'milk') {
    return (
      <g>
        <path d="M-17 -12L-9 -30H9L17 -12Z" fill="#E4EEF9" {...st} />
        <path d="M-17 -12H17V30H-17Z" fill="#FFFFFF" {...st} />
        <path d="M-17 2H17V20H-17Z" fill={C.sky} {...st} />
        <path d="M0 5Q-6 12 0 16Q6 12 0 5Z" fill="#FFFFFF" stroke={C.ink} strokeWidth={2.4} />
        <path d="M-9 -30L-9 -37H9L9 -30" fill="none" {...st} />
      </g>
    );
  }
  if (k === 'eggs') {
    const egg = 'M0 -22C12 -22 18 -2 18 8C18 20 10 26 0 26C-10 26 -18 20 -18 8C-18 -2 -12 -22 0 -22Z';
    return (
      <g>
        <g transform="translate(-17 6) scale(0.78)"><path d={egg} fill="#FFF3D6" {...st} /></g>
        <g transform="translate(17 6) scale(0.78)"><path d={egg} fill="#FBE3C5" {...st} /></g>
        <g transform="translate(0 4)"><path d={egg} fill="#FFFDF4" {...st} /><path d="M-8 -4Q-8 -12 -2 -14" fill="none" stroke={C.ink} strokeWidth={2.6} strokeLinecap="round" opacity={0.5} /></g>
      </g>
    );
  }
  return (
    <g>
      <path d="M-30 16V2Q-32 -20 -10 -22H10Q32 -20 30 2V16Q30 24 22 24H-22Q-30 24 -30 16Z" fill="#EBB46C" {...st} />
      <path d="M-30 4Q-26 -4 -16 -4H16Q26 -4 30 4" fill="none" stroke="#B9823F" strokeWidth={3} strokeLinecap="round" />
      <path d="M-16 -16L-8 -6M-2 -18L6 -8M12 -16L20 -6" fill="none" stroke="#FFF3D6" strokeWidth={4.4} strokeLinecap="round" />
    </g>
  );
};
const ITEM_W = 214, ITEM_H = 84;
/** Shopping-list item: icon + word, lands (finishes dropping) at local frame `land`. */
const ItemBadge: React.FC<{k: 'milk' | 'eggs' | 'bread'; text: string; x: number; y: number; fill: string; f: number; land: number; pulse?: number}> = ({k, text, x, y, fill, f, land, pulse = 0}) => {
  const t = T(f, land - 15, 15, back);
  if (f < land - 15) return null;
  const sc = 1 + pulse * 0.2;
  return (
    <g transform={`translate(${x + ITEM_W / 2} ${y + ITEM_H / 2 - (1 - t) * 320}) scale(${sc}) translate(${-ITEM_W / 2} ${-ITEM_H / 2})`} opacity={clamp((f - land + 15) / 5)}>
      <path d={rr(6, 7, ITEM_W, ITEM_H, 18)} fill={C.ink} />
      <path d={rr(0, 0, ITEM_W, ITEM_H, 18)} fill={fill} stroke={C.ink} strokeWidth={4.5} />
      <circle cx={46} cy={ITEM_H / 2} r={31} fill="#FFFDF8" stroke={C.ink} strokeWidth={3.4} />
      <g transform={`translate(46 ${ITEM_H / 2 + 2}) scale(0.7)`}><Grocery k={k} /></g>
      <text x={146} y={ITEM_H / 2 + 12} textAnchor="middle" fontFamily={FD} fontWeight={800} fontSize={36} fill={C.ink}>{text}</text>
    </g>
  );
};
// Walker route on the floor: lamp (index 2) -> wall (4) -> sofa (8)
const WALK = catmull([[250, 492], [320, 474], [362, 440], [450, 498], [560, 444], [470, 506], [340, 500], [235, 482], [180, 450]]);
const WALK_L = cum(WALK);
const SEG = 14;

export const Palace: React.FC = () => {
  const id = 'palace';
  const f = useCurrentFrame();
  const w = (x: string, n = 0) => wf(id, x, n);
  const lamp = w('lamp'), wall = w('wall'), sofa = w('sofa');
  const pic = w('Picture');
  const b = pic - 2; // house starts drawing here
  const keys: Key4[] = [
    [0, 1.05, 540, 240], [w('living') - 20, 1.05, 540, 240], [w('living') + 6, 1.15, 540, 270], [lamp - 44, 1.15, 540, 270],
    [lamp - 16, 1.5, 420, 200], [wall - 18, 1.5, 580, 190], [sofa - 18, 1.5, 250, 300], [w('Later') - 6, 1.05, 540, 240], [w('walk') - 14, 1.4, 380, 270],
    [durF(id), 1.4, 380, 270],
  ];
  const [S, cx, cy] = cam(f, keys);
  const p = (k: Key) => T(f, b + AT[k], DUR[k]);
  const fl = (k: Key) => T(f, b + AT[k] + DUR[k] * 0.6, 18);
  const walkStart = w('walk') - 6, walkEnd = w('right') - 4;
  const walkP = T(f, walkStart, walkEnd - walkStart, inOut);
  const total = WALK_L[WALK_L.length - 1];
  const wl = walkP * total;
  const dotsAll: [number, number][] = [];
  for (let d = 0; d <= total; d += 26) dotsAll.push(atLen(WALK, WALK_L, d));
  const tip = atLen(WALK, WALK_L, wl);
  const near = (idx: number) => clamp(1 - Math.abs(wl - WALK_L[idx * SEG]) / 70) * (walkP > 0 && walkP < 1 ? 1 : 0);
  const sync = bump(f, w('right'), 18) + 0.7 * bump(f, w('left'), 16) + 0.5 * bump(f, w('it'), 14);
  const pulses = [Math.max(near(2), sync), Math.max(near(4), sync), Math.max(near(8), sync)];
  const ring = (land: number, x: number, y: number, r = 90) => {
    const t = (f - land) / 16;
    return t < 0 || t > 1 ? null : <circle cx={x} cy={y} r={30 + r * out(t)} fill="none" stroke={C.ink} strokeWidth={6 * (1 - t) + 1} opacity={1 - t} />;
  };
  const leg = Math.sin(f * 0.9) * 7;
  const castle = T(f, w('memory'), 26) * (1 - T(f, pic - 8, 8));
  const bulb = T(f, 0, 14, back) * (1 - T(f, w('Trick') - 4, 8));
  const flash = bump(f, w('tricks'), 16);
  const trickAt = w('Trick');
  return (
    <Scene dur={durF(id)} fadeIn={5} fadeOut={0}>
      {/* lightbulb doodle: "Luckily, there are tricks" */}
      {bulb > 0.01 && (
        <svg width={W} height={H} style={{position: 'absolute'}}>
          <g filter="url(#wob)" transform={`translate(960 ${450 + Math.sin(f / 8) * 6}) scale(${2.1 * bulb * (1 + flash * 0.12)})`}>
            <path d="M-36 66V44C-82 18 -86 -32 -50 -62C-20 -88 38 -88 64 -58C94 -22 84 22 38 44V66Z" fill={flash > 0.05 || f >= w('tricks') ? C.butter : '#FFFDF8'} stroke={C.ink} strokeWidth={6} strokeLinejoin="round" />
            <path d="M-34 84H34M-24 100H24" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
            <path d="M-20 44C-30 10 0 -2 0 -20C0 -2 30 10 20 44" fill="none" stroke={C.ink} strokeWidth={4.5} strokeLinecap="round" />
            {[-70, -40, -10, 20, 50].map((a, i) => {
              const r1 = 110 + 10 * Math.sin(f / 4 + i), r2 = 140 + 14 * flash + 10 * Math.sin(f / 4 + i);
              const ang = (a - 90) * Math.PI / 180 * 1;
              const rr_ = (ang + (i - 2) * 0.12);
              return <path key={i} d={`M${Math.cos(rr_) * r1} ${-6 + Math.sin(rr_) * r1}L${Math.cos(rr_) * r2} ${-6 + Math.sin(rr_) * r2}`} stroke={C.ink} strokeWidth={6} strokeLinecap="round" opacity={T(f, w('Luckily') + 4 + i * 3, 8)} />;
            })}
          </g>
        </svg>
      )}
      <Burst at={w('tricks')} x={960} y={420} n={10} r={360} />
      <NumSticker n="1" wordAt={trickAt} at={w('one')} until={w('memory')} />
      <TrickTag n="1" at={w('memory') + 4} />
      {castle > 0.01 && (
        <svg width={W} height={H} style={{position: 'absolute'}}>
          <g transform={`translate(${960 - 220} ${450 - 190 + (1 - castle) * 30}) scale(2.2)`} opacity={Math.min(1, castle * 3)} filter="url(#wob)">
            <Castle p={T(f, w('memory'), 22)} f={T(f, w('memory') + 12, 16)} />
          </g>
        </svg>
      )}
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <SW.Provider value={5 / Math.pow(S, 0.6)}>
          <g transform={`translate(${W / 2} ${H / 2}) scale(${S}) translate(${-cx} ${-cy})`} filter="url(#wob)">
            {f >= b && <Room p={p} f={fl} />}
            {dotsAll.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={5.5} fill={C.ink} opacity={i * 26 <= wl + 4 && walkP > 0 ? 1 : 0} />)}
            {walkP > 0 && (
              <g transform={`translate(${tip[0]} ${tip[1] - 22}) scale(1.3)`} opacity={1 - T(f, walkEnd + 4, 8)}>
                <path d={`M-6 18L${-10 + leg} 40M6 18L${10 - leg} 40`} stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
                <circle r={22} fill={C.butter} stroke={C.ink} strokeWidth={5} />
                <circle cx={-7} cy={-4} r={3} fill={C.ink} /><circle cx={7} cy={-4} r={3} fill={C.ink} />
                <path d="M-7 8Q0 14 7 8" fill="none" stroke={C.ink} strokeWidth={3.4} strokeLinecap="round" />
              </g>
            )}
            <ItemBadge k="milk" text="Milk" x={235} y={36} fill={C.sky} f={f} land={lamp} pulse={pulses[0]} />
            <ItemBadge k="eggs" text="Eggs" x={505} y={118} fill={C.butter} f={f} land={wall} pulse={pulses[1]} />
            <ItemBadge k="bread" text="Bread" x={68} y={244} fill={C.rose} f={f} land={sofa} pulse={pulses[2]} />
            {ring(lamp, 360, 78)}{ring(wall, 612, 160)}{ring(sofa, 175, 286)}
            {[[360, 78, 'right'], [612, 160, 'right'], [175, 286, 'right']].map(([x, y], i) => {
              const t = (f - w('right') - i * 3) / 18;
              return t < 0 || t > 1 ? null : <circle key={i} cx={x as number} cy={y as number} r={60 + 80 * out(t)} fill="none" stroke={C.ink} strokeWidth={5 * (1 - t) + 1} opacity={1 - t} />;
            })}
          </g>
        </SW.Provider>
      </svg>
      {f < w('thing') - 6 && <Label text="Memory palace" at={w('memory') + 6} x={96} y={160} />}
      <Label text="Shopping list" at={w('thing')} x={96} y={160} fill={C.mint} />
      <Burst at={lamp} x={W / 2} y={H / 2} n={8} r={420} />
    </Scene>
  );
};

/* ------------------------------------------------------------------ 4 bizarre */
const Heart: React.FC<{x: number; y: number; s: number; o: number}> = ({x, y, s, o}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <path d="M0 14C-40 -22 -16 -42 0 -20C16 -42 40 -22 0 14Z" fill={C.rose} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
  </g>
);
const BRAIN_L = 'M200 40C150 -5 50 15 55 95C10 115 15 195 62 215C58 270 130 300 200 270Z';
const BRAIN_R = 'M200 40C250 -5 350 15 345 95C390 115 385 195 338 215C342 270 270 300 200 270Z';
export const Bizarre: React.FC = () => {
  const id = 'bizarre';
  const f = useCurrentFrame();
  const w = (x: string, n = 0) => wf(id, x, n);
  const mk = w('make'), brain = w('brain'), aShovel = w('A', 0), shovel = w('shovel'), forg = w('Forgettable'), purple = w('purple'), weeks = w('weeks'), bizz = w('bizarreness');
  const weird = (i: number) => T(f, w('weird', 0) + i * 3, 12, back);
  const letters = 'WEIRD'.split('');
  const shovelDrop = T(f, shovel, 14, back);
  const poof = T(f, purple, 10);
  const eleP = T(f, purple, 18), eleF = T(f, purple + 8, 14), eleS = 0.15 + 1.0 * T(f, purple, 16, back);
  const tableP = T(f, aShovel - 4, 16);
  const showTable = f >= aShovel - 4;
  const brainIn = T(f, brain, 22), brainOut = T(f, aShovel - 8, 8);
  const weirdOut = T(f, brain - 8, 8);
  const meh = T(f, forg, 12, back);
  const wk = T(f, weeks, 14, back);
  return (
    <Scene dur={durF(id)} fadeIn={5} fadeOut={0}>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        {/* purple burst behind the elephant */}
        <circle cx={1000} cy={560} r={560 * out(clamp((f - purple) / 22))} fill={C.lilac} opacity={0.55 * (f >= purple ? 1 : 0)} />
        <g filter="url(#wob)">
          {/* brain + hearts */}
          {brainOut < 1 && (
            <g transform={`translate(670 190) scale(${1.45 + 0.03 * Math.sin(f / 6)})`} opacity={1 - brainOut}>
              <Ink d={BRAIN_L} p={brainIn} f={T(f, brain + 8, 14)} fill={C.rose} sw={7} />
              <Ink d={BRAIN_R} p={brainIn} f={T(f, brain + 8, 14)} fill={C.lilac} sw={7} />
              <Ink d="M110 90Q140 60 165 95M95 160Q135 135 170 170M130 230Q160 205 185 235M290 90Q260 60 235 95M305 160Q265 135 230 170M270 230Q240 205 215 235" p={brainIn} sw={5} />
            </g>
          )}
          {[0, 1, 2, 3].map((i) => {
            const at = w('loves') + i * 6;
            const t = clamp((f - at) / 30);
            const s = f >= at && brainOut < 1 ? Math.sin(t * Math.PI) : 0;
            return <Heart key={i} x={[640, 1290, 800, 1150][i] + Math.sin(f / 7 + i) * 12} y={[420, 400, 230, 190][i] - t * 120} s={1.2 * s} o={s} />;
          })}
          {/* table */}
          {showTable && (
            <g>
              <Ink d={rr(500, 660, 920, 34, 10)} p={tableP} f={T(f, aShovel + 8, 12)} fill={C.sky} />
              <Ink d="M570 694V840M1350 694V840" p={tableP} sw={9} />
              <ellipse cx={950} cy={666} rx={420} ry={9} fill={C.ink} opacity={0.14 * shovelDrop} />
              <g transform={`translate(0 ${-(1 - shovelDrop) * 300})`} opacity={clamp(shovelDrop * 3) * (1 - poof) * (1 - 0.3 * T(f, forg, 14))}>
                <g transform="translate(548 598) scale(0.94)"><Shovel /></g>
              </g>
            </g>
          )}
          {/* elephant */}
          {f >= purple && (
            <g transform={`translate(1130 486) scale(${1.5 * eleS}) `} opacity={clamp(eleP * 4)}>
              <Elephant p={eleP} f={eleF} frame={Math.max(0, f - purple - 16)} />
            </g>
          )}
        </g>
        {/* meh stamp */}
        <g transform={`translate(1330 470) rotate(-12) scale(${0.3 + 0.7 * meh})`} opacity={clamp(meh * 3) * (1 - poof)}>
          <circle r={110} fill="none" stroke={C.inkSoft} strokeWidth={9} strokeDasharray="22 10" />
          <text textAnchor="middle" y={26} fontFamily={FD} fontWeight={800} fontSize={84} fill={C.inkSoft}>meh</text>
        </g>
        {/* weeks sparkles */}
        {[0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2 + 0.5;
          const t = clamp((f - weeks - i * 2) / 26);
          const s = f >= weeks ? Math.sin(t * Math.PI) : 0;
          return <g key={i} transform={`translate(${1000 + Math.cos(a) * 460} ${440 + Math.sin(a) * 300}) scale(${s * 1.3}) rotate(${i * 20})`}>
            <path d="M0 -24L7 -7L24 0L7 7L0 24L-7 7L-24 0L-7 -7Z" fill={C.butter} stroke={C.ink} strokeWidth={4} strokeLinejoin="round" />
          </g>;
        })}
      </svg>
      {/* WEIRD */}
      {weirdOut < 1 && f >= mk && (
        <div style={{position: 'absolute', left: 820, right: 0, top: 250, textAlign: 'center', opacity: 1 - weirdOut}}>
          <div style={{fontFamily: FD, fontWeight: 800, fontSize: 100, opacity: T(f, mk, 10, out), transform: `translateY(${(1 - T(f, mk, 10, out)) * 20}px)`}}>make it</div>
          <div style={{display: 'flex', justifyContent: 'center', gap: 6, marginTop: -10}}>
            {letters.map((l, i) => (
              <span key={i} style={{
                fontFamily: FD, fontWeight: 800, fontSize: 210, lineHeight: 1, color: [C.purple, C.rose, C.butter, C.mint, C.sky][i], WebkitTextStroke: `7px ${C.ink}`, paintOrder: 'stroke fill',
                display: 'inline-block', transform: `translateY(${(1 - weird(i)) * -160 + Math.sin(f / 5 + i * 1.3) * 10}px) rotate(${Math.sin(f / 6 + i) * 5 + (i - 2) * 3}deg) scale(${0.3 + 0.7 * weird(i)})`, opacity: clamp(weird(i) * 3),
              }}>{l}</span>
            ))}
          </div>
        </div>
      )}
      <NumSticker n="2" wordAt={0} at={w('two')} until={brain - 8} cx={470} />
      <TrickTag n="2" at={brain - 2} />
      <Chip text="Psychologists" icon="eye" at={w('Psychologists')} until={bizz - 2} fill={C.sky} size={44} x={96} y={160} />
      <Chip text="Bizarreness effect" icon="brain" at={bizz} fill={C.lilac} size={48} x={96} y={160} />
      <Chip text="for weeks!" icon="sparkle" at={weeks} until={bizz - 6} fill={C.mint} size={56} x={1160} y={170} rot={4} />
      <Burst at={purple} x={1000} y={520} n={14} r={520} />
      <Burst at={bizz} x={600} y={110} n={9} r={200} />
      <Flash at={purple} dur={5} color="#FFFFFF" />
    </Scene>
  );
};

/* ------------------------------------------------------------------ 5 turn */
const MiniFrame: React.FC<{x: number; y: number; fill: string; at: number; f: number; children: React.ReactNode}> = ({x, y, fill, at, f, children}) => {
  const t = T(f, at, 14, back);
  if (f < at) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${0.2 + 0.8 * t})`} opacity={clamp(t * 3)}>
      <path d={rr(-80, -80, 160, 160, 16)} fill={C.ink} transform="translate(6 7)" />
      <path d={rr(-80, -80, 160, 160, 16)} fill={fill} stroke={C.ink} strokeWidth={5} />
      {children}
    </g>
  );
};
export const Turn: React.FC = () => {
  const id = 'turn';
  const f = useCurrentFrame();
  const dur = durF(id);
  const w = (x: string, n = 0) => wf(id, x, n);
  const hard = w('hard'), build = w('build'), head = w('head'), invent = w('invent'), strange = w('strange'), picture = w('picture'), you = w('You', 0);
  const loci = w('LOCI'), inVR = w('In', 1), imagine = w('imagine'), walk = w('walk'), into = w('into'), it = w('it', 0), you2 = w('You', 2);
  const collapse = T(f, w('So'), 30, inOut);
  const stageA = (1 - T(f, you, 14, inOut)) * T(f, 0, 12, back);
  const headT = T(f, you + 4, 16, back) * (1 - collapse);
  const shake = f >= hard && f < hard + 14 ? Math.sin((f - hard) * 2.2) * 8 * (1 - (f - hard) / 14) : 0;
  const slam = T(f, loci, 10, back);
  const slamShake = f >= loci && f < loci + 12 ? Math.sin((f - loci) * 2.6) * 7 * (1 - (f - loci) / 12) : 0;
  const wmUp = T(f, inVR, 22, inOut);
  const room = T(f, inVR - 2, 40);
  // walk-in: push the camera to the door, door opens on "into", light floods the screen on "it"
  const push = T(f, you2 - 2, into - you2 + 8, inOut);
  const S = lerp(0.8, 3.4, push);
  const dx = lerp(540, 565, push), dy = lerp(260, 331, push);
  const sy = lerp(600, 540, push);
  const open = T(f, into, 12, inOut);
  const flood = T(f, dur - 9, 8, inOut);
  const wmScale = lerp(1.6, 0.46, wmUp);
  const wmX = lerp(960, 330, wmUp), wmY = lerp(430, 98, wmUp);
  const fillT = (i: number) => T(f, inVR + 14 + i * 4, 22);
  const fl = (k: Key) => (k === 'roof' || k === 'shell' ? T(f, inVR + 14, 22) : fillT(KEYS.indexOf(k)));
  const headBob = Math.sin(f / 9) * 4;
  const wmO = 1 - T(f, you2 - 4, 12);
  return (
    <Scene dur={dur} fadeIn={5} fadeOut={0}>
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g filter="url(#wob)" transform={`translate(${slamShake} ${slamShake * 0.6})`}>
          {/* A: the two hard things */}
          {stageA > 0 && (
            <g opacity={stageA}>
              <g transform={`translate(${560 + shake} 500) rotate(${shake * 0.3}) scale(0.5) translate(-540 -155)`}>
                <SW.Provider value={11}><Room p={() => 1} f={() => 1} /></SW.Provider>
              </g>
              <g transform={`translate(${1440 - shake} 620) scale(${1.1 * T(f, 6, 14, back) + 0.001})`}><Elephant p={1} f={1} frame={f} /></g>
              <g transform={`translate(1010 480) scale(${T(f, w('catch'), 12, back)})`}>
                <path d="M-40 0H40M0 -40V40" stroke={C.ink} strokeWidth={14} strokeLinecap="round" />
              </g>
            </g>
          )}
          {/* B: head with the palace inside, strange pictures around */}
          {headT > 0 && (
            <g opacity={clamp(headT * 2)}>
              <g transform={`translate(960 ${560 + headBob}) scale(${0.3 + 0.7 * headT})`}>
                <circle r={250} fill={C.butter} stroke={C.ink} strokeWidth={7} />
                <circle cx={-80} cy={-20} r={13} fill={C.ink} /><circle cx={80} cy={-20} r={13} fill={C.ink} />
                <path d={f < invent ? 'M-70 90Q0 130 70 90' : 'M-70 110Q0 80 70 110'} fill="none" stroke={C.ink} strokeWidth={8} strokeLinecap="round" />
                {f >= invent && [0, 1, 2].map((i) => <path key={i} d="M0 -14C-14 6 14 6 0 -14Z" transform={`translate(${190 + i * 28} ${-150 + ((f * 3 + i * 20) % 60)})`} fill={C.sky} stroke={C.ink} strokeWidth={3} />)}
                <g transform={`translate(0 -150) scale(${0.26 * T(f, build, 14, back)}) translate(-540 -155)`}><SW.Provider value={14}><Room p={() => 1} f={() => 1} /></SW.Provider></g>
              </g>
              <MiniFrame x={470} y={330} fill={C.rose} at={invent} f={f}>
                <g transform="translate(20 40) scale(0.3)"><Elephant p={1} f={1} frame={f} /></g>
              </MiniFrame>
              <MiniFrame x={1450} y={340} fill={C.sky} at={strange} f={f}>
                <circle cx={-6} cy={0} r={38} fill={C.butter} stroke={C.ink} strokeWidth={5} />
                <circle cx={14} cy={-8} r={34} fill={C.sky} />
                <path d="M30 -60l8 16 16 8-16 8-8 16-8-16-16-8 16-8z" fill={C.paper} stroke={C.ink} strokeWidth={4} />
              </MiniFrame>
              <MiniFrame x={1500} y={700} fill={C.mint} at={picture} f={f}>
                <path d="M-50 40Q-50 -50 0 -50Q50 -50 50 40Z" fill={C.lilac} stroke={C.ink} strokeWidth={5} />
                <circle cx={-16} cy={-6} r={7} fill={C.ink} /><circle cx={16} cy={-6} r={7} fill={C.ink} />
                <path d="M-18 14Q0 30 18 14" fill="none" stroke={C.ink} strokeWidth={5} strokeLinecap="round" />
              </MiniFrame>
              <MiniFrame x={420} y={730} fill={C.lilac} at={picture + 8} f={f}>
                <path d="M-46 -16L0 -52L46 -16L30 40H-30Z" fill={C.rose} stroke={C.ink} strokeWidth={5} strokeLinejoin="round" />
                <circle cx={0} cy={-4} r={14} fill={C.butter} stroke={C.ink} strokeWidth={4} />
              </MiniFrame>
            </g>
          )}
          {/* C/D: wordmark + house */}
          {f >= loci && (
            <g opacity={wmO} transform={`translate(${wmX} ${wmY}) scale(${wmScale * (1 + (1 - slam) * 0.9)}) translate(-255 -85)`}>
              <Wordmark frame={f} start={loci} stagger={3} dur={12} blobDelay={5} />
            </g>
          )}
        </g>
        {f >= inVR - 2 && (
          <SW.Provider value={5 / Math.pow(S / 0.8, 0.55)}>
            <g transform={`translate(960 ${sy}) scale(${S}) translate(${-dx} ${-dy})`} filter="url(#wob)">
              <Room p={() => room} f={fl} />
              {/* the door */}
              {f >= inVR + 30 && (
                <g opacity={T(f, inVR + 30, 14)}>
                  <path d={rr(494, 226, 142, 208, 10)} fill="#FFF4C8" stroke={C.ink} strokeWidth={6} />
                  <path d={rr(494, 226, 142, 208, 10)} fill="#FFFBE8" opacity={open} />
                  {open > 0.05 && [0, 1, 2, 3, 4].map((i) => (
                    <path key={i} d={`M565 330L${565 + (i - 2) * 80} ${330 - 260}`} stroke={C.butter} strokeWidth={26} opacity={0.5 * open} strokeLinecap="round" />
                  ))}
                  <g transform={`translate(494 0) scale(${1 - 0.86 * open} 1)`}>
                    <path d={rr(0, 226, 142, 208, 10)} fill={C.mint} stroke={C.ink} strokeWidth={6} />
                    <path d={rr(20, 250, 102, 70, 8)} fill="none" stroke={C.ink} strokeWidth={4} />
                    <path d={rr(20, 338, 102, 70, 8)} fill="none" stroke={C.ink} strokeWidth={4} />
                    <circle cx={120} cy={336} r={9} fill={C.butter} stroke={C.ink} strokeWidth={4} />
                  </g>
                </g>
              )}
            </g>
          </SW.Provider>
        )}
      </svg>
      <Chip text="Trick 1" icon="bolt" at={w('Both')} until={hard + 2} fill={C.butter} size={42} x={420} y={190} rot={-3} />
      <Chip text="Trick 2" icon="bolt" at={w('tricks')} until={hard + 2} fill={C.butter} size={42} x={1230} y={190} rot={3} />
      <Chip text="HARD" at={hard} until={you - 2} fill={C.rose} size={56} x={470} y={800} rot={-6} />
      <Chip text="HARD" at={hard + 5} until={you - 2} fill={C.rose} size={56} x={1250} y={810} rot={5} />
      <Chip text="In your head" icon="brain" at={head} until={w('So') - 4} fill={C.butter} size={46} x={730} y={850 - 140} />
      <Chip text="Every picture, yourself" icon="pencil" at={picture} until={w('So') - 4} fill={C.sky} size={44} x={640} y={150} />
      <Chip text="Don't imagine it" icon="cross" at={w("don't")} until={you2 - 2} fill={C.rose} size={44} x={1280} y={150} rot={3} />
      <Chip text="Walk into it" icon="house" at={you2} until={it} fill={C.mint} size={48} x={1220} y={150} rot={-3} />
      <Burst at={loci} x={960} y={430} n={14} r={420} />
      <Flash at={loci} dur={5} />
      <Burst at={into} x={960} y={540} n={12} r={520} />
      {flood > 0 && <div style={{position: 'absolute', inset: 0, background: C.paper, clipPath: `circle(${flood * 1250}px at 50% 50%)`}} />}
    </Scene>
  );
};

/* ------------------------------------------------------------------ 10 spaced */
const MiniCard: React.FC<{fill: string}> = ({fill}) => (
  <g>
    <path d={rr(5, 6, 150, 112, 14)} fill={C.ink} />
    <path d={rr(0, 0, 150, 112, 14)} fill={fill} stroke={C.ink} strokeWidth={5} />
    <path d={rr(14, 14, 122, 56, 8)} fill={C.paper} stroke={C.ink} strokeWidth={3} />
    <circle cx={75} cy={42} r={16} fill={C.butter} stroke={C.ink} strokeWidth={3} />
    <path d="M18 92H110M18 104H80" stroke={C.ink} strokeWidth={4} strokeLinecap="round" />
  </g>
);
const TX = {today: 360, tomorrow: 640, week: 1100, weeks: 1560};
const AXY = 540;
export const Spaced: React.FC = () => {
  const id = 'spaced';
  const f = useCurrentFrame();
  const dur = durF(id);
  const w = (x: string, n = 0) => wf(id, x, n);
  const c1 = w('Cards', 0), c2 = w('Cards', 1), rem = w('remember'), later = w('later'), miss = w('miss'), sooner = w('sooner');
  const which = w('which'), ideas = w('ideas'), need = w('need'), today = w('today'), loci = w('LOCI');
  const dim = 1 - 0.7 * T(f, which, 14);
  // card A flies to 2 weeks along an arc; card B to tomorrow
  const flyA = T(f, later, 26, inOut), flyB = T(f, sooner, 20, inOut);
  const arcA = (t: number): [number, number] => [lerp(TX.today, TX.weeks, t), AXY - 150 - Math.sin(t * Math.PI) * 190];
  const arcB = (t: number): [number, number] => [lerp(TX.today, TX.tomorrow, t), AXY + 150 + Math.sin(t * Math.PI) * 90];
  const posA = arcA(flyA), posB = arcB(flyB);
  const dropA = T(f, c1 - 14, 14, back), dropB = T(f, c2 - 14, 14, back);
  const landA = bump(f, later + 24, 12), landB = bump(f, sooner + 18, 12);
  const poly = (fn: (t: number) => [number, number]) => 'M' + Array.from({length: 31}, (_, i) => fn(i / 30).join(' ')).join('L');
  const ticks: [number, string][] = [[TX.today, 'Today'], [TX.tomorrow, 'Tomorrow'], [TX.week, '1 week'], [TX.weeks, '2 weeks']];
  const hl = (x: number) => (x === TX.weeks ? T(f, later + 20, 12) : x === TX.tomorrow ? T(f, sooner + 14, 12) : 0);
  const panel = T(f, which, 16, back);
  const ax = w('spaced') - 12;
  const rows = ['Ribosome', 'Lysosome'];
  return (
    <Scene dur={dur} fadeIn={5} fadeOut={0}>
      <NumSticker n="3" wordAt={0} at={w('three')} until={w('spaced') - 6} />
      <TrickTag n="3" at={w('spaced')} />
      <Label text="Spaced repetition" at={w('spaced') + 4} x={96} y={160} fill={C.mint} />
      <svg width={W} height={H} style={{position: 'absolute'}}>
        <g opacity={dim}>
          <g filter="url(#wob)">
            <Ink d={`M300 ${AXY}H1700`} p={T(f, ax, 24)} sw={6} />
            {ticks.map(([x, label], i) => {
              const t = T(f, ax + 6 + i * 4, 14, back);
              return (
                <g key={x} transform={`translate(${x} ${AXY}) scale(${t})`}>
                  <path d="M0 -16V16" stroke={C.ink} strokeWidth={6} strokeLinecap="round" />
                  <circle r={9 + 4 * hl(x)} fill={hl(x) > 0 ? (x === TX.weeks ? C.mint : C.rose) : C.paper} stroke={C.ink} strokeWidth={5} />
                </g>
              );
            })}
            {/* arcs */}
            <Ink d={poly(arcA)} p={T(f, later - 2, 26)} sw={6} dash="1 16" />
            <Ink d={poly(arcB)} p={T(f, sooner - 2, 20)} sw={6} dash="1 16" />
          </g>
          {ticks.map(([x, label]) => (
            <text key={label} x={x} y={AXY + 70} textAnchor="middle" fontFamily={FD} fontWeight={700} fontSize={36} fill={hl(x) > 0 ? C.ink : C.inkSoft}
              opacity={T(f, ax + 12, 14)} transform={`translate(0 ${-hl(x) * 4})`}>{label}</text>
          ))}
          {/* ghost slots */}
          {f >= c1 && flyA > 0.05 && <path d={rr(TX.today - 75, AXY - 150 - 56 + 0, 150, 112, 14)} fill="none" stroke={C.inkSoft} strokeWidth={4} strokeDasharray="10 10" />}
          {f >= c2 && flyB > 0.05 && <path d={rr(TX.today - 75, AXY + 150 - 56, 150, 112, 14)} fill="none" stroke={C.inkSoft} strokeWidth={4} strokeDasharray="10 10" />}
          {/* card A (got it) */}
          {f >= c1 - 14 && (
            <g transform={`translate(${posA[0] - 75} ${posA[1] - 56 - (1 - dropA) * 260 - landA * 14}) rotate(${(flyA > 0 && flyA < 1 ? (flyA - 0.5) * 24 : 0)}) scale(${1 + landA * 0.12})`} opacity={clamp((f - c1 + 14) / 5)}>
              <MiniCard fill={C.mint} />
            </g>
          )}
          {/* card B (missed) */}
          {f >= c2 - 14 && (
            <g transform={`translate(${posB[0] - 75} ${posB[1] - 56 - (1 - dropB) * 260 - landB * 14}) rotate(${(flyB > 0 && flyB < 1 ? (0.5 - flyB) * 18 : 0)}) scale(${1 + landB * 0.12})`} opacity={clamp((f - c2 + 14) / 5)}>
              <MiniCard fill={C.rose} />
            </g>
          )}
        </g>
        {/* castle that keeps track */}
        <g transform="translate(1530 70) scale(0.7)" opacity={T(f, loci, 12, out)} filter="url(#wob)"><Castle p={T(f, loci, 24)} f={T(f, loci + 14, 20)} /></g>
      </svg>
      <Chip text="Got it" icon="check" at={rem} fill={C.mint} size={46} x={TX.today + 120} y={AXY - 380} rot={-4} until={which - 10} />
      <Chip text="Later" icon="list" at={later + 20} fill={C.mint} size={40} x={TX.weeks - 80} y={AXY - 440} rot={3} until={which - 10} />
      <Chip text="Missed" icon="cross" at={miss} fill={C.rose} size={46} x={TX.today - 40} y={AXY + 250} rot={4} until={which - 10} />
      <Chip text="Sooner" icon="bolt" at={sooner + 14} fill={C.rose} size={40} x={TX.tomorrow - 20} y={AXY + 300} rot={-3} until={which - 10} />
      {/* today list */}
      {panel > 0 && (
        <div style={{
          position: 'absolute', left: 560, top: 215, width: 800, padding: '30px 44px 36px', boxSizing: 'border-box', background: '#FFFDF8', border: `5px solid ${C.ink}`, borderRadius: 24,
          boxShadow: `10px 12px 0 ${C.ink}`, transform: `scale(${0.6 + 0.4 * panel}) rotate(${(1 - panel) * 4}deg)`, opacity: clamp(panel * 3),
        }}>
          <div style={{fontFamily: FD, fontWeight: 800, fontSize: 58, position: 'relative', display: 'inline-block'}}>
            <span style={{position: 'absolute', left: -8, right: -8, bottom: 6, height: 24, background: C.butter, zIndex: -1, transformOrigin: 'left', transform: `scaleX(${T(f, today - 2, 12)})`}} />
            Today: review 2 ideas
          </div>
          {rows.map((r, i) => {
            const t = T(f, [ideas, need][i] - 2, 12, back);
            return (
              <div key={r} style={{display: 'flex', alignItems: 'center', gap: 22, marginTop: 22, opacity: clamp(t * 3), transform: `translateX(${(1 - t) * 90}px)`}}>
                <div style={{width: 62, height: 62, borderRadius: 16, background: [C.mint, C.lilac][i], border: `4px solid ${C.ink}`}} />
                <div style={{fontFamily: FB, fontWeight: 600, fontSize: 46}}>{r}</div>
                <div style={{marginLeft: 'auto', padding: '6px 22px', borderRadius: 999, background: C.rose, border: `3px solid ${C.ink}`, fontWeight: 600, fontSize: 32}}>needs work</div>
              </div>
            );
          })}
        </div>
      )}
      <Burst at={which} x={960} y={420} n={10} r={480} />
      <Ring at={today} x={960} y={330} r={420} color={C.butter} />
    </Scene>
  );
};
