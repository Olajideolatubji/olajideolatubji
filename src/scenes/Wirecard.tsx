import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {SceneShell} from '../components/SceneShell';
import {WalkingFigure} from '../components/Silhouettes';
import {Label, SerifText} from '../components/Text';
import {INK, RED, SERIF, STAT_FONT} from '../theme';

/** Magnifying glass flips from company onto the journalists. */
export const JournalistsFlip: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const flip = interpolate(frame, [durationInFrames * 0.45, durationInFrames * 0.6], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.inOut(Easing.cubic),
  });
  const glassX = 500 + flip * 800;
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {/* left: the company */}
        <div style={{position: 'absolute', left: 330, top: 400, textAlign: 'center'}}>
          <div style={{width: 260, height: 260, background: '#141318', border: '1px solid #2c2a31', display: 'flex', justifyContent: 'center', alignItems: 'center'}}>
            <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 44, letterSpacing: '0.1em', color: INK}}>WIRECARD</div>
          </div>
          <Label size={24} color={INK} spacing="0.3em" style={{marginTop: 20, opacity: 0.6}}>
            the company
          </Label>
        </div>
        {/* right: the journalists */}
        <div style={{position: 'absolute', right: 330, top: 380, textAlign: 'center'}}>
          <svg width={260} height={280} viewBox="0 0 130 140">
            {/* pen nib silhouette */}
            <path d="M65 8 L88 78 L65 132 L42 78 Z" fill="#040405" />
            <circle cx={65} cy={78} r={7} fill={RED} />
          </svg>
          <Label size={24} color={INK} spacing="0.3em" style={{marginTop: 4, opacity: 0.6}}>
            the journalists
          </Label>
        </div>
        {/* magnifier */}
        <svg width={1920} height={1080} style={{position: 'absolute'}}>
          <g style={{transform: `translate(${glassX}px, 420px)`}}>
            <circle cx={0} cy={0} r={130} fill="rgba(193,18,31,0.06)" stroke={RED} strokeWidth={6} />
            <line x1={92} y1={92} x2={190} y2={190} stroke={RED} strokeWidth={14} strokeLinecap="round" />
          </g>
        </svg>
        <div
          style={{
            position: 'absolute',
            bottom: 130,
            width: '100%',
            textAlign: 'center',
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 44,
            color: flip >= 1 ? RED : INK,
            opacity: 0.9,
          }}
        >
          {flip >= 1 ? 'Germany investigated the journalists.' : 'Journalists exposed the fraud…'}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** DAX miracle: ticker climbs into the index, PH banks far away. */
