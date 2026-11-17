import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {C, T, out} from '../lib';
import {FOOTAGE} from './footage';
import {Piece, Pieces} from './pieces';
import {durF, mono, wf} from './t';

/** Real screen recordings at native 1920x1080, no zoom, no overlays on the UI. Every cut point is a word time from vo.json. */
export const Studio: React.FC = () => {
  const id = 'studio';
  const f = useCurrentFrame();
  const w = (x: string, n = 0) => wf(id, x, n);
  const end = durF(id);
  const F = FOOTAGE.studio;
  const R = F.room;
  // narration anchors (local frames): type starts on "Prefer", the AI page on "Then give each idea a picture",
  // the first generated image lands on "draws", the upload drop on "upload", room tiles on "living"/"bedroom"/"own", Build on "build"
  const [prefer, aiA, arrive, got] = mono([w('Prefer'), w('Then', 0) + 10, w('draws') + 6, w('Got')], 12);
  const dropAt = w('upload');
  const pickF = Math.max(got + 30, w('pick') - 4);
  const [kit, bed, sun, build] = mono([w('living'), w('bedroom'), w('own'), w('build') + 6], 12);
  const pdf: Piece[] = [{l0: 0, l1: prefer, s0: 0, s1: F.pdf.len - 0.1}];
  const type: Piece[] = [{l0: prefer, l1: aiA, s0: F.type.from, s1: F.type.to, fade: 0}];
  // AI beat: typing sped up, then the five images arrive at (about) real speed, last frame held until "Got a picture of your own?"
  const bEnd = Math.min(got - 2, arrive + Math.round((F.ai.len - 0.15 - F.ai.firstImage) * 30));
  const ai: Piece[] = [
    {l0: aiA, l1: arrive, s0: F.ai.from, s1: F.ai.firstImage, fade: 0},
    {l0: arrive, l1: bEnd, s0: F.ai.firstImage, s1: F.ai.len - 0.15},
    {l0: bEnd, l1: got, s0: F.ai.len - 0.15, s1: F.ai.len - 0.1},
  ];
  // upload: its drop lands on "upload"
  const upStart = Math.max(got, dropAt - Math.round(F.upload.drop * 30));
  const upload: Piece[] = [{l0: upStart, l1: pickF, s0: (upStart - (dropAt - F.upload.drop * 30)) / 30, s1: Math.min(F.upload.len - 0.1, (pickF - (dropAt - F.upload.drop * 30)) / 30), fade: 0}];
  const room: Piece[] = [
    {l0: pickF, l1: kit, s0: 0, s1: R.kitchen, fade: 0},
    {l0: kit, l1: bed, s0: R.kitchen, s1: R.bedroom},
    {l0: bed, l1: sun, s0: R.bedroom, s1: R.sunlit},
    {l0: sun, l1: build, s0: R.sunlit, s1: R.build},
    {l0: build, l1: end, s0: R.build, s1: Math.min(R.len - 0.1, R.build + (end - build) / 30)},
  ];
  // iris opens from the centre where the door light ended the previous section
  const iris = T(f, 0, 6, out);
  return (
    <AbsoluteFill style={{background: C.paper}}>
      <div style={{position: 'absolute', inset: 0, clipPath: `circle(${500 + iris * 800}px at 50% 50%)`}}>
        <Pieces src={F.pdf.src} ps={pdf} />
        <Pieces src={F.type.src} ps={type} />
        <Pieces src={F.ai.src} ps={ai} />
        <Pieces src={F.upload.src} ps={upload} />
        <Pieces src={R.src} ps={room} />
      </div>
    </AbsoluteFill>
  );
};
