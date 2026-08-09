import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {BG, INK, RED, SERIF, STAT_FONT} from '../theme';
import type {SlamSpec} from '../timelineTypes';
import {BigNumber, Label} from './Text';

const SLAM_ANIM = 12; // frames of counter roll-up on a slam

/**
 * Persistent bottom-right running total. Appears after the first ledger
 * opens; slams upward at each chapter close with a re-tease line under it.
 */
export const CounterOverlay: React.FC<{
  slams: SlamSpec[];
  visibleFrom: number;
}> = ({slams, visibleFrom}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (frame < visibleFrom) return null;

  // Find state relative to slams.
  let display = '$0';
  let retease = '';
  let slamProgress: number | null = null;
  for (let i = 0; i < slams.length; i++) {
    const at = Math.round(slams[i].at * fps);
    if (frame >= at) {
      const dt = frame - at;
      if (dt < SLAM_ANIM) {
        slamProgress = dt / SLAM_ANIM;
        const from = parseMoney(slams[i].prevTotal);
        const to = parseMoney(slams[i].total);
        const v = from + (to - from) * Easing.out(Easing.cubic)(slamProgress);
        display = formatMoney(v, slams[i].total);
      } else {
        display = slams[i].total;
      }
      retease = slams[i].retease;
    }
  }
  const opacity = interpolate(frame, [visibleFrom, visibleFrom + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const pop = slamProgress === null ? 1 : 1 + 0.25 * (1 - slamProgress);
  return (
    <div
      style={{
        position: 'absolute',
        right: 56,
        bottom: 44,
        textAlign: 'right',
        opacity,
        zIndex: 40,
      }}
    >
      <div
        style={{
          fontFamily: STAT_FONT,
          fontWeight: 700,
          fontSize: 64,
          color: RED,
          lineHeight: 1,
          transform: `scale(${pop})`,
          transformOrigin: 'right bottom',
          textShadow: '0 0 30px rgba(193,18,31,0.45)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display}
      </div>
      {retease ? (
        <div
          style={{
            fontFamily: STAT_FONT,
            fontWeight: 500,
            fontSize: 20,
            letterSpacing: '0.3em',
            color: RED,
            opacity: 0.85,
            marginTop: 8,
            textTransform: 'uppercase',
          }}
        >
          {retease}
        </div>
      ) : null}
      <div
        style={{
          fontFamily: STAT_FONT,
          fontWeight: 400,
          fontSize: 16,
          letterSpacing: '0.35em',
          color: INK,
          opacity: 0.5,
          marginTop: 6,
          textTransform: 'uppercase',
        }}
      >
        The ledger
      </div>
    </div>
  );
};

const parseMoney = (s: string): number => {
  const m = s.replace(/[^0-9.]/g, '');
  return m ? parseFloat(m) : 0;
};
const formatMoney = (v: number, template: string): string => {
  const dec = template.includes('.') ? 0 : 0;
  return `$${v.toFixed(dec)}B`;
};

/** Whole-frame shake for 4 frames after each slam / ledger open. */
export const useShake = (
  eventsSec: number[],
  fps: number,
  frames = 4,
  amp = 14
): string => {
  const frame = useCurrentFrame();
  for (const at of eventsSec) {
    const f0 = Math.round(at * fps);
    const dt = frame - f0;
    if (dt >= 0 && dt < frames) {
      const decay = 1 - dt / frames;
      const dx = Math.sin(dt * 12.9898) * amp * decay;
      const dy = Math.cos(dt * 78.233) * amp * decay;
      return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    }
  }
  return 'none';
};

/**
 * THE LEDGER: dark book slams open onto an entry page. Same ritual every
 * chapter. Sequence lasts ~2.6s: closed cover (0.5s) -> slam open (0.4s) ->
 * page settles with title + red amount.
 */
export const LedgerOpen: React.FC<{
  entry: number;
  title: string;
  amount: string;
  sub: string;
  durationInFrames: number;
}> = ({entry, title, amount, sub, durationInFrames}) => {
  const frame = useCurrentFrame();
  const openStart = 12;
  const openDur = 12;
  const openT = interpolate(frame, [openStart, openStart + openDur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const settle = interpolate(
    frame,
    [openStart + openDur, openStart + openDur + 6],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  const bookW = 980;
  const bookH = 640;
  const coverAngle = -180 * openT;
  const contentOpacity = interpolate(
    frame,
    [openStart + openDur - 2, openStart + openDur + 8],
    [0, 1],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  const fadeOut = interpolate(
    frame,
    [durationInFrames - 8, durationInFrames],
    [1, 0],
    {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}
  );
  return (
    <AbsoluteFill
      style={{
        backgroundColor: BG,
        justifyContent: 'center',
        alignItems: 'center',
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          width: bookW,
          height: bookH,
          position: 'relative',
          perspective: 2200,
          transform: `translateY(${settle * 10}px) scale(${1 + 0.04 * (frame / durationInFrames)})`,
        }}
      >
        {/* Right page (revealed) */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, #17161a 0%, #121114 60%, #0e0d10 100%)',
            border: '1px solid #26242a',
            borderLeft: '3px solid #2c2a31',
            boxShadow: '0 40px 120px rgba(0,0,0,0.8)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            opacity: contentOpacity,
          }}
        >
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 26,
              letterSpacing: '0.5em',
              color: INK,
              opacity: 0.55,
              textTransform: 'uppercase',
            }}
          >
            Entry {String(entry).padStart(2, '0')}
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 130,
              fontWeight: 600,
              color: INK,
              marginTop: 18,
              letterSpacing: '0.04em',
            }}
          >
            {title}
          </div>
          <div
            style={{
              width: 420,
              height: 2,
              background: RED,
              margin: '28px 0',
              transform: `scaleX(${contentOpacity})`,
            }}
          />
          <div
            style={{
              fontFamily: STAT_FONT,
              fontWeight: 700,
              fontSize: 72,
              color: RED,
            }}
          >
            {amount}
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 30,
              color: INK,
              opacity: 0.6,
              marginTop: 16,
            }}
          >
            {sub}
          </div>
          {/* Ruled ledger lines */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 70,
                right: 70,
                bottom: 40 + i * 26,
                height: 1,
                background: 'rgba(234,234,234,0.07)',
              }}
            />
          ))}
        </div>
        {/* Cover that slams open */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: 'left center',
            transform: `rotateY(${coverAngle}deg)`,
            backfaceVisibility: 'hidden',
            background: 'linear-gradient(160deg, #1a1013 0%, #120b0d 55%, #0d0709 100%)',
            border: '1px solid #2c1418',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            boxShadow: '0 30px 90px rgba(0,0,0,0.9)',
          }}
        >
          <div
            style={{
              border: `2px solid ${RED}`,
              padding: '34px 60px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: SERIF,
                fontSize: 54,
                color: RED,
                letterSpacing: '0.28em',
                textTransform: 'uppercase',
              }}
            >
              The Red Ledger
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * STAT card: full-bleed black, giant red number counting up fast, small
 * white caption. Hard cut in and out (no fades).
 */
