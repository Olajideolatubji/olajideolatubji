import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {SceneShell} from '../components/SceneShell';
import {INK, RED, SERIF} from '../theme';

/** Generic between-chapter beat: a line of serif text with a red emphasis. */
export const QuoteBridge: React.FC<{
  durationInFrames: number;
  line: string;
  emphasis?: string;
}> = ({durationInFrames, line, emphasis}) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [6, 20], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const eO = interpolate(frame, [Math.min(40, durationInFrames * 0.4), Math.min(54, durationInFrames * 0.4 + 14)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.05}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{textAlign: 'center', maxWidth: 1400}}>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 60, color: INK, lineHeight: 1.5, opacity: o}}>
            {line}
          </div>
          {emphasis ? (
            <div
              style={{
                marginTop: 46,
                fontFamily: SERIF,
                fontSize: 74,
                color: RED,
                opacity: eO,
                textShadow: '0 0 50px rgba(193,18,31,0.35)',
              }}
            >
              {emphasis}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
