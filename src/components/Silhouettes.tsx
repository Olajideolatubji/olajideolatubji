import React from 'react';

/**
 * Hand-drawn abstract vector silhouettes. All figures are pure black shapes —
 * no facial features anywhere, per the visual system.
 */

const S = '#050506';

export const PlaneSilhouette: React.FC<{size?: number; color?: string}> = ({
  size = 260,
  color = S,
}) => (
  <svg width={size} height={size * 0.36} viewBox="0 0 260 94">
    <path
      d="M4 52 L150 44 L196 12 L212 12 L188 46 L246 44 L258 52 L246 58 L188 56 L210 88 L194 88 L150 58 L60 62 L28 78 L14 78 L34 60 Z"
      fill={color}
    />
  </svg>
);

export const StandingFigure: React.FC<{height?: number; color?: string}> = ({
  height = 420,
  color = S,
}) => (
  <svg width={height * 0.38} height={height} viewBox="0 0 76 200">
    <circle cx="38" cy="22" r="15" fill={color} />
    <path
      d="M20 44 C24 38 52 38 56 44 L62 110 L54 112 L50 78 L52 196 L42 196 L38 120 L34 196 L24 196 L26 78 L22 112 L14 110 Z"
      fill={color}
    />
  </svg>
);

export const WalkingFigure: React.FC<{height?: number; color?: string}> = ({
  height = 420,
  color = S,
}) => (
  <svg width={height * 0.5} height={height} viewBox="0 0 100 200">
    <circle cx="46" cy="20" r="14" fill={color} />
    <path
      d="M32 40 C38 34 58 34 62 42 L70 104 L62 106 L56 76 L74 150 L88 192 L78 196 L60 152 L48 122 L40 158 L30 196 L20 192 L30 148 L34 92 L26 108 L18 104 Z"
      fill={color}
    />
    {/* suitcase */}
    <rect x="72" y="150" width="26" height="36" rx="3" fill={color} />
    <rect x="80" y="142" width="10" height="8" fill={color} />
  </svg>
);

export const GownFigure: React.FC<{height?: number; color?: string}> = ({
  height = 460,
  color = S,
}) => (
  <svg width={height * 0.45} height={height} viewBox="0 0 90 200">
    <circle cx="45" cy="18" r="13" fill={color} />
    {/* hair bun suggestion */}
    <circle cx="45" cy="8" r="6" fill={color} />
    <path
      d="M30 36 C36 30 54 30 60 36 L64 70 C64 70 80 160 74 196 L16 196 C10 160 26 70 26 70 Z"
      fill={color}
    />
    {/* raised arm to podium */}
    <path d="M60 40 L84 62 L80 70 L56 52 Z" fill={color} />
  </svg>
);

export const SeatedBeanbagFigure: React.FC<{width?: number; color?: string}> = ({
  width = 520,
  color = S,
}) => (
  <svg width={width} height={width * 0.55} viewBox="0 0 200 110">
    {/* beanbag */}
    <path d="M20 108 C10 78 34 62 66 64 L150 66 C186 66 196 88 188 108 Z" fill={color} opacity={0.85} />
    {/* slouched figure */}
    <circle cx="96" cy="34" r="14" fill={color} />
    <path
      d="M78 48 C86 42 108 44 114 52 L138 74 L150 98 L138 104 L118 80 L86 76 L62 92 L54 84 L70 62 Z"
      fill={color}
    />
    {/* laptop */}
    <path d="M116 70 L146 64 L150 74 L120 80 Z" fill={color} />
  </svg>
);

export const TurtleneckBust: React.FC<{height?: number; color?: string}> = ({
  height = 560,
  color = S,
}) => (
  <svg width={height * 0.7} height={height} viewBox="0 0 140 200">
    {/* head — clean oval, no features */}
    <ellipse cx="70" cy="38" rx="26" ry="32" fill={color} />
    {/* pulled-back hair silhouette */}
    <path d="M44 30 C44 6 96 6 96 30 L96 44 C96 20 44 20 44 44 Z" fill={color} />
    {/* turtleneck */}
    <path
      d="M52 66 C58 74 82 74 88 66 L92 78 C110 84 126 100 132 132 L136 200 L4 200 L8 132 C14 100 30 84 48 78 Z"
      fill={color}
    />
    <rect x="52" y="62" width="36" height="14" rx="6" fill={color} />
  </svg>
);

