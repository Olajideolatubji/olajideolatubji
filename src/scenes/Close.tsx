import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame} from 'remotion';
import {SceneShell} from '../components/SceneShell';
import {CityGrid} from '../components/Silhouettes';
import {Label, SerifText} from '../components/Text';
import {BG, INK, RED, SERIF, STAT_FONT} from '../theme';

/** Recap: five entries listed; TRUST ME lands huge. */
export const LedgerRecap: React.FC<{durationInFrames: number; trustAtSec?: number; sceneStart?: number; fps?: number}> = ({
  durationInFrames,
  trustAtSec = 0,
  sceneStart = 0,
  fps = 30,
}) => {
  const frame = useCurrentFrame();
  const tF = Math.max(0, Math.round((trustAtSec - sceneStart) * fps));
  const entries = [
    ['FTX', 'a back door', '$32B'],
    ['THERANOS', 'a magic box', '$9B'],
    ['WIRECARD', 'a phantom account', '€24B'],
    ['ENRON', 'a lie factory', '$101B'],
    ['ONECOIN', 'a spreadsheet', '$4B+'],
  ];
  const trustO = interpolate(frame, [tF, tF + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const trustS = interpolate(frame, [tF, tF + 8], [1.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.05}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{width: 1240, opacity: 1 - trustO * 0.88}}>
          {entries.map(([name, thing, amt], i) => {
            const s = 8 + i * 12;
            const o = interpolate(frame, [s, s + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
            return (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(234,234,234,0.13)',
                  padding: '24px 8px',
                  opacity: o,
                }}
              >
                <div style={{fontFamily: SERIF, fontSize: 46, color: INK, width: 320}}>{name}</div>
                <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 32, color: INK, opacity: 0.55, flex: 1}}>{thing}</div>
                <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 46, color: RED}}>{amt}</div>
              </div>
            );
          })}
        </div>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: trustO}}>
          <AbsoluteFill style={{background: BG, opacity: 0.9}} />
          <div
            style={{
              fontFamily: STAT_FONT,
              fontWeight: 700,
              fontSize: 260,
              color: RED,
              letterSpacing: '0.04em',
              transform: `scale(${trustS})`,
              textShadow: '0 0 100px rgba(193,18,31,0.5)',
            }}
          >
            TRUST ME
          </div>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 40, color: INK, marginTop: 40, opacity: 0.8}}>
            the same two words, doing all the work
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** "Right now, somewhere…" one lit red window in a dark skyline. */
export const NextOne: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const litO = interpolate(frame, [durationInFrames * 0.35, durationInFrames * 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.09} pan={[0, -16]}>
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
        <CityGrid width={1920} height={560} litRatio={0.25} />
        {/* THE window */}
        <div
          style={{
            position: 'absolute',
            left: 1128,
            bottom: 318,
            width: 10,
            height: 13,
            background: RED,
            boxShadow: `0 0 ${18 + 8 * Math.sin(frame / 9)}px rgba(193,18,31,0.9)`,
            opacity: litO,
          }}
        />
        <div style={{position: 'absolute', top: 170, width: '100%', textAlign: 'center'}}>
          <SerifText size={56} color={INK} style={{fontStyle: 'italic', opacity: 0.9}}>
            Right now, somewhere, a company you've heard of is faking it.
          </SerifText>
          <div
            style={{
              marginTop: 36,
              fontFamily: STAT_FONT,
              fontWeight: 600,
              fontSize: 34,
              letterSpacing: '0.35em',
              color: RED,
              opacity: litO,
            }}
          >
            THE LEDGER'S ALREADY OPEN ON THEM
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Tease next episode + final logo card. */
export const TeaseAndLogo: React.FC<{durationInFrames: number; logoAtSec?: number; sceneStart?: number; fps?: number}> = ({
  durationInFrames,
  logoAtSec = 0,
  sceneStart = 0,
  fps = 30,
}) => {
  const frame = useCurrentFrame();
  const lF = Math.max(0, Math.round((logoAtSec - sceneStart) * fps));
  const logoO = interpolate(frame, [lF, lF + 16], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const stamps = ['BANK A', 'BANK B', 'BANK C'];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.04} fade={false}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{opacity: 1 - logoO, textAlign: 'center'}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.8}}>
            next entry
          </Label>
          <div style={{position: 'relative', marginTop: 50, display: 'inline-block'}}>
            {/* skyscraper */}
            <svg width={220} height={480} viewBox="0 0 55 120">
              <path d="M12 120 L12 24 L27.5 6 L43 24 L43 120 Z" fill="#0e0d10" stroke="#2c2a31" strokeWidth={1} />
              {[...Array(9)].map((_, r) => (
                <g key={r}>
                  <rect x={18} y={30 + r * 9} width={5} height={5} fill="rgba(234,234,234,0.12)" />
                  <rect x={26} y={30 + r * 9} width={5} height={5} fill="rgba(234,234,234,0.12)" />
                  <rect x={34} y={30 + r * 9} width={5} height={5} fill="rgba(234,234,234,0.12)" />
                </g>
              ))}
            </svg>
            {stamps.map((s, i) => {
              const sf = 20 + i * 16;
              const o = interpolate(frame, [sf, sf + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return (
                <div
                  key={s}
                  style={{
                    position: 'absolute',
                    left: 180 + (i % 2) * 40,
                    top: 60 + i * 120,
                    border: `4px solid ${RED}`,
                    color: RED,
                    fontFamily: STAT_FONT,
                    fontWeight: 700,
                    fontSize: 30,
                    letterSpacing: '0.15em',
                    padding: '8px 20px',
                    transform: `rotate(${-8 + i * 5}deg)`,
                    opacity: o,
                    whiteSpace: 'nowrap',
                    background: 'rgba(11,11,13,0.85)',
                  }}
                >
                  SOLD TO {s}
                </div>
              );
            })}
          </div>
          <div style={{marginTop: 40, fontFamily: SERIF, fontStyle: 'italic', fontSize: 38, color: INK, opacity: 0.85}}>
            the man who sold the same skyscraper… to three different banks
          </div>
          <div style={{marginTop: 30, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 30, letterSpacing: '0.4em', color: RED}}>
            SUBSCRIBE — THE NEXT AUTOPSY IS ON THE TABLE
          </div>
        </div>
        {/* LOGO CARD */}
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: logoO}}>
          <AbsoluteFill style={{background: BG}} />
          <div style={{textAlign: 'center', transform: `scale(${0.97 + 0.05 * Math.min(1, (frame - lF) / 90)})`}}>
            <div style={{width: 150, height: 4, background: RED, margin: '0 auto 50px'}} />
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 160,
                color: RED,
                letterSpacing: '0.18em',
                textShadow: '0 0 90px rgba(193,18,31,0.45)',
              }}
            >
              THE RED LEDGER
            </div>
            <div style={{width: 150, height: 4, background: RED, margin: '50px auto 0'}} />
            <div style={{fontFamily: STAT_FONT, fontWeight: 500, fontSize: 26, letterSpacing: '0.55em', color: INK, marginTop: 44, opacity: 0.75}}>
              ENTRY SIX IS ALREADY BEING WRITTEN
            </div>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};
