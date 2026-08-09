import React from 'react';
import {AbsoluteFill, staticFile, useCurrentFrame} from 'remotion';

// Film grain: pre-generated noise tile, jittered every frame.
export const FilmGrain: React.FC<{opacity?: number}> = ({opacity = 0.07}) => {
  const frame = useCurrentFrame();
  const x = ((frame * 97) % 512) - 256;
  const y = ((frame * 61) % 512) - 256;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        backgroundImage: `url(${staticFile('noise.png')})`,
        backgroundRepeat: 'repeat',
        backgroundPosition: `${x}px ${y}px`,
        opacity,
        mixBlendMode: 'overlay',
      }}
    />
  );
};

export const Vignette: React.FC<{strength?: number}> = ({strength = 0.55}) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 45%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);
