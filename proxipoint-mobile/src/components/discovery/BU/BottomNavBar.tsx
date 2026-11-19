import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Bell, Compass, Layers, MapPin, type LucideIcon } from 'lucide-react-native';

export type NavTab = 'discover' | 'activity' | 'drop' | 'drops';

interface BottomNavBarProps {
  /** Which tab is open. Falls back to the old `dropActive` flag when not given. */
  activeTab?: NavTab;
  onDiscover?: () => void;
  onActivity?: () => void;
  onDropPoint?: () => void;
  onMyDrops?: () => void;
  /** Unread Activity items. Shows a yellow dot (1–9) or "9+" on the bell. */
  unreadCount?: number;
  /** @deprecated Use `activeTab="drop"`. Kept so existing screens keep working. */
  dropActive?: boolean;
}

const CYAN = '#22d3ee';
const INK = '#0a1120';
const MUTED = '#94a3b8';
const CYAN_BRIGHT = '#a5f3fc';

interface TabSpec {
  id: NavTab;
  label: string;
  Icon: LucideIcon;
  testID: string;
}

const TABS: TabSpec[] = [
  { id: 'discover', label: 'Discover', Icon: Compass, testID: 'nav-discover' },
  { id: 'activity', label: 'Activity', Icon: Bell, testID: 'nav-activity' },
  { id: 'drop', label: 'Drop Point', Icon: MapPin, testID: 'nav-drop' },
  { id: 'drops', label: 'My Drops', Icon: Layers, testID: 'nav-my-drops' },
];

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  activeTab,
  onDiscover,
  onActivity,
  onDropPoint,
  onMyDrops,
  unreadCount = 0,
  dropActive = false,
}) => {
  const current: NavTab = activeTab ?? (dropActive ? 'drop' : 'discover');

  const handlers: Record<NavTab, (() => void) | undefined> = {
    discover: onDiscover,
    activity: onActivity,
    drop: onDropPoint,
    drops: onMyDrops,
  };

  return (
    <View style={styles.navWrapper} accessibilityRole="tablist">
      {TABS.map(({ id, label, Icon, testID }) => {
        const active = current === id;
        const showBadge = id === 'activity' && unreadCount > 0;
        return (
          <TouchableOpacity
            key={id}
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
                    <Icon size={24} color={CYAN} strokeWidth={6} />
                  </View>
                  <Icon size={24} color={CYAN_BRIGHT} strokeWidth={2.25} />
                </View>
              ) : (
                <Icon size={22} color={MUTED} strokeWidth={2} />
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

const styles = StyleSheet.create({
  navWrapper: {
    height: 72,
    zIndex: 40,
    backgroundColor: '#0a0f1d',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
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
    borderColor: CYAN,
    backgroundColor: '#0b1a26',
    shadowColor: CYAN,
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
    shadowColor: CYAN,
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
    backgroundColor: '#facc15',
    borderWidth: 2,
    borderColor: '#0a0f1d',
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
    color: MUTED,
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#f8fafc',
    fontWeight: '700',
  },
});
