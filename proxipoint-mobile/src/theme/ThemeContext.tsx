import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { DARK_COLORS, LIGHT_COLORS, toneFor, type ThemeColors } from './palette';

export type { ThemeColors } from './palette';

/** What the user picked in Settings → App settings → Appearance. */
export type ThemePreference = 'system' | 'dark' | 'light';
/** What's actually showing. */
export type ThemeMode = 'dark' | 'light';

interface ThemeValue {
  mode: ThemeMode;
  colors: ThemeColors;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  /** Theme version of a color written with its night value (for module-level constants). */
  tone: (darkValue: string) => string;
}

const ThemeContext = createContext<ThemeValue>({
  mode: 'dark',
  colors: DARK_COLORS,
  preference: 'system',
  setPreference: () => undefined,
  tone: (value) => value,
});

/**
 * Wrap the app once (app/_layout.tsx). "Match phone" follows the system setting, which needs
 * "userInterfaceStyle": "automatic" in app.json. The choice is kept in memory for now; save it
 * with the profile (PATCH /me) or in local storage later.
 */
export const ThemeProvider: React.FC<{ children: React.ReactNode; initialPreference?: ThemePreference }> = ({
  children,
  initialPreference = 'system',
}) => {
  const system = useColorScheme();
  const [preference, setPreference] = useState<ThemePreference>(initialPreference);
  const mode: ThemeMode = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
  const colors = mode === 'light' ? LIGHT_COLORS : DARK_COLORS;
  const tone = useCallback((darkValue: string) => toneFor(colors, darkValue), [colors]);

  const value = useMemo(
    () => ({ mode, colors, preference, setPreference, tone }),
    [mode, colors, preference, tone],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Shortcut for the current colors. */
export function useColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

// Styles are built once per theme and shared by every component that uses the same factory.
const styleCache = new WeakMap<object, Map<ThemeColors, unknown>>();

/**
 * Use instead of a module-level StyleSheet:
 *   const createStyles = (c: ThemeColors) => StyleSheet.create({ ... c.surface ... });
 *   const styles = useThemedStyles(createStyles);
 */
export function useThemedStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useContext(ThemeContext);
  let byTheme = styleCache.get(factory);
  if (!byTheme) {
    byTheme = new Map();
    styleCache.set(factory, byTheme);
  }
  let styles = byTheme.get(colors) as T | undefined;
  if (!styles) {
    styles = factory(colors);
    byTheme.set(colors, styles);
  }
  return styles;
}
