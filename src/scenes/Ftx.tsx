import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {SceneShell, Parallax} from '../components/SceneShell';
import {SeatedBeanbagFigure, GavelIcon} from '../components/Silhouettes';
import {DrawRule, Label, SerifText} from '../components/Text';
import {INK, RED, SERIF, STAT_FONT} from '../theme';

/** "How long does it take to destroy a $32B company?" -> TRY NINE DAYS */
export const NineDaysQuestion: React.FC<{durationInFrames: number; nineAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  nineAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nineF = Math.max(20, Math.round((nineAtSec - sceneStart) * fps));
  const nineO = interpolate(frame, [nineF, nineF + 8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const nineS = interpolate(frame, [nineF, nineF + 8], [1.6, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.08}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{textAlign: 'center', opacity: 1 - nineO * 0.9}}>
          <SerifText size={64} color={INK} style={{maxWidth: 1300, lineHeight: 1.4}}>
            How long does it take to destroy a
          </SerifText>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 130, color: RED, margin: '20px 0'}}>
            $32,000,000,000
          </div>
          <SerifText size={64} color={INK}>
            company?
          </SerifText>
        </div>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', opacity: nineO}}>
          <div style={{textAlign: 'center', transform: `scale(${nineS})`}}>
            <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 360, color: RED, lineHeight: 1, textShadow: '0 0 90px rgba(193,18,31,0.5)'}}>
              9
            </div>
            <Label size={54} color={INK} spacing="0.5em" style={{marginTop: 10}}>
              days
            </Label>
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** SBF: beanbag silhouette + halo of trust. */
export const GoodBillionaire: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const words = ['POLITICIANS', 'CELEBRITIES', 'A STADIUM', 'EVERYONE'];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.09} pan={[0, -14]}>
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
        {/* spotlight */}
        <div
          style={{
            position: 'absolute',
            bottom: 100,
            width: 1300,
            height: 900,
            background: 'radial-gradient(ellipse at 50% 100%, rgba(234,234,234,0.08), rgba(11,11,13,0) 60%)',
          }}
        />
        <div style={{marginBottom: 150, filter: 'drop-shadow(0 20px 60px rgba(0,0,0,0.9))'}}>
          <SeatedBeanbagFigure width={720} />
        </div>
        <div style={{position: 'absolute', top: 110, textAlign: 'center', width: '100%'}}>
          <Label size={34} color={INK} spacing="0.45em" style={{opacity: 0.8}}>
            the good billionaire
          </Label>
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 90,
              color: RED,
              marginTop: 26,
              opacity: interpolate(frame, [30, 46], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
            }}
          >
            “Trust me.”
          </div>
        </div>
        {words.map((w, i) => {
          const s = 50 + i * 22;
          const o = interpolate(frame, [s, s + 10], [0, 0.55], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const positions = [
            {left: 200, top: 420},
            {left: 1450, top: 380},
            {left: 240, top: 640},
            {left: 1430, top: 660},
          ];
          return (
            <div
              key={w}
              style={{
                position: 'absolute',
                ...positions[i],
                fontFamily: STAT_FONT,
                fontWeight: 600,
                fontSize: 34,
                letterSpacing: '0.3em',
                color: INK,
                opacity: o,
              }}
            >
              {w}
            </div>
          );
        })}
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Two towers, secret pipe, money flow FTX -> Alameda. */
export const BackDoor: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const flow = frame / 10;
  const coins = [...Array(14)].map((_, i) => {
    const t = ((flow + i / 14) % 1 + 1) % 1;
    const x = 560 + t * 800;
    const y = 780 + Math.sin(t * Math.PI) * -36;
    return (
      <circle key={i} cx={x} cy={y} r={9} fill={RED} opacity={0.35 + 0.65 * Math.sin(t * Math.PI)} />
    );
  });
  const inflow = [...Array(10)].map((_, i) => {
    const t = ((frame / 14 + i / 10) % 1 + 1) % 1;
    const y = 180 + t * 380;
    return <circle key={i} cx={430} cy={y} r={7} fill={INK} opacity={0.5 * Math.sin(t * Math.PI)} />;
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <svg width={1920} height={1080}>
          {/* FTX tower */}
          <rect x={330} y={330} width={340} height={520} fill="#131216" stroke="#26242a" />
          {/* Alameda tower */}
          <rect x={1250} y={390} width={340} height={460} fill="#131216" stroke="#26242a" />
          {/* windows */}
          {[...Array(6)].map((_, r) =>
            [...Array(4)].map((__, c) => (
              <React.Fragment key={`${r}-${c}`}>
                <rect x={370 + c * 72} y={370 + r * 76} width={30} height={40} fill="rgba(234,234,234,0.06)" />
                <rect x={1290 + c * 72} y={430 + r * 64} width={30} height={34} fill="rgba(234,234,234,0.06)" />
              </React.Fragment>
            ))
          )}
          {/* customer inflow */}
          {inflow}
          {/* secret pipe */}
          <path
            d="M 560 780 C 800 700 1150 700 1360 780"
            fill="none"
            stroke={RED}
            strokeWidth={5}
            strokeDasharray="14 10"
            strokeDashoffset={-frame * 3}
            opacity={0.85}
            style={{filter: 'drop-shadow(0 0 10px rgba(193,18,31,0.5))'}}
          />
          {coins}
        </svg>
        <div style={{position: 'absolute', left: 350, top: 250, fontFamily: STAT_FONT, fontWeight: 700, fontSize: 52, letterSpacing: '0.2em', color: INK}}>
          FTX
        </div>
        <div style={{position: 'absolute', left: 1260, top: 310, fontFamily: STAT_FONT, fontWeight: 700, fontSize: 44, letterSpacing: '0.12em', color: INK}}>
          ALAMEDA
        </div>
        <div style={{position: 'absolute', left: 420, top: 140, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 26, letterSpacing: '0.3em', color: INK, opacity: 0.6}}>
          CUSTOMER MONEY
        </div>
        <div
          style={{
            position: 'absolute',
            left: 810,
            top: 830,
            fontFamily: STAT_FONT,
            fontWeight: 600,
            fontSize: 30,
            letterSpacing: '0.3em',
            color: RED,
            opacity: interpolate(frame, [40, 55], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}
        >
          THE BACK DOOR
        </div>
        <div style={{position: 'absolute', left: 700, top: 920, fontFamily: SERIF, fontSize: 26, color: INK, opacity: 0.45, fontStyle: 'italic'}}>
          written directly into the code
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Nine-day collapse timeline, day ticks synced to narration. */
export const NineDaysTimeline: React.FC<{
  durationInFrames: number;
  sceneStart: number;
  dayTimes: Array<{day: number; t: number; label: string}>;
}> = ({durationInFrames, sceneStart, dayTimes}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowSec = sceneStart + frame / fps;
  let currentDay = 0;
  let currentLabel = '';
  for (const d of dayTimes) {
    if (nowSec >= d.t) {
      currentDay = d.day;
      currentLabel = d.label;
    }
  }
  const lastReached = dayTimes.filter((d) => nowSec >= d.t).length;
  const value = currentDay >= 9 ? 0 : 32;
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.05} fade>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{textAlign: 'center'}}>
          <Label size={30} color={INK} spacing="0.5em" style={{opacity: 0.7}}>
            the collapse
          </Label>
          <div
            key={currentDay}
            style={{
              fontFamily: STAT_FONT,
              fontWeight: 700,
              fontSize: 300,
              lineHeight: 1,
              color: RED,
              marginTop: 12,
              textShadow: '0 0 80px rgba(193,18,31,0.45)',
            }}
          >
            {currentDay > 0 ? `DAY ${currentDay}` : '—'}
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 42,
              color: INK,
              marginTop: 34,
              minHeight: 60,
              fontStyle: 'italic',
              opacity: 0.9,
            }}
          >
            {currentLabel}
          </div>
        </div>
        {/* progress ticks */}
        <div style={{position: 'absolute', bottom: 150, display: 'flex', gap: 26}}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <div
              key={d}
              style={{
                width: 90,
                height: 8,
                background: d <= currentDay ? RED : 'rgba(234,234,234,0.15)',
                boxShadow: d <= currentDay ? '0 0 12px rgba(193,18,31,0.6)' : 'none',
              }}
            />
          ))}
        </div>
        {/* empire value */}
        <div style={{position: 'absolute', top: 120, right: 140, textAlign: 'right'}}>
          <Label size={24} color={INK} spacing="0.4em" style={{opacity: 0.6}}>
            empire value
          </Label>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 84, color: RED, fontVariantNumeric: 'tabular-nums'}}>
            {value === 0 && lastReached >= dayTimes.length ? '$0' : `$${value}B`}
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** $16B personal fortune eroding + John Ray quote. */
export const WealthWipe: React.FC<{durationInFrames: number; quoteAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  quoteAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const quoteF = Math.max(0, Math.round((quoteAtSec - sceneStart) * fps));
  const erode = interpolate(frame, [0, Math.min(quoteF - 10, 150)], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.quad),
  });
  const quoteO = interpolate(frame, [quoteF, quoteF + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{opacity: 1 - quoteO, textAlign: 'center', position: 'absolute'}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.75}}>
            personal fortune
          </Label>
          <div style={{width: 900, height: 120, border: '1px solid rgba(234,234,234,0.2)', marginTop: 30, position: 'relative'}}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: `${erode * 100}%`,
                background: `linear-gradient(90deg, rgba(193,18,31,0.9), ${RED})`,
                boxShadow: '0 0 40px rgba(193,18,31,0.4)',
              }}
            />
          </div>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 110, color: RED, marginTop: 36, fontVariantNumeric: 'tabular-nums'}}>
            ${(16 * erode).toFixed(1)}B
          </div>
          <Label size={26} color={INK} spacing="0.35em" style={{marginTop: 16, opacity: 0.7}}>
            erased in under a week
          </Label>
        </div>
        <div style={{opacity: quoteO, position: 'absolute', textAlign: 'center', maxWidth: 1400}}>
          <SerifText size={64} color={INK} style={{lineHeight: 1.5, fontStyle: 'italic'}}>
            “…such a complete failure of corporate controls.”
          </SerifText>
          <DrawRule width={200} from={quoteF + 10} style={{margin: '40px auto 0'}} />
          <Label size={30} color={RED} spacing="0.4em" style={{marginTop: 30}}>
            John Ray · cleaned up Enron
          </Label>
          <Label size={24} color={INK} spacing="0.35em" style={{marginTop: 18, opacity: 0.6}}>
            “Worse than Enron.”
          </Label>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Verdict: gavel drops, 25 YEARS stamp. */
