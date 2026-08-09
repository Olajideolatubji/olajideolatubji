import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {SceneShell, Parallax} from '../components/SceneShell';
import {GownFigure, PlaneSilhouette, WalkingFigure, YachtSilhouette} from '../components/Silhouettes';
import {Label, SerifText} from '../components/Text';
import {INK, RED, SERIF, STAT_FONT} from '../theme';

/** Ruja on stage: gown silhouette, spotlight, THE BITCOIN KILLER. */
export const StageQueen: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.09} pan={[0, -10]}>
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
        {/* spotlight cone */}
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            width: 900,
            height: 1000,
            background: 'radial-gradient(ellipse at 50% 100%, rgba(234,234,234,0.10), rgba(11,11,13,0) 55%)',
          }}
        />
        {/* stage */}
        <div style={{position: 'absolute', bottom: 60, width: 1400, height: 60, background: '#0a090c', borderTop: '1px solid #2c2a31'}} />
        <div style={{marginBottom: 120, filter: 'drop-shadow(0 30px 70px rgba(0,0,0,0.95))'}}>
          <GownFigure height={620} />
        </div>
        {/* red lipstick accent: single red gem dot on silhouette neckline */}
        <div style={{position: 'absolute', bottom: 620, width: 10, height: 10, borderRadius: 5, background: RED, opacity: 0.9}} />
        <div style={{position: 'absolute', top: 130, width: '100%', textAlign: 'center'}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.8}}>
            2014 · dr. ruja ignatova
          </Label>
          <div
            style={{
              fontFamily: STAT_FONT,
              fontWeight: 700,
              fontSize: 110,
              color: RED,
              letterSpacing: '0.05em',
              marginTop: 22,
              opacity: interpolate(frame, [34, 48], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
              textShadow: '0 0 70px rgba(193,18,31,0.45)',
            }}
          >
            THE BITCOIN KILLER
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Wembley bowl + 175-country dot grid lighting up. */
export const Wembley: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const d = durationInFrames;
  const count = Math.min(175, Math.floor(interpolate(frame, [d * 0.35, d * 0.85], [0, 175], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})));
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {/* arena bowl */}
        <svg width={1920} height={520} viewBox="0 0 1920 520" style={{position: 'absolute', top: 90}}>
          <path d="M260 420 C420 140 1500 140 1660 420 Z" fill="#0e0d10" stroke="#26242a" strokeWidth={2} />
          {/* crowd dots */}
          {[...Array(240)].map((_, i) => {
            const row = Math.floor(i / 40);
            const col = i % 40;
            const x = 420 + col * 28 + row * 6;
            const y = 220 + row * 32;
            const tw = 0.2 + 0.5 * Math.abs(Math.sin(frame / 14 + i));
            return <circle key={i} cx={x} cy={y} r={4} fill={INK} opacity={tw * 0.35} />;
          })}
          {/* arch */}
          <path d="M300 400 C700 -60 1220 -60 1620 400" fill="none" stroke="rgba(234,234,234,0.25)" strokeWidth={4} />
        </svg>
        <div style={{position: 'absolute', top: 150, left: 280, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 26, letterSpacing: '0.35em', color: INK, opacity: 0.7}}>
          WEMBLEY ARENA · SOLD OUT
        </div>
        {/* countries grid */}
        <div style={{position: 'absolute', bottom: 180, textAlign: 'center'}}>
          <div style={{display: 'flex', flexWrap: 'wrap', width: 1250, gap: 10, justifyContent: 'center'}}>
            {[...Array(175)].map((_, i) => (
              <div
                key={i}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  background: i < count ? RED : 'rgba(234,234,234,0.1)',
                  boxShadow: i < count ? '0 0 8px rgba(193,18,31,0.6)' : 'none',
                }}
              />
            ))}
          </div>
          <div style={{marginTop: 30, fontFamily: STAT_FONT, fontWeight: 700, fontSize: 56, color: RED, fontVariantNumeric: 'tabular-nums'}}>
            {count} COUNTRIES
          </div>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 30, color: INK, opacity: 0.7, marginTop: 10}}>
            pensioners · farmers · families selling land and cattle
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Real blockchain vs a spreadsheet cell being typed bigger. */
export const BlockchainVsDb: React.FC<{durationInFrames: number; typeAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  typeAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const tF = Math.max(0, Math.round((typeAtSec - sceneStart) * fps));
  const oldVal = '1,000';
  const newVal = '1,000,000';
  const typed = Math.max(0, Math.min(newVal.length, Math.floor((frame - tF) / 2)));
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {/* left: real blockchain */}
        <div style={{position: 'absolute', left: 200, top: 260}}>
          <Label size={26} color={INK} spacing="0.3em" style={{opacity: 0.8}}>
            bitcoin — real technology
          </Label>
          <svg width={640} height={360} style={{marginTop: 30}}>
            {[...Array(5)].map((_, i) => {
              const on = frame > 14 + i * 9;
              return (
                <g key={i} opacity={on ? 1 : 0.2}>
                  <rect x={20 + i * 120} y={140} width={86} height={86} fill="#141318" stroke={on ? 'rgba(234,234,234,0.5)' : '#2c2a31'} strokeWidth={2} />
                  {i < 4 ? <line x1={106 + i * 120} y1={183} x2={140 + i * 120} y2={183} stroke="rgba(234,234,234,0.4)" strokeWidth={3} /> : null}
                  <circle cx={63 + i * 120} cy={183} r={9} fill={on ? INK : '#2c2a31'} opacity={0.6} />
                </g>
              );
            })}
            <text x={320} y={300} textAnchor="middle" fill={INK} opacity={0.5} fontSize={22} fontFamily="EB Garamond" fontStyle="italic">
              thousands of computers · nobody can secretly edit it
            </text>
          </svg>
        </div>
        {/* divider */}
        <div style={{position: 'absolute', left: 955, top: 240, width: 2, height: 560, background: 'rgba(234,234,234,0.15)'}} />
        {/* right: OneCoin's "blockchain" */}
        <div style={{position: 'absolute', right: 170, top: 260}}>
          <Label size={26} color={RED} spacing="0.3em">
            onecoin — a spreadsheet
          </Label>
          <div style={{marginTop: 30, border: '1px solid rgba(234,234,234,0.25)', width: 640, background: 'rgba(16,15,19,0.9)'}}>
            {/* header row */}
            <div style={{display: 'flex', borderBottom: '1px solid rgba(234,234,234,0.2)'}}>
              {['USER', 'COINS “MINED”'].map((h) => (
                <div key={h} style={{flex: 1, padding: '14px 20px', fontFamily: STAT_FONT, fontSize: 20, letterSpacing: '0.2em', color: INK, opacity: 0.6}}>
                  {h}
                </div>
              ))}
            </div>
            {[['#28841', oldVal], ['#28842', oldVal], ['#28843', '']].map(([u, v], r) => (
              <div key={r} style={{display: 'flex', borderBottom: '1px solid rgba(234,234,234,0.08)'}}>
                <div style={{flex: 1, padding: '16px 20px', fontFamily: STAT_FONT, fontSize: 26, color: INK, opacity: 0.75}}>{u}</div>
                <div
                  style={{
                    flex: 1,
                    padding: '16px 20px',
                    fontFamily: STAT_FONT,
                    fontSize: 26,
                    color: r === 2 ? RED : INK,
                    fontWeight: r === 2 ? 700 : 400,
                    background: r === 2 && frame >= tF ? 'rgba(193,18,31,0.12)' : 'transparent',
                  }}
                >
                  {r === 2 ? (
                    <>
                      {newVal.slice(0, typed)}
                      <span style={{opacity: frame % 14 < 7 ? 1 : 0}}>▌</span>
                    </>
                  ) : (
                    v
                  )}
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop: 26, fontFamily: SERIF, fontStyle: 'italic', fontSize: 30, color: INK, opacity: 0.7}}>
            no blockchain. at all.
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Pyramid of package-buyers; commissions flow up. */
export const PyramidScene: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const rows = [1, 2, 4, 7, 11];
  let shown = 0;
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 26, marginTop: 40}}>
          {[...rows].reverse().map((n, revI) => {
            const rowI = rows.length - 1 - revI;
            const row = (
              <div key={rowI} style={{display: 'flex', gap: 30}}>
                {[...Array(n)].map((_, j) => {
                  const idx = shown + j;
                  const s = 12 + idx * 3;
                  const o = interpolate(frame, [s, s + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
                  return (
                    <div key={j} style={{opacity: o}}>
                      <svg width={44} height={64} viewBox="0 0 22 32">
                        <circle cx={11} cy={6} r={5} fill={rowI === 0 ? RED : '#040405'} />
                        <path d="M3 32 C3 18 19 18 19 32 Z" fill={rowI === 0 ? RED : '#040405'} />
                      </svg>
                    </div>
                  );
                })}
              </div>
            );
            shown += n;
            return row;
          })}
        </div>
        {/* commissions flowing up */}
        {[...Array(6)].map((_, i) => {
          const t = ((frame / 30 + i / 6) % 1 + 1) % 1;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 930 + Math.sin(i * 2.7) * 260,
                top: 760 - t * 380,
                fontFamily: STAT_FONT,
                fontWeight: 700,
                fontSize: 26,
                color: RED,
                opacity: Math.sin(t * Math.PI) * 0.8,
              }}
            >
              €
            </div>
          );
        })}
        <div style={{position: 'absolute', top: 130, width: '100%', textAlign: 'center'}}>
          <Label size={28} color={INK} spacing="0.35em" style={{opacity: 0.8}}>
            you never sell the coin — you sell “education”
          </Label>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 110,
            width: '100%',
            textAlign: 'center',
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 42,
            color: RED,
            opacity: interpolate(frame, [durationInFrames * 0.68, durationInFrames * 0.68 + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          a pyramid wearing a tech company's clothes
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** The airport: departure board, plane leaves, silhouette dissolves. */
export const AirportVanish: React.FC<{durationInFrames: number; vanishAtSec?: number; sceneStart?: number}> = ({
  durationInFrames,
  vanishAtSec = 0,
  sceneStart = 0,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const vF = Math.max(30, Math.round((vanishAtSec - sceneStart) * fps));
  const dissolve = interpolate(frame, [vF, vF + 40], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const planeX = interpolate(frame, [0, durationInFrames], [500, 1500]);
  const flicker = frame % 30 < 3 && frame < vF;
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {/* departure board */}
        <div style={{position: 'absolute', top: 130, width: 1160, background: '#0a090c', border: '1px solid #26242a', padding: 34}}>
          <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: STAT_FONT, fontSize: 22, letterSpacing: '0.3em', color: INK, opacity: 0.55}}>
            <span>FLIGHT</span>
            <span>DESTINATION</span>
            <span>STATUS</span>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: STAT_FONT, fontWeight: 600, fontSize: 40, letterSpacing: '0.15em', color: INK, marginTop: 20, opacity: flicker ? 0.4 : 1}}>
            <span>W6 4425</span>
            <span>SOFIA → ATHENS</span>
            <span style={{color: RED}}>{frame < vF ? 'DEPARTED' : 'LANDED'}</span>
          </div>
          <div style={{display: 'flex', justifyContent: 'space-between', fontFamily: STAT_FONT, fontSize: 30, letterSpacing: '0.15em', color: INK, marginTop: 16, opacity: 0.35}}>
            <span>OCT 25 2017</span>
            <span>1H 25M</span>
            <span>—</span>
          </div>
        </div>
        {/* plane crossing */}
        <div style={{position: 'absolute', top: 520, left: planeX, opacity: 0.9}}>
          <PlaneSilhouette size={220} color="#040405" />
        </div>
        {/* the passenger who never arrives: dissolving into particles */}
        <div style={{position: 'absolute', bottom: 120, left: 380}}>
          <div style={{opacity: 1 - dissolve, filter: `blur(${dissolve * 6}px)`}}>
            <WalkingFigure height={360} />
          </div>
          {dissolve > 0.05
            ? [...Array(26)].map((_, i) => {
                const a = (i / 26) * Math.PI * 2;
                const r = dissolve * (60 + (i % 5) * 40);
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      left: 80 + Math.cos(a) * r * 1.4,
                      top: 160 + Math.sin(a) * r - dissolve * 80,
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      background: '#26242a',
                      opacity: Math.max(0, 1 - dissolve) * 0.9 + 0.1,
                    }}
                  />
                );
              })
            : null}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 190,
            right: 300,
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 46,
            color: INK,
            opacity: dissolve,
            maxWidth: 640,
            textAlign: 'right',
          }}
        >
          and Dr. Ruja Ignatova
          <br />
          <span style={{color: RED}}>stopped existing.</span>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Manhunt: radar sweep over region names + FBI file. */
