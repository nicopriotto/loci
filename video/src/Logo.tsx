import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Castle, Scene, T, Wordmark, W, H, out} from './lib';

export const LOGO_FRAMES = 90;
export const Logo: React.FC = () => {
  const f = useCurrentFrame();
  const s = 1 + 0.03 * T(f, 0, 90);
  return (
    <Scene dur={LOGO_FRAMES} fadeIn={0} fadeOut={8}>
      <svg width={W} height={H}>
        <g transform={`translate(${W / 2} ${H / 2 + 20}) scale(${s}) translate(-245 -85)`} filter="url(#wob)">
          <Wordmark frame={f} stagger={5} dur={20} blobDelay={8} />
          <g transform="translate(195 -140) scale(0.5)" opacity={T(f, 14, 14, out)}>
            <Castle p={T(f, 12, 22)} />
          </g>
        </g>
      </svg>
    </Scene>
  );
};
