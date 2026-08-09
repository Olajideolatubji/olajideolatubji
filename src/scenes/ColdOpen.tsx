import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {SceneShell, Parallax} from '../components/SceneShell';
import {PlaneSilhouette} from '../components/Silhouettes';
import {DrawRule, Label, SerifText, WordReveal} from '../components/Text';
import {BG, INK, RED, SERIF, STAT_FONT} from '../theme';

/** Cold open: night sky, plane crossing, SOFIA -> ATHENS route line drawing. */
export const NightFlight: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const d = durationInFrames;
  const planeX = interpolate(frame, [0, d], [-300, 2100]);
  const planeY = interpolate(frame, [0, d], [420, 300]);
  const routeT = interpolate(frame, [d * 0.15, d * 0.75], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const stars = [...Array(70)].map((_, i) => {
    const sx = (i * 271) % 1920;
    const sy = (i * 157) % 720;
    const tw = 0.25 + 0.55 * Math.abs(Math.sin(frame / 22 + i));
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: sx,
          top: sy,
          width: i % 7 === 0 ? 3 : 2,
          height: i % 7 === 0 ? 3 : 2,
          borderRadius: 2,
          background: INK,
          opacity: tw * 0.5,
        }}
      />
    );
  });
  return (
    <SceneShell durationInFrames={d} zoom={1.09}>
      <Parallax depth={0.4} durationInFrames={d}>
        {stars}
      </Parallax>
      {/* route line */}
      <svg width={1920} height={1080} style={{position: 'absolute'}}>
        <path
          id="route"
          d="M 320 760 C 700 560 1250 560 1610 700"
          fill="none"
          stroke={RED}
          strokeWidth={4}
          strokeDasharray={1500}
          strokeDashoffset={1500 * (1 - routeT)}
          style={{filter: 'drop-shadow(0 0 8px rgba(193,18,31,0.6))'}}
        />
        <circle cx={320} cy={760} r={10} fill={RED} />
        {routeT >= 1 ? <circle cx={1610} cy={700} r={10} fill={RED} /> : null}
      </svg>
      <div style={{position: 'absolute', left: 250, top: 790, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 34, letterSpacing: '0.3em', color: INK}}>
        SOFIA
      </div>
      <div style={{position: 'absolute', left: 1550, top: 730, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 34, letterSpacing: '0.3em', color: INK, opacity: routeT >= 1 ? 1 : 0.25}}>
        ATHENS
      </div>
      <div style={{position: 'absolute', left: 250, top: 130}}>
        <Label size={28} color={RED} spacing="0.5em">October 2017</Label>
        <div style={{marginTop: 18}}>
          <SerifText size={40} color={INK} style={{opacity: 0.85}}>
            Flight time: 1h 25m
          </SerifText>
        </div>
        <DrawRule width={340} from={10} style={{marginTop: 22}} />
      </div>
      {/* clouds */}
      <Parallax depth={1.4} durationInFrames={d}>
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 200 + i * 520,
              top: 200 + (i % 2) * 340,
              width: 500,
              height: 120,
              borderRadius: 120,
              background: 'radial-gradient(ellipse, rgba(20,20,24,0.9), rgba(11,11,13,0))',
            }}
          />
        ))}
      </Parallax>
      <div
        style={{
          position: 'absolute',
          left: planeX,
          top: planeY,
          filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.9))',
        }}
      >
        <PlaneSilhouette size={300} color="#020203" />
      </div>
    </SceneShell>
  );
};

