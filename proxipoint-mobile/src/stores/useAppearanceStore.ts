import { create } from 'zustand';
import {
  appearancePalette,
  readAppearanceMode,
  writeAppearanceMode,
  type AppearanceMode,
  type AppearancePalette,
} from '../lib/appearance';

type AppearanceState = {
  mode: AppearanceMode;
  colors: AppearancePalette;
  setMode: (mode: AppearanceMode) => void;
};

const initialMode = readAppearanceMode();

export const useAppearanceStore = create<AppearanceState>((set) => ({
  mode: initialMode,
  colors: appearancePalette(initialMode),
  setMode: (mode) => {
    writeAppearanceMode(mode);
    set({ mode, colors: appearancePalette(mode) });
  },
}));