export const StatCard: React.FC<{
  number: string;
  caption: string;
}> = ({number, caption}) => {
  const frame = useCurrentFrame();
  const target = parseFloat(number.replace(/[^0-9.]/g, '')) || 0;
  const t = interpolate(frame, [0, 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const v = target * t;
  const shown = renderLike(number, v, t >= 1);
  const scale = 1 + 0.03 * (frame / 90);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <div style={{transform: `scale(${scale})`, textAlign: 'center'}}>
        <BigNumber size={230} style={{textShadow: '0 0 60px rgba(193,18,31,0.4)'}}>
          {shown}
        </BigNumber>
        <Label size={30} color={INK} style={{marginTop: 36, opacity: 0.9}}>
          {caption}
        </Label>
      </div>
    </AbsoluteFill>
  );
};

/** Rebuild a formatted number string ("$8,000,000,000" / "€1.9B" / "20,000") at value v. */
const renderLike = (template: string, v: number, done: boolean): string => {
  if (done) return template;
  const prefix = template.match(/^[^0-9]*/)?.[0] ?? '';
  const suffix = template.match(/[^0-9,.]*$/)?.[0] ?? '';
  const numPart = template.slice(prefix.length, template.length - suffix.length);
  const decimals = numPart.includes('.') ? numPart.split('.')[1].length : 0;
  const useCommas = numPart.includes(',');
  let s = v.toFixed(decimals);
  if (useCommas) {
    const [int, dec] = s.split('.');
    s = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (dec ? '.' + dec : '');
  }
  return prefix + s + suffix;
};