export const DaxMiracle: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const rise = interpolate(frame, [10, 60], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pinsO = interpolate(frame, [durationInFrames * 0.55, durationInFrames * 0.55 + 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', left: 220, top: 190}}>
          <Label size={30} color={INK} spacing="0.4em">
            DAX · germany's elite index
          </Label>
          <div style={{display: 'flex', gap: 18, marginTop: 40, alignItems: 'flex-end'}}>
            {[...Array(8)].map((_, i) => (
              <div key={i} style={{width: 64, height: 120 + ((i * 47) % 90), background: 'rgba(234,234,234,0.12)'}} />
            ))}
            {/* WDI rising in red */}
            <div
              style={{
                width: 64,
                height: 40 + rise * 220,
                background: RED,
                boxShadow: '0 0 30px rgba(193,18,31,0.5)',
                position: 'relative',
              }}
            >
              <div style={{position: 'absolute', top: -46, width: '100%', textAlign: 'center', fontFamily: STAT_FONT, fontWeight: 700, fontSize: 28, color: RED}}>
                WDI
              </div>
            </div>
          </div>
          <div style={{marginTop: 34, fontFamily: STAT_FONT, fontWeight: 700, fontSize: 66, color: RED}}>
            €24,000,000,000
          </div>
        </div>
        {/* Philippines detail */}
        <div style={{position: 'absolute', right: 200, top: 260, width: 520, opacity: pinsO}}>
          <div style={{border: '1px solid rgba(234,234,234,0.18)', padding: 40, background: 'rgba(20,19,24,0.6)'}}>
            <Label size={26} color={INK} spacing="0.3em" style={{opacity: 0.8}}>
              “a quarter of everything”
            </Label>
            <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 76, color: RED, marginTop: 18}}>
              €1.9B
            </div>
            <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 32, color: INK, marginTop: 16, opacity: 0.75}}>
              supposedly in two banks
              <br />
              in the Philippines
            </div>
            <div style={{display: 'flex', gap: 30, marginTop: 28}}>
              {[0, 1].map((i) => (
                <svg key={i} width={44} height={60} viewBox="0 0 22 30">
                  <path d="M11 0 C17 0 22 5 22 11 C22 19 11 30 11 30 C11 30 0 19 0 11 C0 5 5 0 11 0 Z" fill={RED} />
                  <circle cx={11} cy={11} r={4.5} fill="#0B0B0D" />
                </svg>
              ))}
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** FT headline stack vs regulator shield; complaints against reporters. */
export const FtStack: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const heads = [
    'THE NUMBERS DON’T ADD UP',
    'QUESTIONS OVER ASIAN ACCOUNTS',
    'WHERE IS THE CASH?',
    'SUSPICIOUS ROUND-TRIPPING',
    'AUDIT RED FLAGS IGNORED',
  ];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06} pan={[-14, 0]}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', left: 220, top: 170}}>
          <Label size={28} color={INK} spacing="0.35em" style={{opacity: 0.8}}>
            five years of reporting
          </Label>
          <div style={{marginTop: 30}}>
            {heads.map((h, i) => {
              const s = 8 + i * 14;
              const o = interpolate(frame, [s, s + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              const x = interpolate(frame, [s, s + 8], [-40, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return (
                <div
                  key={i}
                  style={{
                    fontFamily: SERIF,
                    fontSize: 40,
                    color: INK,
                    padding: '16px 26px',
                    borderLeft: `4px solid ${RED}`,
                    background: 'rgba(20,19,24,0.65)',
                    marginTop: 16,
                    opacity: o,
                    transform: `translateX(${x}px) rotate(${(i % 2 === 0 ? -0.5 : 0.6)}deg)`,
                    width: 760,
                  }}
                >
                  {h}
                </div>
              );
            })}
          </div>
        </div>
        {/* shield */}
        <div style={{position: 'absolute', right: 260, top: 300, textAlign: 'center'}}>
          <svg width={300} height={360} viewBox="0 0 100 120">
            <path d="M50 4 L96 22 C96 66 82 100 50 116 C18 100 4 66 4 22 Z" fill="#141318" stroke="rgba(234,234,234,0.3)" strokeWidth={2} />
            <text x={50} y={70} textAnchor="middle" fill={INK} fontSize={26} fontFamily="Oswald" opacity={0.85}>
              STATE
            </text>
          </svg>
          <div
            style={{
              marginTop: 24,
              fontFamily: STAT_FONT,
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: '0.2em',
              color: RED,
              opacity: interpolate(frame, [durationInFrames * 0.55, durationInFrames * 0.55 + 12], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            COMPLAINTS FILED —
            <br />
            AGAINST THE REPORTERS
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Short ban + counter-surveillance on reporters. */
export const StateEnforced: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const sweep = (frame * 2.2) % 360;
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.08}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div
          style={{
            position: 'absolute',
            left: 240,
            top: 220,
            border: `6px solid ${RED}`,
            color: RED,
            fontFamily: STAT_FONT,
            fontWeight: 700,
            fontSize: 64,
            padding: '20px 44px',
            transform: 'rotate(-4deg)',
            letterSpacing: '0.08em',
            opacity: interpolate(frame, [10, 18], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}
        >
          SHORT SELLING: BANNED
        </div>
        <div style={{position: 'absolute', left: 250, top: 400, fontFamily: SERIF, fontStyle: 'italic', fontSize: 36, color: INK, opacity: 0.7, maxWidth: 700}}>
          the first single-stock short ban in German history — it was illegal to bet against the fraud
        </div>
        {/* radar + followed reporter */}
        <div style={{position: 'absolute', right: 240, top: 240}}>
          <svg width={480} height={480} viewBox="0 0 200 200">
            <circle cx={100} cy={100} r={96} fill="none" stroke="rgba(234,234,234,0.15)" strokeWidth={1.5} />
            <circle cx={100} cy={100} r={64} fill="none" stroke="rgba(234,234,234,0.12)" strokeWidth={1.5} />
            <circle cx={100} cy={100} r={32} fill="none" stroke="rgba(234,234,234,0.1)" strokeWidth={1.5} />
            <path
              d={`M100 100 L ${100 + 96 * Math.cos((sweep * Math.PI) / 180)} ${100 + 96 * Math.sin((sweep * Math.PI) / 180)}`}
              stroke={RED}
              strokeWidth={3}
            />
            <circle cx={148} cy={70} r={6} fill={RED} opacity={0.5 + 0.5 * Math.sin(frame / 5)} />
          </svg>
        </div>
        <div style={{position: 'absolute', right: 300, bottom: 190, display: 'flex', alignItems: 'flex-end', gap: 60}}>
          <WalkingFigure height={260} />
          <div style={{opacity: 0.55, transform: 'scale(0.85)'}}>
            <WalkingFigure height={260} color="#1a181d" />
          </div>
        </div>
        <div style={{position: 'absolute', right: 260, bottom: 120, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 24, letterSpacing: '0.3em', color: INK, opacity: 0.6}}>
          REPORTERS FOLLOWED
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** The phone call to Manila; the reply types out at the exact moment. */
export const PhoneCall: React.FC<{durationInFrames: number; replyAtSec: number; sceneStart: number}> = ({
  durationInFrames,
  replyAtSec,
  sceneStart,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const replyF = Math.max(0, Math.round((replyAtSec - sceneStart) * fps));
  const reply = 'WE HAVE NEVER HEARD OF THIS MONEY.';
  const typed = Math.max(0, Math.min(reply.length, Math.floor((frame - replyF) / 1.4)));
  const ringing = frame < replyF;
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.05}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', top: 170, width: '100%', textAlign: 'center'}}>
          <Label size={28} color={INK} spacing="0.4em" style={{opacity: 0.75}}>
            june 2020 · the auditors finally call
          </Label>
        </div>
        <svg width={1920} height={1080} style={{position: 'absolute'}}>
          {/* call line */}
          <path
            d="M 420 560 C 760 380 1160 380 1500 560"
            fill="none"
            stroke={ringing ? 'rgba(234,234,234,0.35)' : RED}
            strokeWidth={4}
            strokeDasharray="16 14"
            strokeDashoffset={-frame * 2.4}
          />
          {/* handsets */}
          <g transform="translate(360, 560)">
            <rect x={-34} y={-60} width={68} height={120} rx={14} fill="#0a090c" stroke="#2c2a31" />
          </g>
          <g transform="translate(1560, 560)">
            <rect x={-34} y={-60} width={68} height={120} rx={14} fill="#0a090c" stroke="#2c2a31" />
          </g>
        </svg>
        <div style={{position: 'absolute', left: 260, top: 660, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 26, letterSpacing: '0.25em', color: INK, opacity: 0.7}}>
          EY · AUDITORS
        </div>
        <div style={{position: 'absolute', right: 220, top: 660, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 26, letterSpacing: '0.25em', color: INK, opacity: 0.7}}>
          MANILA · THE BANKS
        </div>
        <div style={{position: 'absolute', top: 420, width: '100%', textAlign: 'center'}}>
          {ringing ? (
            <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 44, color: INK, opacity: 0.6 + 0.3 * Math.sin(frame / 4)}}>
              is the money there?
            </div>
          ) : (
            <div
              style={{
                fontFamily: STAT_FONT,
                fontWeight: 700,
                fontSize: 64,
                letterSpacing: '0.06em',
                color: RED,
                textShadow: '0 0 40px rgba(193,18,31,0.4)',
              }}
            >
              {reply.slice(0, typed)}
              <span style={{opacity: frame % 16 < 8 ? 1 : 0}}>▌</span>
            </div>
          )}
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Collapse + Marsalek escape route drawing east to Moscow. */
export const MarsalekEscape: React.FC<{durationInFrames: number; routeAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  routeAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const rF = Math.max(10, Math.round((routeAtSec - sceneStart) * fps));
  const routeT = interpolate(frame, [rF, rF + 70], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const stations = [
    {name: 'MUNICH', x: 340, y: 640},
    {name: 'VIENNA', x: 640, y: 600},
    {name: 'MINSK', x: 1100, y: 470},
    {name: 'MOSCOW', x: 1560, y: 380},
  ];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06} pan={[16, -8]}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', left: 240, top: 150}}>
          <Label size={30} color={INK} spacing="0.35em">
            the COO vanishes
          </Label>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 34, color: INK, marginTop: 20, opacity: 0.7, maxWidth: 600}}>
            Jan Marsalek — Interpol's most wanted, to this day
          </div>
        </div>
        {/* grid */}
        <svg width={1920} height={1080} style={{position: 'absolute'}}>
          {[...Array(12)].map((_, i) => (
            <line key={`v${i}`} x1={i * 170} y1={0} x2={i * 170} y2={1080} stroke="rgba(234,234,234,0.04)" />
          ))}
          {[...Array(7)].map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 170} x2={1920} y2={i * 170} stroke="rgba(234,234,234,0.04)" />
          ))}
          <path
            d={`M ${stations[0].x} ${stations[0].y} L ${stations[1].x} ${stations[1].y} L ${stations[2].x} ${stations[2].y} L ${stations[3].x} ${stations[3].y}`}
            fill="none"
            stroke={RED}
            strokeWidth={5}
            strokeDasharray={1600}
            strokeDashoffset={1600 * (1 - routeT)}
            style={{filter: 'drop-shadow(0 0 10px rgba(193,18,31,0.5))'}}
          />
          {stations.map((s, i) => {
            const reached = routeT >= i / 3 - 0.01;
            return <circle key={s.name} cx={s.x} cy={s.y} r={10} fill={reached ? RED : 'rgba(234,234,234,0.2)'} />;
          })}
        </svg>
        {stations.map((s, i) => (
          <div
            key={s.name}
            style={{
              position: 'absolute',
              left: s.x - 50,
              top: s.y + 26,
              fontFamily: STAT_FONT,
              fontWeight: 600,
              fontSize: 28,
              letterSpacing: '0.25em',
              color: routeT >= i / 3 - 0.01 ? INK : 'rgba(234,234,234,0.3)',
            }}
          >
            {s.name}
          </div>
        ))}
        <div
          style={{
            position: 'absolute',
            right: 220,
            bottom: 160,
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 34,
            color: INK,
            opacity: routeT >= 1 ? 0.85 : 0,
            maxWidth: 560,
            textAlign: 'right',
          }}
        >
          a fraudster who may also
          <br />
          have been a spy
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
