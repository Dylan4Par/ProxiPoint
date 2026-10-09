export type ChannelIconName =
  | 'note'
  | 'terminal'
  | 'flame'
  | 'utensils'
  | 'runner'
  | 'compass'
  | 'beacon';

export interface ChannelAnchor {
  icon: ChannelIconName;
  accent: string;
  surface: string;
  border: string;
}

const CYAN_NOTE: ChannelAnchor = {
  icon: 'note',
  accent: '#22d3ee',
  surface: 'rgba(34, 211, 238, 0.14)',
  border: 'rgba(34, 211, 238, 0.5)',
};

const SKY_TERMINAL: ChannelAnchor = {
  icon: 'terminal',
  accent: '#38bdf8',
  surface: 'rgba(56, 189, 248, 0.14)',
  border: 'rgba(56, 189, 248, 0.5)',
};

const AMBER_FLAME: ChannelAnchor = {
  icon: 'flame',
  accent: '#f59e0b',
  surface: 'rgba(245, 158, 11, 0.16)',
  border: 'rgba(245, 158, 11, 0.5)',
};

const AMBER_UTENSILS: ChannelAnchor = {
  icon: 'utensils',
  accent: '#f59e0b',
  surface: 'rgba(245, 158, 11, 0.16)',
  border: 'rgba(245, 158, 11, 0.5)',
};

const EMERALD_RUNNER: ChannelAnchor = {
  icon: 'runner',
  accent: '#34d399',
  surface: 'rgba(52, 211, 153, 0.14)',
  border: 'rgba(52, 211, 153, 0.5)',
};

const EMERALD_COMPASS: ChannelAnchor = {
  icon: 'compass',
  accent: '#34d399',
  surface: 'rgba(52, 211, 153, 0.14)',
  border: 'rgba(52, 211, 153, 0.5)',
};

const SLATE_BEACON: ChannelAnchor = {
  icon: 'beacon',
  accent: '#94a3b8',
  surface: 'rgba(148, 163, 184, 0.12)',
  border: '#1e293b',
};

const TAG_ANCHORS: Record<string, ChannelAnchor> = {
  livemusic: CYAN_NOTE,
  music: CYAN_NOTE,
  techmeetup: SKY_TERMINAL,
  postgis: SKY_TERMINAL,
  foodanddrink: AMBER_FLAME,
  foodtrucks: AMBER_FLAME,
  farmersmarket: AMBER_UTENSILS,
  fitness: EMERALD_RUNNER,
  pickleball: EMERALD_RUNNER,
  outdoor: EMERALD_COMPASS,
};

export function normalizeTagKey(tag: string): string {
  return tag.trim().replace(/^#/, '').toLowerCase().replace(/[\s_-]+/g, '');
}

export function resolveTagAnchor(tag: string): ChannelAnchor {
  return TAG_ANCHORS[normalizeTagKey(tag)] ?? SLATE_BEACON;
}
