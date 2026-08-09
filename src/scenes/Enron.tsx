import React from 'react';
import {AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {TimedLineChart, TimedPoint} from '../components/Charts';
import {SceneShell} from '../components/SceneShell';
import {CityGrid} from '../components/Silhouettes';
import {Label, SerifText} from '../components/Text';
import {INK, RED, SERIF, STAT_FONT} from '../theme';

/** Trophy wall: "Most Innovative" x6. */
export const InnovativeTrophies: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{textAlign: 'center'}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.8}}>
            fortune magazine · six years running
          </Label>
          <div style={{display: 'flex', gap: 44, marginTop: 60, justifyContent: 'center'}}>
            {[...Array(6)].map((_, i) => {
              const s = 10 + i * 8;
              const o = interpolate(frame, [s, s + 6], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              const y = interpolate(frame, [s, s + 6], [24, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
              return (
                <div key={i} style={{opacity: o, transform: `translateY(${y}px)`, textAlign: 'center'}}>
                  <svg width={110} height={150} viewBox="0 0 55 75">
                    <path d="M12 6 L43 6 L43 22 C43 36 34 44 27.5 46 C21 44 12 36 12 22 Z" fill="#040405" stroke={RED} strokeWidth={1.5} />
                    <rect x={23} y={46} width={9} height={14} fill="#040405" />
                    <rect x={14} y={60} width={27} height={8} fill="#040405" />
                    <text x={27.5} y={30} textAnchor="middle" fill={RED} fontSize={16} fontFamily="Oswald" fontWeight="bold">
                      {String(i + 1)}
                    </text>
                  </svg>
                  <div style={{fontFamily: STAT_FONT, fontSize: 18, letterSpacing: '0.2em', color: INK, opacity: 0.6, marginTop: 10}}>
                    {1996 + i}
                  </div>
                </div>
              );
            })}
          </div>
          <div
            style={{
              marginTop: 70,
              fontFamily: SERIF,
              fontStyle: 'italic',
              fontSize: 48,
              color: INK,
              opacity: interpolate(frame, [70, 84], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
            }}
          >
            “Nobody has ever innovated fraud like Enron.”
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Machine one: deal -> crystal ball -> PROFIT NOW conveyor. */
export const MachineOne: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const bills = [...Array(8)].map((_, i) => {
    const t = ((frame / 26 + i / 8) % 1 + 1) % 1;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: 1210 + t * 380,
          top: 560 - Math.sin(t * Math.PI) * 30,
          width: 84,
          height: 40,
          border: `2px solid ${RED}`,
          color: RED,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          fontFamily: STAT_FONT,
          fontWeight: 700,
          fontSize: 20,
          opacity: Math.sin(t * Math.PI),
          background: 'rgba(11,11,13,0.9)',
        }}
      >
        $$$
      </div>
    );
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', top: 150, width: '100%', textAlign: 'center'}}>
          <Label size={32} color={RED} spacing="0.4em">
            machine one
          </Label>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 60, color: INK, letterSpacing: '0.08em', marginTop: 14}}>
            MARK-TO-MARKET
          </div>
        </div>
        <svg width={1920} height={1080} style={{position: 'absolute'}}>
          {/* deal box */}
          <rect x={280} y={470} width={240} height={180} fill="#141318" stroke="#2c2a31" />
          {/* arrow */}
          <line x1={520} y1={560} x2={700} y2={560} stroke="rgba(234,234,234,0.4)" strokeWidth={4} />
          <path d="M 700 560 l -18 -10 l 0 20 Z" fill="rgba(234,234,234,0.4)" />
          {/* crystal ball */}
          <circle cx={880} cy={560} r={150} fill="rgba(193,18,31,0.05)" stroke={RED} strokeWidth={3} />
          <line x1={1030} y1={560} x2={1190} y2={560} stroke="rgba(234,234,234,0.4)" strokeWidth={4} />
          <path d="M 1190 560 l -18 -10 l 0 20 Z" fill="rgba(234,234,234,0.4)" />
        </svg>
        <div style={{position: 'absolute', left: 292, top: 530, width: 220, textAlign: 'center', fontFamily: STAT_FONT, fontWeight: 600, fontSize: 30, letterSpacing: '0.15em', color: INK}}>
          DEAL
          <div style={{fontSize: 20, opacity: 0.55, marginTop: 8, letterSpacing: '0.1em'}}>SIGNED TODAY</div>
        </div>
        <div style={{position: 'absolute', left: 760, top: 500, width: 240, textAlign: 'center'}}>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 62, color: RED, opacity: 0.5 + 0.3 * Math.sin(frame / 8)}}>
            +20yrs
          </div>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 24, color: INK, opacity: 0.65}}>guessed profit</div>
        </div>
        {bills}
        <div style={{position: 'absolute', left: 1250, top: 640, fontFamily: STAT_FONT, fontWeight: 600, fontSize: 30, letterSpacing: '0.2em', color: RED}}>
          BOOKED NOW
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 130,
            width: '100%',
            textAlign: 'center',
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 44,
            color: INK,
            opacity: interpolate(frame, [durationInFrames * 0.65, durationInFrames * 0.65 + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          It wasn't reporting income. It was reporting daydreams.
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Machine two: the maze swallowing debt; price line climbs to $90. */
export const MachineTwo: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const d = durationInFrames;
  // debt blocks flowing into the maze
  const blocks = [...Array(7)].map((_, i) => {
    const t = ((frame / 40 + i / 7) % 1 + 1) % 1;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: 220 + t * 380,
          top: 620 + (i % 3) * 26 - t * 40,
          width: 70,
          height: 34,
          background: '#1c1a20',
          border: '1px solid rgba(193,18,31,0.5)',
          color: RED,
          fontFamily: STAT_FONT,
          fontWeight: 600,
          fontSize: 18,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: 1 - t * 0.9,
        }}
      >
        DEBT
      </div>
    );
  });
  const priceT = interpolate(frame, [d * 0.35, d * 0.9], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pricePts: string[] = [];
  const n = 50;
  for (let i = 0; i <= n * priceT; i++) {
    const k = i / n;
    const x = 1080 + k * 620;
    const y = 780 - k * k * 480 - Math.sin(k * 18) * 18 * (1 - k);
    pricePts.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill>
        <div style={{position: 'absolute', top: 140, left: 240}}>
          <Label size={32} color={RED} spacing="0.4em">
            machine two
          </Label>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 60, color: INK, letterSpacing: '0.08em', marginTop: 14}}>
            THE MAZE
          </div>
        </div>
        {/* maze */}
        <svg width={560} height={420} viewBox="0 0 140 105" style={{position: 'absolute', left: 560, top: 480}}>
          {[
            'M5 5 H135 V100 H5 Z',
            'M20 5 V50 M20 65 V100',
            'M40 20 H90 M40 20 V80 M60 40 H120 M60 40 V85 M80 60 H110',
            'M100 5 V30 M120 20 V60 M35 85 H75',
          ].map((p, i) => (
            <path key={i} d={p} fill="none" stroke="rgba(234,234,234,0.3)" strokeWidth={2.5} />
          ))}
          <circle cx={70} cy={55} r={5} fill={RED} opacity={0.5 + 0.4 * Math.sin(frame / 7)} />
        </svg>
        {blocks}
        <div style={{position: 'absolute', left: 560, top: 920, fontFamily: SERIF, fontStyle: 'italic', fontSize: 28, color: INK, opacity: 0.6}}>
          thousands of shell companies
        </div>
        {/* price line */}
        <svg width={1920} height={1080} style={{position: 'absolute'}}>
          {[...Array(4)].map((_, i) => (
            <line key={i} x1={1080} y1={300 + i * 130} x2={1700} y2={300 + i * 130} stroke="rgba(234,234,234,0.07)" />
          ))}
          <path d={pricePts.join(' ')} fill="none" stroke={RED} strokeWidth={6} style={{filter: 'drop-shadow(0 0 10px rgba(193,18,31,0.5))'}} />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 1600,
            top: 240,
            fontFamily: STAT_FONT,
            fontWeight: 700,
            fontSize: 84,
            color: RED,
            opacity: priceT >= 0.98 ? 1 : 0,
          }}
        >
          $90
        </div>
        <div style={{position: 'absolute', left: 1090, top: 830, fontFamily: STAT_FONT, fontWeight: 500, fontSize: 24, letterSpacing: '0.3em', color: INK, opacity: 0.6}}>
          PENSIONS IN · STRONG BUY
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** California blackout: city windows going dark, price multiples ticking. */
export const Blackout: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const dark = interpolate(frame, [20, durationInFrames * 0.55], [1, 0.12], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const mult = 1 + Math.min(9, Math.floor(frame / 18));
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.08} pan={[0, -12]}>
      <AbsoluteFill style={{justifyContent: 'flex-end', alignItems: 'center'}}>
        <div style={{filter: 'drop-shadow(0 -10px 60px rgba(0,0,0,0.8))'}}>
          <CityGrid width={1920} height={520} litRatio={dark} />
        </div>
        <div style={{position: 'absolute', top: 140, left: 240}}>
          <Label size={30} color={INK} spacing="0.4em">
            california · 2000–2001
          </Label>
          <SerifText size={50} color={INK} style={{marginTop: 24, maxWidth: 800, lineHeight: 1.45}}>
            Traders celebrated the blackouts.
          </SerifText>
        </div>
        <div style={{position: 'absolute', top: 160, right: 220, textAlign: 'right'}}>
          <Label size={24} color={INK} spacing="0.35em" style={{opacity: 0.6}}>
            resale price
          </Label>
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 110, color: RED, fontVariantNumeric: 'tabular-nums'}}>
            ×{mult}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 90,
            width: '100%',
            textAlign: 'center',
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 40,
            color: RED,
            opacity: interpolate(frame, [durationInFrames * 0.7, durationInFrames * 0.7 + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          “Ask why.” — Nobody did.
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** THE crash: $90 -> $0.26 drawn exactly on the words. */
export const CrashChart: React.FC<{
  durationInFrames: number;
  sceneStart: number;
  points: TimedPoint[];
}> = ({durationInFrames, sceneStart, points}) => {
  const frame = useCurrentFrame();
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.05}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{position: 'absolute', top: 130, width: '100%', textAlign: 'center'}}>
          <Label size={30} color={INK} spacing="0.4em" style={{opacity: 0.8}}>
            enron · share price · 2001
          </Label>
        </div>
        <div style={{marginTop: 60}}>
          <TimedLineChart
            points={points}
            sceneStart={sceneStart}
            width={1400}
            height={620}
            vMax={95}
            yLabel={(v) => (v >= 1 ? `$${v.toFixed(0)}` : `$${v.toFixed(2)}`)}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 110,
            width: '100%',
            textAlign: 'center',
            fontFamily: SERIF,
            fontStyle: 'italic',
            fontSize: 36,
            color: INK,
            opacity: interpolate(frame, [20, 34], [0, 0.7], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'}),
          }}
        >
          one resignation · one memo · one disclosed loss
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Aftermath: shredder strips + changed American law. */
export const Shredder: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const strips = [...Array(16)].map((_, i) => {
    const fall = ((frame / 55 + i / 16) % 1 + 1) % 1;
    return (
      <div
        key={i}
        style={{
          position: 'absolute',
          left: 760 + (i % 8) * 52,
          top: 560 + fall * 360,
          width: 16,
          height: 90,
          background: 'rgba(234,234,234,0.16)',
          transform: `rotate(${(i * 37) % 24 - 12}deg)`,
          opacity: 1 - fall * 0.8,
        }}
      />
    );
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.07}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        {/* document going in */}
        <div
          style={{
            position: 'absolute',
            top: 300 + Math.min(160, frame * 3),
            left: 860,
            width: 200,
            height: 140,
            background: '#17161a',
            border: '1px solid rgba(234,234,234,0.25)',
            padding: 16,
          }}
        >
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{height: 8, background: 'rgba(234,234,234,0.2)', marginTop: 14, width: `${90 - i * 15}%`}} />
          ))}
        </div>
        {/* shredder */}
        <div
          style={{
            position: 'absolute',
            top: 500,
            left: 740,
            width: 440,
            height: 70,
            background: '#0a090c',
            border: '1px solid #2c2a31',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{fontFamily: STAT_FONT, fontWeight: 600, fontSize: 22, letterSpacing: '0.3em', color: RED}}>
            ARTHUR ANDERSEN
          </div>
        </div>
        {strips}
        <div style={{position: 'absolute', top: 170, width: '100%', textAlign: 'center'}}>
          <SerifText size={48} color={INK} style={{fontStyle: 'italic', opacity: 0.85}}>
            the final weeks: shredding the evidence
          </SerifText>
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 120,
            width: '100%',
            textAlign: 'center',
            fontFamily: STAT_FONT,
            fontWeight: 700,
            fontSize: 54,
            letterSpacing: '0.1em',
            color: RED,
            opacity: interpolate(frame, [durationInFrames * 0.6, durationInFrames * 0.6 + 12], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          IT CHANGED AMERICAN LAW
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};

/** Bridge into OneCoin: everything else was at least real. */
export const ImaginaryBridge: React.FC<{durationInFrames: number}> = ({durationInFrames}) => {
  const frame = useCurrentFrame();
  const items = ['AN EXCHANGE', 'A LAB', 'OFFICES', 'POWER PLANTS'];
  const fade = interpolate(frame, [durationInFrames * 0.5, durationInFrames * 0.8], [1, 0.15], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <SceneShell durationInFrames={durationInFrames} zoom={1.06}>
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center'}}>
        <div style={{display: 'flex', gap: 60, opacity: fade}}>
          {items.map((it, i) => (
            <div key={it} style={{textAlign: 'center'}}>
              <div style={{width: 200, height: 140, background: '#141318', border: '1px solid #2c2a31'}} />
              <Label size={22} color={INK} spacing="0.25em" style={{marginTop: 16, opacity: 0.7}}>
                {it}
              </Label>
            </div>
          ))}
        </div>
        <div
          style={{
            position: 'absolute',
            bottom: 200,
            textAlign: 'center',
            opacity: interpolate(frame, [durationInFrames * 0.55, durationInFrames * 0.75], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div style={{fontFamily: STAT_FONT, fontWeight: 700, fontSize: 90, color: RED, letterSpacing: '0.06em'}}>
            100% IMAGINARY
          </div>
          <div style={{fontFamily: SERIF, fontStyle: 'italic', fontSize: 42, color: INK, marginTop: 24, opacity: 0.85}}>
            and it's hers.
          </div>
        </div>
      </AbsoluteFill>
    </SceneShell>
  );
};
