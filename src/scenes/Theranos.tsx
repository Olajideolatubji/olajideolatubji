import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {SceneShell} from '../components/SceneShell';
import {SuitFigureRow, TurtleneckBust} from '../components/Silhouettes';
import {DrawRule, Label, SerifText} from '../components/Text';
import {INK, RED, SERIF, STAT_FONT} from '../theme';

/** Three acts of a magic trick appear under a spotlight. */
export const MagicTrick: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const acts = ['THE PLEDGE', 'THE TURN', 'THE PRESTIGE'];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            width: 900,
            height: 1080,
            background: 'radial-gradient(ellipse at 50% 0%, rgba(234,234,234,0.07), rgba(11,11,13,0) 65%)',
          }}
        />
        <div style={{display: 'flex', flexDirection: 'column', gap: 70, alignItems: 'center'}}>
          {acts.map((a, i) => {
            const s = 14 + i * 26;
            const o = interpolate(frame, [s, s + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            const y = interpolate(frame, [s, s + 10], [30, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return (
              <div key={a} style={{opacity: o, transform: `translateY(${y}px)`, textAlign: 'center'}}>
                <div style={{fontFamily: SERIF, fontSize: 30, color: RED, letterSpacing: '0.4em'}}>
                  {['I', 'II', 'III'][i]}
                </div>
                <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 96, color: i === 2 ? RED : INK, letterSpacing: '0.1em', marginTop: 8}}>
                  {a}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{position: 'absolute', bottom: 110, fontFamily: SERIF, fontStyle: 'italic', fontSize: 34, color: INK, opacity: 0.6}}>
          performed on the entire American medical system
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** The Edison: printer-sized box, one drop of blood, radiating test lines. */
export const EdisonBox: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const dropY = interpolate(frame, [10, 26], [-160, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const rays = interpolate(frame, [30, 80], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.08}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <svg width={1920} height={1080}>
          {[...Array(12)].map((_, i) => {
            const a = (i / 12) * Math.PI * 2;
            const r1 = 260;
            const r2 = 260 + 240 * rays;
            return (
              <line
                key={i}
                x1={960 + Math.cos(a) * r1}
                y1={540 + Math.sin(a) * r1 * 0.62}
                x2={960 + Math.cos(a) * r2}
                y2={540 + Math.sin(a) * r2 * 0.62}
                stroke="rgba(234,234,234,0.22)"
                strokeWidth={2}
              />
            );
          })}
        </svg>
        <div
          style={{
            position: 'absolute',
            width: 420,
            height: 300,
            background: 'linear-gradient(160deg, #1a191d, #101014)',
            border: '1px solid #2c2a31',
            borderRadius: 10,
            boxShadow: '0 40px 100px rgba(0,0,0,0.8)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{position: 'absolute', top: 24, left: 30, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 24, letterSpacing: '0.35em', color: INK, opacity: 0.6}}>
            EDISON
          </div>
          {/* blood drop */}
          <svg width={70} height={90} viewBox="0 0 35 45" style={{transform: `translateY(${dropY}px)`}}>
            <path d="M17.5 2 C24 14 33 22 33 31 a15.5 15.5 0 1 1 -31 0 C2 22 11 14 17.5 2 Z" fill={RED} />
          </svg>
          <div style={{position: 'absolute', bottom: 20, width: 300, height: 8, background: 'rgba(193,18,31,0.4)'}} />
        </div>
        <div style={{position: 'absolute', top: 140, width: '100%', textAlign: 'center'}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.8}}>
            hundreds of tests · one drop
          </Label>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            width: '100%',
            textAlign: 'center',
            opacity: interpolate(frame, [durationInFrames * 0.6, durationInFrames * 0.6 + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <span style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 46, color: INK}}>
            the world's youngest self-made female billionaire —{' '}
          </span>
          <span style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 46, color: RED, letterSpacing: '0.1em'}}>
            ON PAPER
          </span>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Board of grey eminences + the one question. */
export const TheTurn: React.FC<{durationInFrames: number; questionAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  questionAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const qF = Math.max(0, Math.round((questionAtSec - sceneStart) * fps));
  const qO = interpolate(frame, [qF, qF + 10], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07} pan={[0, -10]}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{opacity: 1 - qO * 0.9, textAlign: 'center'}}>
          <div style={{display: 'flex', justifyContent: 'center', filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.9))'}}>
            <SuitFigureRow count={6} height={300} gap={34} />
          </div>
          <div style={{marginTop: 50}}>
            <Label size={28} color={INK} spacing="0.35em" style={{opacity: 0.75}}>
              two former secretaries of state · walgreens · $700M
            </Label>
          </div>
        </div>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: qO}}>
          <div style={{textAlign: 'center'}}>
            <SerifText size={70} color={INK} style={{fontStyle: 'italic'}}>
              does the box actually work?
            </SerifText>
            <div
              style={{
                fontFamily: STAT_FONT,
                fontWeight: 700,
                fontSize: 300,
                color: RED,
                lineHeight: 1.1,
                textShadow: '0 0 90px rgba(193,18,31,0.5)',
              }}
            >
              ?
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Turtleneck bust + voice pitch dropping an octave (animated waveform). */
export const Turtleneck: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const drop = interpolate(frame, [40, 110], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const n = 90;
  const pts: string[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = 260 + k * 700;
    const freq = 26 - 15 * drop;
    const amp = 26 + 26 * drop;
    const y = 800 + Math.sin(k * freq + frame / 6) * amp;
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.09} pan={[14, 0]}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            position: 'absolute',
            right: 240,
            bottom: 0,
            filter: 'drop-shadow(-30px 0 80px rgba(0,0,0,0.9))',
          }}
        >
          <TurtleneckBust height={860} />
        </div>
        {/* rim light */}
        <div
          style={{
            position: 'absolute',
            right: 210,
            bottom: 0,
            width: 500,
            height: 900,
            background: 'radial-gradient(ellipse at 80% 30%, rgba(234,234,234,0.06), rgba(11,11,13,0) 60%)',
          }}
        />
        <div style={{position: 'absolute', left: 240, top: 200, maxWidth: 760}}>
          <Label size={30} color={RED} spacing="0.4em">
            engineered
          </Label>
          <SerifText size={52} color={INK} style={{marginTop: 30, lineHeight: 1.5}}>
            The turtleneck. The stare.
            <br />
            The voice — an octave lower.
          </SerifText>
        </div>
        <svg width={1920} height={1080} style={{position: 'absolute'}}>
          <path d={pts.join(' ')} fill="none" stroke={RED} strokeWidth={4} opacity={0.9} style={{filter: 'drop-shadow(0 0 8px rgba(193,18,31,0.5))'}} />
        </svg>
        <div style={{position: 'absolute', left: 260, top: 880, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 24, letterSpacing: '0.35em', color: INK, opacity: 0.55}}>
          PITCH −1 OCTAVE
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** The swap: vial path bypasses the Edison to commercial analyzers. */
export const BoxSwap: React.FC<{durationInFrames: number; voidAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  voidAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vF = Math.max(0, Math.round((voidAtSec - sceneStart) * fps));
  const pathT = interpolate(frame, [16, 90], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const voidO = interpolate(frame, [vF, vF + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const voidS = interpolate(frame, [vF, vF + 6], [2, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <svg width={1920} height={1080}>
          {/* front: Edison box */}
          <rect x={430} y={420} width={300} height={220} fill="#141318" stroke="#2c2a31" />
          {/* back: commercial analyzers */}
          <rect x={1270} y={330} width={220} height={160} fill="#141318" stroke="#2c2a31" />
          <rect x={1270} y={530} width={220} height={160} fill="#141318" stroke="#2c2a31" />
          {/* honest path (never used) */}
          <line x1={300} y1={530} x2={430} y2={530} stroke="rgba(234,234,234,0.35)" strokeWidth={4} />
          {/* the real path: around the box, out the back */}
          <path
            d="M 300 530 C 380 700 700 780 960 760 C 1160 745 1240 640 1310 610"
            fill="none"
            stroke={RED}
            strokeWidth={6}
            strokeDasharray={1400}
            strokeDashoffset={1400 * (1 - pathT)}
            style={{filter: 'drop-shadow(0 0 10px rgba(193,18,31,0.5))'}}
          />
          {/* vial */}
          <circle
            cx={300}
            cy={530}
            r={14}
            fill={RED}
          />
        </svg>
        <div style={{position: 'absolute', left: 440, top: 350, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 30, letterSpacing: '0.25em', color: INK}}>
          THE EDISON
        </div>
        <div style={{position: 'absolute', left: 435, top: 470, width: 290, textAlign: 'center', fontFamily: SERIF, fontStyle: 'italic', fontSize: 30, color: INK, opacity: 0.5}}>
          never used
        </div>
        <div style={{position: 'absolute', left: 1240, top: 260, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 28, letterSpacing: '0.2em', color: INK, opacity: 0.8}}>
          COMMERCIAL MACHINES
        </div>
        <div style={{position: 'absolute', left: 700, top: 800, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 30, letterSpacing: '0.3em', color: RED, opacity: pathT >= 1 ? 1 : 0.3}}>
          OUT THE BACK
        </div>
        {/* VOIDED stamp */}
        <div
          style={{
            position: 'absolute',
            top: 130,
            right: 200,
            border: `6px solid ${RED}`,
            color: RED,
            fontFamily: STAT_FONT,
            fontWeight: 700,
            fontSize: 76,
            padding: '14px 40px',
            transform: `rotate(-8deg) scale(${voidS})`,
            opacity: voidO,
            letterSpacing: '0.15em',
          }}
        >
          EVERY RESULT VOIDED
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** WSJ pulls the thread; empire unravels; 11 years. */
export const ThreadPull: React.FC<{durationInFrames: number; yearsAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  yearsAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const yF = Math.max(0, Math.round((yearsAtSec - sceneStart) * fps));
  const pull = interpolate(frame, [10, durationInFrames * 0.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const yO = interpolate(frame, [yF, yF + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  // Unraveling thread spiral
  const pts: string[] = [];
  const n = 140;
  for (let i = 0; i <= n * pull; i++) {
    const k = i / n;
    const a = k * Math.PI * 7;
    const r = 300 * (1 - k * 0.8);
    const x = 700 - k * 260 + Math.cos(a) * r * 0.5;
    const y = 480 + Math.sin(a) * r * 0.3 + k * 160;
    pts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{opacity: 1 - yO * 0.85}}>
          <div style={{position: 'absolute', left: 240, top: 180, maxWidth: 640}}>
            <Label size={28} color={INK} spacing="0.35em" style={{opacity: 0.8}}>
              2015 · the wall street journal
            </Label>
            <SerifText size={48} color={INK} style={{marginTop: 26, lineHeight: 1.5}}>
              One reporter started pulling the thread.
            </SerifText>
            <SerifText size={34} color={INK} style={{marginTop: 26, opacity: 0.6, fontStyle: 'italic'}}>
              Theranos sued. Threatened. Surveilled.
            </SerifText>
          </div>
          <svg width={1920} height={1080} style={{position: 'absolute', left: 0, top: 0}}>
            <path d={pts.join(' ')} fill="none" stroke={RED} strokeWidth={4} opacity={0.95} style={{filter: 'drop-shadow(0 0 8px rgba(193,18,31,0.45))'}} />
          </svg>
          {/* watching eye */}
          <div style={{position: 'absolute', right: 300, top: 240, opacity: 0.55}}>
            <svg width={140} height={80} viewBox="0 0 70 40">
              <path d="M4 20 C20 2 50 2 66 20 C50 38 20 38 4 20 Z" fill="none" stroke={INK} strokeWidth={2.5} />
              <circle cx={35} cy={20} r={8} fill={RED} />
            </svg>
          </div>
        </div>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: yO}}>
          <div style={{textAlign: 'center'}}>
            <Label size={32} color={INK} spacing="0.4em" style={{opacity: 0.75}}>
              by 2018 · theranos was ash
            </Label>
            <div
              style={{
                marginTop: 30,
                display: 'inline-block',
                border: `6px solid ${RED}`,
                color: RED,
                fontFamily: STAT_FONT,
                fontWeight: 700,
                fontSize: 140,
                lineHeight: 1,
                padding: '24px 60px',
                transform: 'rotate(-5deg)',
              }}
            >
              11 YEARS
            </div>
            <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 38, color: INK, marginTop: 48, opacity: 0.85}}>
              the turtleneck was the only part that was real
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};
