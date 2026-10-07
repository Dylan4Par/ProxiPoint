export const APPEARANCE_STORAGE_KEY = 'proxipoint.appearance';

export type AppearanceMode = 'day' | 'night';

export type AppearancePalette = {
  statusBar: 'light-content' | 'dark-content';
  screen: string;
  header: string;
  surface: string;
  inset: string;
  card: string;
  cardSelected: string;
  drawer: string;
  nav: string;
  navBorder: string;
  map: string;
  grid: string;
  road: string;
  modal: string;
  modalBackdrop: string;
  border: string;
  text: string;
  textMuted: string;
  textDim: string;
  accent: string;
  accentBright: string;
  accentSoft: string;
  onAccent: string;
  region: string;
  schedule: string;
  onlineBorder: string;
  pull: string;
  badge: string;
  badgeText: string;
  sheet: string;
  input: string;
  crosshair: string;
  pinTag: string;
  pinTagText: string;
  ringLabel: string;
  statusBox: string;
  navLabel: string;
  navLabelActive: string;
  segmentBorder: string;
};

const night: AppearancePalette = {
  statusBar: 'light-content',
  screen: '#070b13',
  header: 'rgba(15, 23, 42, 0.75)',
  surface: '#1e293b',
  inset: '#0f172a',
  card: '#0f172a',
  cardSelected: '#0b1629',
  drawer: '#090f1d',
  nav: '#0a0f1d',
  navBorder: '#1e293b',
  map: '#0a1120',
  grid: '#1e293b',
  road: '#172554',
  modal: '#0f172a',
  modalBackdrop: 'rgba(2, 6, 23, 0.8)',
  border: '#334155',
  text: '#f8fafc',
  textMuted: '#94a3b8',
  textDim: '#64748b',
  accent: '#06b6d4',
  accentBright: '#38bdf8',
  accentSoft: 'rgba(6, 182, 212, 0.15)',
  onAccent: '#0f172a',
  region: '#22d3ee',
  schedule: '#67e8f9',
  onlineBorder: '#0a1120',
  pull: '#334155',
  badge: '#172554',
  badgeText: '#38bdf8',
  sheet: '#070d18',
  input: '#0d1526',
  crosshair: 'rgba(15, 23, 42, 0.92)',
  pinTag: '#0a1120',
  pinTagText: '#67e8f9',
  ringLabel: '#0a1120',
  statusBox: '#172554',
  navLabel: '#94a3b8',
  navLabelActive: '#e2e8f0',
  segmentBorder: 'rgba(56, 189, 248, 0.2)',
};

const day: AppearancePalette = {
  statusBar: 'dark-content',
  screen: '#e7eef6',
  header: 'rgba(255, 255, 255, 0.94)',
  surface: '#ffffff',
  inset: '#f8fafc',
  card: '#ffffff',
  cardSelected: '#ecfeff',
  drawer: '#f3f7fb',
  nav: '#ffffff',
  navBorder: '#d5dee8',
  map: '#d5e3f0',
  grid: '#b7c8d9',
  road: '#9eb4c9',
  modal: '#ffffff',
  modalBackdrop: 'rgba(15, 23, 42, 0.28)',
  border: '#d0dae4',
  text: '#0f172a',
  textMuted: '#475569',
  textDim: '#64748b',
  accent: '#0891b2',
  accentBright: '#0e7490',
  accentSoft: 'rgba(8, 145, 178, 0.12)',
  onAccent: '#083344',
  region: '#0e7490',
  schedule: '#0f766e',
  onlineBorder: '#ffffff',
  pull: '#94a3b8',
  badge: '#e0f2fe',
  badgeText: '#0369a1',
  sheet: '#f8fafc',
  input: '#ffffff',
  crosshair: 'rgba(255, 255, 255, 0.96)',
  pinTag: '#ffffff',
  pinTagText: '#0e7490',
  ringLabel: '#d5e3f0',
  statusBox: '#e0f2fe',
  navLabel: '#64748b',
  navLabelActive: '#0f172a',
  segmentBorder: 'rgba(8, 145, 178, 0.28)',
};

export function appearancePalette(mode: AppearanceMode): AppearancePalette {
  return mode === 'day' ? day : night;
}

type AppearanceStorage = {
  getItem: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
};

function browserStorage(): AppearanceStorage | null {
  if (typeof globalThis.localStorage === 'undefined') return null;
  return globalThis.localStorage;
}

export function readAppearanceMode(storage: AppearanceStorage | null = browserStorage()): AppearanceMode {
  const value = storage?.getItem(APPEARANCE_STORAGE_KEY);
  return value === 'day' ? 'day' : 'night';
}

export function writeAppearanceMode(mode: AppearanceMode, storage: AppearanceStorage | null = browserStorage()): void {
  storage?.setItem?.(APPEARANCE_STORAGE_KEY, mode);
}