export const SuitFigureRow: React.FC<{count?: number; height?: number; gap?: number; color?: string}> = ({
  count = 5,
  height = 260,
  gap = 40,
  color = S,
}) => (
  <div style={{display: 'flex', gap, alignItems: 'flex-end'}}>
    {[...Array(count)].map((_, i) => (
      <svg key={i} width={height * 0.42} height={height * (0.92 + (i % 3) * 0.04)} viewBox="0 0 84 200">
        <circle cx="42" cy="20" r="14" fill={color} />
        <path
          d="M22 40 C30 34 54 34 62 40 L70 90 L66 200 L18 200 L14 90 Z"
          fill={color}
        />
        {/* lapel hint */}
        <path d="M36 42 L42 58 L48 42 L42 46 Z" fill="#0B0B0D" />
      </svg>
    ))}
  </div>
);

export const GavelIcon: React.FC<{size?: number; color?: string; rotate?: number}> = ({
  size = 300,
  color = S,
  rotate = 0,
}) => (
  <svg width={size} height={size} viewBox="0 0 100 100" style={{transform: `rotate(${rotate}deg)`}}>
    <rect x="30" y="14" width="34" height="20" rx="4" fill={color} transform="rotate(-35 47 24)" />
    <rect x="42" y="30" width="10" height="44" rx="3" fill={color} transform="rotate(-35 47 52)" />
    <rect x="14" y="78" width="56" height="10" rx="4" fill={color} />
  </svg>
);

export const BookStack: React.FC<{size?: number; color?: string}> = ({size = 200, color = S}) => (
  <svg width={size} height={size * 0.7} viewBox="0 0 100 70">
    <rect x="10" y="50" width="80" height="12" rx="2" fill={color} />
    <rect x="16" y="36" width="70" height="12" rx="2" fill={color} opacity={0.9} />
    <rect x="22" y="22" width="60" height="12" rx="2" fill={color} opacity={0.8} />
  </svg>
);

export const YachtSilhouette: React.FC<{width?: number; color?: string}> = ({
  width = 420,
  color = S,
}) => (
  <svg width={width} height={width * 0.4} viewBox="0 0 200 80">
    <path d="M10 58 L190 58 L170 74 L34 74 Z" fill={color} />
    <path d="M60 58 L64 34 L130 34 L140 58 Z" fill={color} opacity={0.9} />
    <path d="M84 34 L84 10 L88 10 L96 34 Z" fill={color} />
  </svg>
);

export const CityGrid: React.FC<{
  width?: number;
  height?: number;
  litRatio?: number;
  color?: string;
  litColor?: string;
}> = ({width = 1600, height = 420, litRatio = 1, color = '#111014', litColor = 'rgba(234,234,234,0.5)'}) => {
  const buildings: React.ReactNode[] = [];
  let x = 0;
  let bi = 0;
  while (x < width) {
    const w = 46 + ((bi * 37) % 70);
    const h = 90 + ((bi * 83) % (height - 120));
    const windows: React.ReactNode[] = [];
    const cols = Math.floor(w / 18);
    const rows = Math.floor(h / 26);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const idx = (bi * 131 + c * 17 + r * 7) % 100;
        const lit = idx / 100 < 0.28 && idx / 100 < litRatio * 0.28;
        if (lit) {
          windows.push(
            <rect
              key={`${c}-${r}`}
              x={x + 6 + c * 18}
              y={height - h + 8 + r * 26}
              width={7}
              height={10}
              fill={litColor}
            />
          );
        }
      }
    }
    buildings.push(
      <g key={bi}>
        <rect x={x} y={height - h} width={w} height={h} fill={color} />
        {windows}
      </g>
    );
    x += w + 14;
    bi++;
  }
  return (
    <svg width={width} height={height}>
      {buildings}
    </svg>
  );
};
