import React from 'react';
import {interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {INK, RED, STAT_FONT} from '../theme';

export type TimedPoint = {t: number; v: number; label: string};

/**
 * A red line that draws itself through value points, each reached exactly at
 * its narration timestamp (absolute seconds; the parent Sequence offset is
 * subtracted via `sceneStart`).
 */
export const TimedLineChart: React.FC<{
  points: TimedPoint[];
  sceneStart: number;
  width?: number;
  height?: number;
  vMax?: number;
  vMin?: number;
  yLabel?: (v: number) => string;
  showTip?: boolean;
}> = ({
  points,
  sceneStart,
  width = 1400,
  height = 640,
  vMax,
  vMin = 0,
  yLabel = (v) => `$${v}`,
  showTip = true,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const nowSec = sceneStart + frame / fps;

  const maxV = vMax ?? Math.max(...points.map((p) => p.v)) * 1.1;
  const x = (t: number) => {
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    return ((t - t0) / Math.max(0.001, t1 - t0)) * width;
  };
  const y = (v: number) => height - ((v - vMin) / (maxV - vMin)) * height;

  // Current interpolated position along the polyline by time.
  let px = 0;
  let pv = points[0].v;
  if (nowSec <= points[0].t) {
    px = 0;
    pv = points[0].v;
  } else if (nowSec >= points[points.length - 1].t) {
    px = width;
    pv = points[points.length - 1].v;
  } else {
    for (let i = 1; i < points.length; i++) {
      if (nowSec <= points[i].t) {
        const a = points[i - 1];
        const b = points[i];
        const k = (nowSec - a.t) / Math.max(0.001, b.t - a.t);
        px = x(a.t) + (x(b.t) - x(a.t)) * k;
        pv = a.v + (b.v - a.v) * k;
        break;
      }
    }
  }

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ');

  return (
    <div style={{position: 'relative', width, height}}>
      <svg width={width} height={height} style={{overflow: 'visible'}}>
        {/* grid */}
        {[...Array(5)].map((_, i) => (
          <line
            key={i}
            x1={0}
            x2={width}
            y1={(height / 4) * i}
            y2={(height / 4) * i}
            stroke="rgba(234,234,234,0.08)"
            strokeWidth={1}
          />
        ))}
        <defs>
          <clipPath id="chartReveal">
            <rect x={0} y={-60} width={px} height={height + 120} />
          </clipPath>
        </defs>
        <path
          d={path}
          fill="none"
          stroke={RED}
          strokeWidth={7}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath="url(#chartReveal)"
          style={{filter: 'drop-shadow(0 0 12px rgba(193,18,31,0.5))'}}
        />
        {/* reached point markers */}
        {points.map((p, i) =>
          nowSec >= p.t ? (
            <circle key={i} cx={x(p.t)} cy={y(p.v)} r={9} fill={RED} />
          ) : null
        )}
        {showTip ? <circle cx={px} cy={y(pv)} r={13} fill={RED} /> : null}
      </svg>
      {showTip ? (
        <div
          style={{
            position: 'absolute',
            left: Math.min(px + 26, width - 220),
            top: Math.max(0, y(pv) - 80),
            fontFamily: STAT_FONT,
            fontWeight: 700,
            fontSize: 64,
            color: RED,
            fontVariantNumeric: 'tabular-nums',
            textShadow: '0 0 24px rgba(193,18,31,0.5)',
          }}
        >
          {yLabel(pv)}
        </div>
      ) : null}
      {/* passed labels */}
      {points.map((p, i) =>
        nowSec >= p.t && p.label ? (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x(p.t) - 40,
              top: y(p.v) + 24,
              fontFamily: STAT_FONT,
              fontWeight: 500,
              fontSize: 26,
              color: INK,
              opacity: 0.7,
            }}
          >
            {p.label}
          </div>
        ) : null
      )}
    </div>
  );
};

/** Simple growing line for rise sections (draws left->right over duration). */
export const RisingLine: React.FC<{
  from?: number;
  dur: number;
  width?: number;
  height?: number;
  wobble?: number;
  endLabel?: string;
}> = ({from = 0, dur, width = 1200, height = 500, wobble = 30, endLabel}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, from + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const n = 60;
  const pts: string[] = [];
  for (let i = 0; i <= n * t; i++) {
    const k = i / n;
    const xx = k * width;
    const base = height - k * k * height * 0.92;
    const yy = base + Math.sin(k * 21) * wobble * (1 - k);
    pts.push(`${i === 0 ? 'M' : 'L'} ${xx.toFixed(1)} ${yy.toFixed(1)}`);
  }
  return (
    <div style={{position: 'relative', width, height}}>
      <svg width={width} height={height} style={{overflow: 'visible'}}>
        <path
          d={pts.join(' ')}
          fill="none"
          stroke={RED}
          strokeWidth={6}
          style={{filter: 'drop-shadow(0 0 10px rgba(193,18,31,0.45))'}}
        />
      </svg>
      {endLabel && t >= 1 ? (
        <div
          style={{
            position: 'absolute',
            right: -20,
            top: -40,
            fontFamily: STAT_FONT,
            fontWeight: 700,
            fontSize: 56,
            color: RED,
          }}
        >
          {endLabel}
        </div>
      ) : null}
    </div>
  );
};
