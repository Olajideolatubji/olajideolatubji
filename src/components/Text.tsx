import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {INK, RED, STAT_FONT, SERIF} from '../theme';

export const BigNumber: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({children, size = 220, color = RED, style}) => (
  <div
    style={{
      fontFamily: STAT_FONT,
      fontWeight: 700,
      fontSize: size,
      color,
      letterSpacing: '-0.01em',
      lineHeight: 1,
      fontVariantNumeric: 'tabular-nums',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Caption: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({children, size = 34, color = INK, style}) => (
  <div
    style={{
      fontFamily: STAT_FONT,
      fontWeight: 500,
      fontSize: size,
      color,
      letterSpacing: '0.35em',
      textTransform: 'uppercase',
      ...style,
    }}
  />
);

// Caption above renders empty; real one below (keep API simple).
export const Label: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  spacing?: string;
  style?: React.CSSProperties;
}> = ({children, size = 34, color = INK, spacing = '0.35em', style}) => (
  <div
    style={{
      fontFamily: STAT_FONT,
      fontWeight: 500,
      fontSize: size,
      color,
      letterSpacing: spacing,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
);

export const SerifText: React.FC<{
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}> = ({children, size = 44, color = INK, style}) => (
  <div style={{fontFamily: SERIF, fontSize: size, color, ...style}}>
    {children}
  </div>
);

/** Words fade/rise in one after another starting at `from` (frames). */
export const WordReveal: React.FC<{
  text: string;
  from?: number;
  perWord?: number;
  size?: number;
  color?: string;
  fontFamily?: string;
  fontWeight?: number;
  style?: React.CSSProperties;
}> = ({
  text,
  from = 0,
  perWord = 3,
  size = 60,
  color = INK,
  fontFamily = STAT_FONT,
  fontWeight = 600,
  style,
}) => {
  const frame = useCurrentFrame();
  const words = text.split(' ');
  return (
    <div
      style={{
        fontFamily,
        fontWeight,
        fontSize: size,
        color,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: '0.35em',
        ...style,
      }}
    >
      {words.map((w, i) => {
        const s = from + i * perWord;
        const o = interpolate(frame, [s, s + 6], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const y = interpolate(frame, [s, s + 6], [14, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <span key={i} style={{opacity: o, transform: `translateY(${y}px)`, display: 'inline-block'}}>
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** Red rule that draws itself horizontally. */
export const DrawRule: React.FC<{
  width: number;
  from?: number;
  dur?: number;
  color?: string;
  thickness?: number;
  style?: React.CSSProperties;
}> = ({width, from = 0, dur = 20, color = RED, thickness = 4, style}) => {
  const frame = useCurrentFrame();
  const w = interpolate(frame, [from, from + dur], [0, width], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return <div style={{width: w, height: thickness, background: color, ...style}} />;
};
