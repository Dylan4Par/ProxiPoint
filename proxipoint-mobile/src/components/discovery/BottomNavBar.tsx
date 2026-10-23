import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { tourTarget } from '../tour/tourTargets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleUser, Compass, Map as MapIcon, Users, type LucideIcon } from 'lucide-react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** discover = feed, map = Explore Map, channels = groups + alerts, profile = your profile. */
export type NavTab = 'discover' | 'map' | 'channels' | 'profile';

/** Height of the tab bar itself (without the phone's navigation bar under it). */
export const NAV_BAR_BASE_HEIGHT = 72;

/**
 * Full height of the bottom nav, including the space kept clear for the phone's own
 * navigation bar (gesture line or back/home buttons). Sheets that sit above the nav use this.
 */
export function useNavBarHeight(): number {
  const insets = useSafeAreaInsets();
  return NAV_BAR_BASE_HEIGHT + insets.bottom;
}

interface BottomNavBarProps {
  /** Which tab is open. */
  activeTab?: NavTab;
  onDiscover?: () => void;
  onMap?: () => void;
  onChannels?: () => void;
  onProfile?: () => void;
  /** Unread alerts. Shows a yellow dot (1–9) or "9+" on the Channels icon. */
  unreadCount?: number;
}

// Ink on the yellow unread dot stays dark in both themes.
const INK = '#0a1120';

interface TabSpec {
  id: NavTab;
  label: string;
  Icon: LucideIcon;
  testID: string;
}

const TABS: TabSpec[] = [
  { id: 'discover', label: 'Discover', Icon: Compass, testID: 'nav-discover' },
  { id: 'map', label: 'Explore Map', Icon: MapIcon, testID: 'nav-map' },
  { id: 'channels', label: 'Channels', Icon: Users, testID: 'nav-channels' },
  { id: 'profile', label: 'Profile', Icon: CircleUser, testID: 'nav-profile' },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onDiscover,
  onMap,
  onChannels,
  onProfile,
  unreadCount = 0,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const current: NavTab = activeTab ?? 'discover';
  const insets = useSafeAreaInsets();

  const handlers: Record<NavTab, (() => void) | undefined> = {
    discover: onDiscover,
    map: onMap,
    channels: onChannels,
    profile: onProfile,
  };

  return (
    <View
      style={[styles.navWrapper, { height: NAV_BAR_BASE_HEIGHT + insets.bottom, paddingBottom: 6 + insets.bottom }]}
      accessibilityRole="tablist"
    >
      {TABS.map(({ id, label, Icon, testID }) => {
        const active = current === id;
        const showBadge = id === 'channels' && unreadCount > 0;
        return (
          <TouchableOpacity
            key={id}
            ref={
              id === 'profile'
                ? tourTarget('nav-profile')
                : id === 'channels'
                  ? tourTarget('nav-channels')
                  : id === 'discover'
                    ? tourTarget('nav-discover')
                    : undefined
            }
            style={styles.navItem}
            activeOpacity={0.7}
            onPress={handlers[id]}
            testID={testID}
            accessibilityRole="tab"
            accessibilityLabel={showBadge ? `${label}, ${unreadCount} unread` : label}
            accessibilityState={{ selected: active }}
          >
            <View style={[styles.tabBox, active && styles.tabBoxActive]}>
            <View style={styles.iconSlot}>
              {active ? (
                // Glowing icon: a thick, faint cyan copy behind a crisp cyan icon.
                // The halo layer works on Android too, where view shadows can't glow transparent content.
                <View style={styles.iconGlow}>
                  <View style={styles.iconHalo}>
                    <Icon size={24} color={c.accent} strokeWidth={6} />
                  </View>
                  <Icon size={24} color={c.accentBright} strokeWidth={2.25} />
                </View>
              ) : (
                <Icon size={22} color={c.textMuted} strokeWidth={2} />
              )}
              {showBadge ? (
                <View style={[styles.unreadDot, unreadCount > 9 && styles.unreadDotWide]}>
                  <Text style={styles.unreadText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.navLabel, active && styles.navLabelActive]} numberOfLines={1}>
              {label}
            </Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  navWrapper: {
    height: 72,
    zIndex: 40,
    backgroundColor: c.nav,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingVertical: 6,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Rounded box around icon + label: invisible on idle tabs, glowing cyan on the open tab
     (same treatment as the glowing panels in the Drop Point sheet). */
  tabBox: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 76,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 3,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  tabBoxActive: {
    borderColor: c.accent,
    backgroundColor: c.accentWash,
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 8,
  },
  iconSlot: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Selected icon glow. iOS gets a real blur from the shadow; the halo copy covers Android. */
  iconGlow: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: c.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },
  iconHalo: {
    position: 'absolute',
    opacity: 0.28,
  },
  unreadDot: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: c.yellow,
    borderWidth: 2,
    borderColor: c.nav,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadDotWide: {
    minWidth: 22,
  },
  unreadText: {
    color: INK,
    fontSize: 8,
    fontWeight: '900',
    lineHeight: 10,
  },
  navLabel: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  navLabelActive: {
    color: c.text,
    fontWeight: '700',
  },
});
