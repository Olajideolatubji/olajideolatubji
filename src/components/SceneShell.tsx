import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {BG} from '../theme';

/**
 * Wrapper giving every scene constant motion: a slow push-in (or push-out)
 * plus a soft fade at both edges. Children are layered; use <Parallax> for
 * depth-offset layers inside.
 */
export const SceneShell: React.FC<{
  durationInFrames: number;
  from?: number;
  zoom?: number;
  pan?: [number, number];
  fade?: boolean;
  children: React.ReactNode;
}> = ({durationInFrames, zoom = 1.07, pan = [0, 0], fade = true, children}) => {
  const frame = useCurrentFrame();
  const t = Math.min(1, Math.max(0, frame / Math.max(1, durationInFrames)));
  const scale = 1 + (zoom - 1) * t;
  const tx = pan[0] * t;
  const ty = pan[1] * t;
  const opacity = fade
    ? interpolate(
        frame,
        [0, 8, durationInFrames - 8, durationInFrames],
        [0, 1, 1, 0],
        {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
      )
    : 1;
  return (
    <AbsoluteFill style={{backgroundColor: BG, opacity}}>
      <AbsoluteFill
        style={{
          transform: `scale(${scale}) translate(${tx}px, ${ty}px)`,
        }}
      >
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Parallax: React.FC<{
  depth: number;
  durationInFrames: number;
  children: React.ReactNode;
}> = ({depth, durationInFrames, children}) => {
  const frame = useCurrentFrame();
  const t = frame / Math.max(1, durationInFrames);
  return (
    <AbsoluteFill
      style={{transform: `translate(${-depth * 40 * t}px, ${-depth * 12 * t}px)`}}
    >
      {children}
    </AbsoluteFill>
  );
};