export const Verdict: React.FC<{
  durationInFrames: number;
  years: string;
  counts: string;
  epithet: string;
}> = ({durationInFrames, years, counts, epithet}) => {
  const frame = useCurrentFrame();
  const drop = interpolate(frame, [6, 14], [-300, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const stampF = 40;
  const stampO = interpolate(frame, [stampF, stampF + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const stampS = interpolate(frame, [stampF, stampF + 6], [2.2, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', top: 170, transform: `translateY(${drop}px)`, opacity: 0.9}}>
          <GavelIcon size={260} color="#040405" rotate={-8} />
        </div>
        <div style={{textAlign: 'center', marginTop: 140}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.7}}>
            {counts}
          </Label>
          <div
            style={{
              marginTop: 26,
              display: 'inline-block',
              border: `6px solid ${RED}`,
              color: RED,
              fontFamily: STAT_FONT,
              fontWeight: 700,
              fontSize: 150,
              lineHeight: 1,
              padding: '26px 60px',
              transform: `rotate(-5deg) scale(${stampS})`,
              opacity: stampO,
              textShadow: '0 0 50px rgba(193,18,31,0.4)',
            }}
          >
            {years}
          </div>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 40, color: INK, marginTop: 52, opacity: 0.85}}>
            {epithet}
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
