export type SceneSpec = {
  id: string;
  type: string;
  start: number;
  end: number;
  props?: Record<string, unknown>;
};

export type LedgerSpec = {
  at: number;
  entry: number;
  title: string;
  amount: string;
  sub: string;
};

export type SlamSpec = {
  at: number;
  total: string;
  prevTotal: string;
  retease: string;
};

export type StatSpec = {
  at: number;
  hold: number;
  number: string;
  caption: string;
};

export type ChartPoint = {t: number; v: number; label: string};

export type Timeline = {
  fps: number;
  durationSec: number;
  voiceoverSec: number;
  scenes: SceneSpec[];
  ledgers: LedgerSpec[];
  slams: SlamSpec[];
  stats: StatSpec[];
  enronChart: {start: number; end: number; points: ChartPoint[]};
  chapters: Array<{title: string; at: number}>;
  speech: Array<[number, number]>;
};