export const Manhunt: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const sweep = (frame * 1.6) % 360;
  const regions = ['EUROPE', 'THE GULF', 'THE MEDITERRANEAN'];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06} pan={[-12, 0]}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <svg width={880} height={880} viewBox="0 0 300 300" style={{position: 'absolute', left: 140, top: 100, opacity: 0.9}}>
          {[140, 100, 60].map((r) => (
            <circle key={r} cx={150} cy={150} r={r} fill="none" stroke="rgba(234,234,234,0.14)" strokeWidth={1.5} />
          ))}
          <line x1={10} y1={150} x2={290} y2={150} stroke="rgba(234,234,234,0.08)" />
          <line x1={150} y1={10} x2={150} y2={290} stroke="rgba(234,234,234,0.08)" />
          <path
            d={`M150 150 L ${150 + 140 * Math.cos((sweep * Math.PI) / 180)} ${150 + 140 * Math.sin((sweep * Math.PI) / 180)}`}
            stroke={RED}
            strokeWidth={2.5}
          />
          <path
            d={`M150 150 L ${150 + 140 * Math.cos(((sweep - 24) * Math.PI) / 180)} ${150 + 140 * Math.sin(((sweep - 24) * Math.PI) / 180)} A 140 140 0 0 1 ${150 + 140 * Math.cos((sweep * Math.PI) / 180)} ${150 + 140 * Math.sin((sweep * Math.PI) / 180)} Z`}
            fill="rgba(193,18,31,0.10)"
          />
        </svg>
        {regions.map((r, i) => (
          <div
            key={r}
            style={{
              position: 'absolute',
              left: 300 + (i % 2) * 220,
              top: 320 + i * 170,
              fontFamily: STAT_FONT,
              fontWeight: 500,
              fontSize: 26,
              letterSpacing: '0.3em',
              color: INK,
              opacity: 0.25 + 0.5 * Math.abs(Math.sin(frame / 26 + i * 2)),
            }}
          >
            {r}
          </div>
        ))}
        {/* yacht hint, tasteful */}
        <div style={{position: 'absolute', right: 200, bottom: 150, opacity: 0.55}}>
          <YachtSilhouette width={360} />
          <div style={{width: 360, height: 2, background: 'rgba(234,234,234,0.2)', marginTop: 4}} />
        </div>
        {/* FBI file card */}
        <div style={{position: 'absolute', right: 190, top: 170, width: 520, background: 'rgba(16,15,19,0.92)', border: '1px solid #26242a', padding: 40}}>
          <Label size={24} color={INK} spacing="0.3em" style={{opacity: 0.7}}>
            fbi · ten most wanted
          </Label>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 60, color: RED, marginTop: 16}}>
            $5,000,000
          </div>
          <div style={{fontFamily: STAT_FONT, fontSize: 24, letterSpacing: '0.2em', color: INK, marginTop: 10, opacity: 0.8}}>
            REWARD — STILL UNCLAIMED
          </div>
          <div style={{marginTop: 24, fontFamily: SERIF, fontStyle: 'italic', fontSize: 34, color: RED}}>
            whereabouts unknown
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Claimed sightings each get a pin, then NOT CONFIRMED. */
export const Sightings: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const sightings = [
    {name: 'A RESTAURANT · ATHENS', x: 420, y: 420},
    {name: 'A LUXURY FLAT · DUBAI', x: 950, y: 560},
    {name: 'A YACHT · MEDITERRANEAN', x: 1430, y: 400},
  ];
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill>
        {sightings.map((s, i) => {
          const start = 14 + i * 34;
          const o = interpolate(frame, [start, start + 8], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const xO = interpolate(frame, [start + 20, start + 26], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          return (
            <div key={i} style={{position: 'absolute', left: s.x, top: s.y, opacity: o, textAlign: 'center'}}>
              <svg width={56} height={76} viewBox="0 0 28 38">
                <path d="M14 0 C22 0 28 6 28 14 C28 24 14 38 14 38 C14 38 0 24 0 14 C0 6 6 0 14 0 Z" fill={RED} opacity={1 - xO * 0.6} />
              </svg>
              <div style={{fontFamily: STAT_FONT, fontSize: 22, letterSpacing: '0.2em', color: INK, marginTop: 12, opacity: 0.8}}>
                {s.name}
              </div>
              <div
                style={{
                  marginTop: 12,
                  display: 'inline-block',
                  border: `3px solid ${RED}`,
                  color: RED,
                  fontFamily: STAT_FONT,
                  fontWeight: 700,
                  fontSize: 24,
                  letterSpacing: '0.15em',
                  padding: '6px 16px',
                  transform: `rotate(-6deg) scale(${0.8 + xO * 0.2})`,
                  opacity: xO,
                }}
              >
                NOT CONFIRMED
              </div>
            </div>
          );
        })}
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Ending of the entry: a grave nobody found, or a woman who beat the world. */
export const GraveOrGhost: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const d = durationInFrames;
  const split = interpolate(frame, [d * 0.3, d * 0.6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.05}>
      <AbsoluteFill style={{flexDirection: 'row'}}>
        {/* left: the sea / a grave */}
        <div style={{flex: 1, position: 'relative', overflow: 'hidden', opacity: 0.4 + split * 0.6}}>
          <div style={{position: 'absolute', bottom: 300, left: 0, right: 0, height: 2, background: 'rgba(234,234,234,0.25)'}} />
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                bottom: 240 - i * 40,
                left: 0,
                right: 0,
                height: 1,
                background: `rgba(234,234,234,${0.12 - i * 0.025})`,
                transform: `translateX(${Math.sin(frame / 30 + i) * 20}px)`,
              }}
            />
          ))}
          <div style={{position: 'absolute', bottom: 320, left: '50%', transform: 'translateX(-50%)', opacity: 0.6}}>
            <YachtSilhouette width={300} />
          </div>
          <div style={{position: 'absolute', bottom: 130, width: '100%', textAlign: 'center', fontFamily: 'EB Garamond, serif', fontStyle: 'italic', fontSize: 34, color: INK, opacity: 0.7}}>
            a grave nobody's found…
          </div>
        </div>
        <div style={{width: 2, background: 'rgba(234,234,234,0.15)'}} />
        {/* right: walking away with the money */}
        <div style={{flex: 1, position: 'relative', opacity: 0.4 + split * 0.6}}>
          <div
            style={{
              position: 'absolute',
              bottom: 230,
              left: `${34 + split * 18}%`,
              filter: 'drop-shadow(0 20px 50px rgba(0,0,0,0.9))',
              opacity: 1 - split * 0.35,
            }}
          >
            <WalkingFigure height={400} />
          </div>
          <div style={{position: 'absolute', bottom: 130, width: '100%', textAlign: 'center', fontFamily: 'EB Garamond, serif', fontStyle: 'italic', fontSize: 34, color: INK, opacity: 0.7}}>
            …or a woman with $4B who beat the entire world
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
