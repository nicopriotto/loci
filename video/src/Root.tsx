import React from 'react';
import {Composition} from 'remotion';
import {Logo, LOGO_FRAMES} from './Logo';
import {Problem, PROBLEM_FRAMES} from './Problem';
import {Palace, PALACE_FRAMES} from './Palace';
import {Spaced, SPACED_FRAMES} from './Spaced';
import {Turn, TURN_FRAMES} from './Turn';
import {Loci, TOTAL_FRAMES} from './loci/Loci';
import {End, END_FRAMES, Later, LATER_FRAMES} from './Cards';

const scenes: [string, React.FC, number][] = [
  ['r-logo', Logo, LOGO_FRAMES], ['r-1-problem', Problem, PROBLEM_FRAMES], ['r-2-palace', Palace, PALACE_FRAMES],
  ['r-3-spaced', Spaced, SPACED_FRAMES], ['r-4-turn', Turn, TURN_FRAMES], ['r-5d-later', Later, LATER_FRAMES], ['r-6-end', End, END_FRAMES],
];
export const Root: React.FC = () => (
  <>
    <Composition id="Loci" component={Loci} durationInFrames={TOTAL_FRAMES} fps={30} width={1920} height={1080} />
    {scenes.map(([id, component, durationInFrames]) => (
    <Composition key={id} id={id} component={component} durationInFrames={durationInFrames} fps={30} width={1920} height={1080} />
  ))}</>
);