/** FBI case file: silhouette with question mark, redacted bars. */
export const MissingFile: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.08} pan={[-20, 0]}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            width: 1180,
            height: 760,
            background: 'linear-gradient(140deg, #141317 0%, #0f0e11 100%)',
            border: '1px solid #26242a',
            boxShadow: '0 40px 120px rgba(0,0,0,0.75)',
            display: 'flex',
            padding: 60,
            gap: 60,
            transform: `rotate(-1.2deg)`,
          }}
        >
          <div
            style={{
              width: 340,
              height: 430,
              background: '#0a090b',
              border: '1px solid #2c2a31',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'flex-end',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {/* head-and-shoulders silhouette, featureless */}
            <svg width={260} height={330} viewBox="0 0 130 165">
              <ellipse cx={65} cy={52} rx={30} ry={38} fill="#040405" />
              <path d="M20 165 C20 110 110 110 110 165 Z" fill="#040405" />
            </svg>
            <div
              style={{
                position: 'absolute',
                top: 30,
                width: '100%',
                textAlign: 'center',
                fontFamily: STAT_FONT,
                fontWeight: 700,
                fontSize: 110,
                color: RED,
                opacity: 0.9 * Math.min(1, frame / 20),
              }}
            >
              ?
            </div>
          </div>
          <div style={{flex: 1}}>
            <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 54, letterSpacing: '0.12em', color: INK}}>
              FEDERAL BUREAU OF INVESTIGATION
            </div>
            <div style={{fontFamily: STAT_FONT, fontWeight: 500, fontSize: 30, letterSpacing: '0.3em', color: RED, marginTop: 14}}>
              WANTED — FRAUD · MONEY LAUNDERING
            </div>
            {/* redacted bars */}
            {[380, 300, 460, 250, 420].map((w, i) => (
              <div
                key={i}
                style={{
                  width: interpolate(frame, [12 + i * 5, 24 + i * 5], [0, w], {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                  }),
                  height: 30,
                  background: '#1c1a1f',
                  marginTop: 26,
                }}
              />
            ))}
            <div
              style={{
                marginTop: 46,
                fontFamily: SERIF,
                fontStyle: 'italic',
                fontSize: 44,
                color: RED,
                opacity: Math.min(1, Math.max(0, (frame - 50) / 15)),
              }}
            >
              Whereabouts unknown.
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Five ghost entries tally + title reveal: THE RED LEDGER. */
export const LedgerIntro: React.FC<{durationInFrames: number; titleAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  titleAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const titleFrame = Math.max(0, Math.round((titleAtSec - sceneStart) * fps));
  const names = ['ENTRY 01', 'ENTRY 02', 'ENTRY 03', 'ENTRY 04', 'ENTRY 05'];
  const titleO = interpolate(frame, [titleFrame, titleFrame + 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{width: 1100, opacity: 1 - titleO * 0.85}}>
          {names.map((n, i) => {
            const s = 6 + i * 9;
            const o = interpolate(frame, [s, s + 8], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(234,234,234,0.14)',
                  padding: '26px 10px',
                  opacity: o,
                }}
              >
                <div style={{fontFamily: SERIF, fontSize: 40, color: INK, letterSpacing: '0.25em'}}>{n}</div>
                <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 40, color: RED}}>
                  {'█'.repeat(6)}
                </div>
              </div>
            );
          })}
          <div style={{display: 'flex', justifyContent: 'space-between', padding: '30px 10px'}}>
            <div style={{fontFamily: STAT_FONT, fontWeight: 600, fontSize: 38, letterSpacing: '0.3em', color: INK}}>
              COMBINED
            </div>
            <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 46, color: RED}}>
              $100,000,000,000+
            </div>
          </div>
        </div>
        {/* Title overlay */}
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: titleO}}>
          <AbsoluteFill style={{background: BG, opacity: 0.92}} />
          <div style={{textAlign: 'center', transform: `scale(${0.96 + 0.04 * titleO})`}}>
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 150,
                color: RED,
                letterSpacing: '0.18em',
                textShadow: '0 0 80px rgba(193,18,31,0.45)',
              }}
            >
              THE RED LEDGER
            </div>
            <div style={{fontFamily: STAT_FONT, fontWeight: 500, fontSize: 30, letterSpacing: '0.6em', color: INK, marginTop: 24, opacity: 0.85}}>
              FIVE ENTRIES · ONE LIE
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};
