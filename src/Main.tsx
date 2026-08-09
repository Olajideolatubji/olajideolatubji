import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import timelineData from './timeline.json';
import type {Timeline, SceneSpec} from './timelineTypes';
import {BG, dbToGain, ensureFonts} from './theme';
import {FilmGrain, Vignette} from './components/Atmosphere';
import {CounterOverlay, LedgerOpen, StatCard, useShake} from './components/Recurring';
import {NightFlight, MissingFile, LedgerIntro} from './scenes/ColdOpen';
import {
  NineDaysQuestion,
  GoodBillionaire,
  BackDoor,
  NineDaysTimeline,
  WealthWipe,
  Verdict,
} from './scenes/Ftx';
import {MagicTrick, EdisonBox, TheTurn, Turtleneck, BoxSwap, ThreadPull} from './scenes/Theranos';
import {
  JournalistsFlip,
  DaxMiracle,
  FtStack,
  StateEnforced,
  PhoneCall,
  MarsalekEscape,
} from './scenes/Wirecard';
import {
  InnovativeTrophies,
  MachineOne,
  MachineTwo,
  Blackout,
  CrashChart,
  Shredder,
  ImaginaryBridge,
} from './scenes/Enron';
import {
  StageQueen,
  Wembley,
  BlockchainVsDb,
  PyramidScene,
  AirportVanish,
  Manhunt,
  Sightings,
  GraveOrGhost,
} from './scenes/OneCoin';
import {LedgerRecap, NextOne, TeaseAndLogo} from './scenes/Close';
import {QuoteBridge} from './scenes/Bridge';

const timeline = timelineData as unknown as Timeline;

const SCENE_COMPONENTS: Record<string, React.FC<any>> = {
  'night-flight': NightFlight,
  'missing-file': MissingFile,
  'ledger-intro': LedgerIntro,
  'nine-days-question': NineDaysQuestion,
  'good-billionaire': GoodBillionaire,
  'back-door': BackDoor,
  'nine-days-timeline': NineDaysTimeline,
  'wealth-wipe': WealthWipe,
  verdict: Verdict,
  'magic-trick': MagicTrick,
  'edison-box': EdisonBox,
  'the-turn': TheTurn,
  turtleneck: Turtleneck,
  'box-swap': BoxSwap,
  'thread-pull': ThreadPull,
  'journalists-flip': JournalistsFlip,
  'dax-miracle': DaxMiracle,
  'ft-stack': FtStack,
  'state-enforced': StateEnforced,
  'phone-call': PhoneCall,
  'marsalek-escape': MarsalekEscape,
  trophies: InnovativeTrophies,
  'machine-one': MachineOne,
  'machine-two': MachineTwo,
  blackout: Blackout,
  'crash-chart': CrashChart,
  shredder: Shredder,
  'imaginary-bridge': ImaginaryBridge,
  'stage-queen': StageQueen,
  wembley: Wembley,
  'blockchain-vs-db': BlockchainVsDb,
  pyramid: PyramidScene,
  'airport-vanish': AirportVanish,
  manhunt: Manhunt,
  sightings: Sightings,
  'grave-or-ghost': GraveOrGhost,
  'ledger-recap': LedgerRecap,
  'next-one': NextOne,
  'tease-logo': TeaseAndLogo,
  bridge: QuoteBridge,
};

const MUSIC_BASE_DB = -22;
const MUSIC_DUCKED_DB = -28;

export const Main: React.FC = () => {
  ensureFonts();
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const impactTimes = useMemo(
    () => [...timeline.ledgers.map((l) => l.at), ...timeline.slams.map((s) => s.at)],
    []
  );
  const shake = useShake(impactTimes, fps);

  const musicVolume = useMemo(() => {
    const silences: Array<[number, number]> = timeline.stats.map((s) => [s.at - 1, s.at]);
    const speech = timeline.speech;
    const endFade = timeline.durationSec;
    return (f: number) => {
      const t = f / fps;
      // hard silence window before each stat (with 3-frame edge ramps)
      for (const [a, b] of silences) {
        if (t >= a - 0.1 && t <= b) {
          const rampIn = interpolate(t, [a - 0.1, a], [1, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return dbToGain(MUSIC_BASE_DB) * rampIn;
        }
      }
      let speaking = false;
      for (const [a, b] of speech) {
        if (t >= a && t <= b) {
          speaking = true;
          break;
        }
        if (a > t) break;
      }
      let g = dbToGain(speaking ? MUSIC_DUCKED_DB : MUSIC_BASE_DB);
      // fade in at start, fade out over the last 2.5s
      g *= interpolate(t, [0, 2], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
      g *= interpolate(t, [endFade - 2.5, endFade - 0.2], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      });
      return g;
    };
  }, [fps]);

  const toF = (sec: number) => Math.round(sec * fps);

  return (
    <AbsoluteFill style={{backgroundColor: BG}}>
      <AbsoluteFill style={{transform: shake}}>
        {/* SCENES */}
        {timeline.scenes.map((scene: SceneSpec) => {
          const Comp = SCENE_COMPONENTS[scene.type];
          if (!Comp) {
            throw new Error(`Unknown scene type: ${scene.type}`);
          }
          const from = toF(scene.start);
          const dur = Math.max(1, toF(scene.end) - from);
          return (
            <Sequence key={scene.id} from={from} durationInFrames={dur} name={scene.id}>
              <Comp durationInFrames={dur} sceneStart={scene.start} fps={fps} {...(scene.props ?? {})} />
            </Sequence>
          );
        })}

        {/* LEDGER OPENS (the ritual) */}
        {timeline.ledgers.map((l) => {
          const from = toF(l.at);
          const dur = toF(2.8);
          return (
            <Sequence key={`ledger-${l.entry}`} from={from} durationInFrames={dur} name={`ledger-${l.title}`}>
              <LedgerOpen entry={l.entry} title={l.title} amount={l.amount} sub={l.sub} durationInFrames={dur} />
            </Sequence>
          );
        })}

        {/* STAT CARDS (hard cuts, above scenes) */}
        {timeline.stats.map((s, i) => {
          const from = toF(s.at);
          const dur = toF(s.hold);
          return (
            <Sequence key={`stat-${i}`} from={from} durationInFrames={dur} name={`stat-${s.number}`}>
              <StatCard number={s.number} caption={s.caption} />
            </Sequence>
          );
        })}

        {/* THE COUNTER */}
        <CounterOverlay slams={timeline.slams} visibleFrom={toF(timeline.ledgers[0].at + 2.2)} />
      </AbsoluteFill>

      {/* Global atmosphere on top of everything */}
      <FilmGrain opacity={0.08} />
      <Vignette strength={0.5} />

      {/* AUDIO */}
      <Audio src={staticFile('voiceover.mp3')} volume={1} />
      <Audio src={staticFile('music.wav')} loop volume={musicVolume} />
      {impactTimes.map((t, i) => (
        <Sequence key={`impact-${i}`} from={toF(t)} durationInFrames={toF(2.4)} name="impact">
          <Audio src={staticFile('impact.wav')} volume={0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
