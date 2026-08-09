import React from 'react';
import {Composition} from 'remotion';
import {Main} from './Main';
import timelineData from './timeline.json';

const FPS = 30;
const duration = Math.ceil((timelineData as {durationSec: number}).durationSec * FPS);

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="Main"
      component={Main}
      durationInFrames={duration}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
