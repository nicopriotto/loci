import React from 'react';
import {AbsoluteFill, Audio, Sequence, staticFile} from 'remotion';
import {Captions} from './Captions';
import {Cold, Enter, Place, Review, Done, Close} from './vr';
import {Problem, Palace, Bizarre, Turn, Spaced} from './paper';
import {Studio} from './studio';
import {TOTAL_FRAMES, durF, startF} from './t';
import {C} from '../lib';

const S: Record<string, React.FC> = {
  cold: Cold, problem: Problem, palace: Palace, bizarre: Bizarre, turn: Turn, studio: Studio, enter: Enter, place: Place,
  review: Review, spaced: Spaced, done: Done, close: Close,
};
export const Loci: React.FC = () => (
  <AbsoluteFill style={{background: C.paper}}>
    {Object.entries(S).map(([id, Comp]) => (
      <Sequence key={id} from={startF(id)} durationInFrames={durF(id)}><Comp /></Sequence>
    ))}
    <Captions />
    <Audio src={staticFile('vo/vo.mp3')} />
    <Audio src={staticFile('sfx.wav')} volume={0.55} />
  </AbsoluteFill>
);
export {TOTAL_FRAMES};
