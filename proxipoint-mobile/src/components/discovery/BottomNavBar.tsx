import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useActivityStore, useActivityNotice } from '../../stores/useActivityStore';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

const ICON = 40;

const DiscoverIcon: React.FC = () => (
  <Svg width={ICON} height={ICON} viewBox="0 0 40 40">
    <Defs>
      <LinearGradient id="compassRim" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#7ef3ff" />
        <Stop offset="1" stopColor="#1d4ed8" />
      </LinearGradient>
      <LinearGradient id="compassNeedle" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#8af6ff" />
        <Stop offset="0.45" stopColor="#22d3ee" />
        <Stop offset="1" stopColor="#0369a1" />
      </LinearGradient>
    </Defs>
    <Circle cx="20" cy="20" r="16.2" fill="#071526" />
    <Circle cx="20" cy="20" r="15.2" fill="none" stroke="url(#compassRim)" strokeWidth="2.1" />
    <Path
      d="M20 5.2v3.2M20 31.6v3.2M5.2 20h3.2M31.6 20h3.2"
      stroke="#38bdf8"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <Path
      d="M20 9.2l6.2 10.8L20 30.8 13.8 20 20 9.2z"
      fill="url(#compassNeedle)"
      transform="rotate(45 20 20)"
    />
  </Svg>
);

const DropPointIcon: React.FC = () => (
  <Svg width={ICON} height={ICON} viewBox="0 0 40 40">
    <Defs>
      <LinearGradient id="pinFill" x1="0.5" y1="0" x2="0.5" y2="1">
        <Stop offset="0" stopColor="#7ef6ff" />
        <Stop offset="0.55" stopColor="#22d3ee" />
        <Stop offset="1" stopColor="#0284c7" />
      </LinearGradient>
      <LinearGradient id="pinRing" x1="0" y1="0.5" x2="1" y2="0.5">
        <Stop offset="0" stopColor="#67e8f9" />
        <Stop offset="1" stopColor="#2563eb" />
      </LinearGradient>
    </Defs>
    <Ellipse
      cx="20"
      cy="31.2"
      rx="12.2"
      ry="4.15"
      fill="none"
      stroke="url(#pinRing)"
      strokeWidth="3.1"
    />
    <Path
      d="M20 3.2c6.7 0 11.6 5 11.6 11.5 0 5.2-4.1 10.4-11.6 17.3C12.5 25.1 8.4 19.9 8.4 14.7 8.4 8.2 13.3 3.2 20 3.2z"
      fill="url(#pinFill)"
    />
    <Circle cx="20" cy="14.4" r="4.7" fill="#07111f" />
  </Svg>
);

const ActivityIcon: React.FC = () => (
  <Svg width={ICON} height={ICON} viewBox="0 0 40 40">
    <Defs>
      <LinearGradient id="bellRim" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#7ef3ff" />
        <Stop offset="1" stopColor="#1d4ed8" />
      </LinearGradient>
      <LinearGradient id="bellFill" x1="0.5" y1="0" x2="0.5" y2="1">
        <Stop offset="0" stopColor="#8af6ff" />
        <Stop offset="1" stopColor="#0284c7" />
      </LinearGradient>
    </Defs>
    <Circle cx="20" cy="20" r="16.2" fill="#071526" />
    <Circle cx="20" cy="20" r="15.2" fill="none" stroke="url(#bellRim)" strokeWidth="2.1" />
    <Path
      d="M20 10.2a1.15 1.15 0 0 1 1.15 1.15h-2.3A1.15 1.15 0 0 1 20 10.2zm-5.1 9.1v-1.5c0-3.1 2-5.6 5.1-6.2 3.1.6 5.1 3.1 5.1 6.2v1.5c1.5.55 2.5 1.45 2.5 2.4H12.4c0-.95 1-1.85 2.5-2.4z"
      fill="url(#bellFill)"
    />
    <Path
      d="M17.3 23.4a2.7 2.7 0 0 0 5.4 0"
      fill="none"
      stroke="#38bdf8"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Svg>
);

export const BottomNavBar: React.FC = () => {
  const dropSheetOpen = useDiscoveryStore((s) => s.dropSheetOpen);
  const setDropSheetOpen = useDiscoveryStore((s) => s.setDropSheetOpen);
  const activityOpen = useActivityStore((s) => s.open);
  const setActivityOpen = useActivityStore((s) => s.setOpen);
  const { unread } = useActivityNotice();
  const colors = useAppearanceStore((s) => s.colors);

  return (
    <View style={[styles.navWrapper, { backgroundColor: colors.nav, borderTopColor: colors.navBorder }]}>
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => setDropSheetOpen(false)}
      >
        <View style={styles.iconContainer}>
          <DiscoverIcon />
        </View>
        <Text style={[styles.navLabel, { color: dropSheetOpen ? colors.navLabel : colors.navLabelActive }]}>Discover</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={() => setDropSheetOpen(true)}
      >
        <View style={styles.iconContainer}>
          <DropPointIcon />
        </View>
        <Text style={[styles.navLabel, { color: dropSheetOpen ? colors.navLabelActive : colors.navLabel }]}>Drop Point</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        testID="activity-button"
        accessibilityRole="button"
        accessibilityLabel={unread.length > 0 ? `Activity, ${unread.length} notifications` : 'Activity'}
        onPress={() => {
          setDropSheetOpen(false);
          setActivityOpen(!activityOpen);
        }}
      >
        <View style={styles.iconContainer}>
          <ActivityIcon />
          {unread.length > 0 ? (
            <View style={styles.notice} testID="activity-badge">
              <Text style={styles.noticeText}>{unread.length > 99 ? '99+' : unread.length}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.navLabel, { color: activityOpen ? colors.navLabelActive : colors.navLabel }]}>Activity</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navWrapper: {
    height: 78,
    backgroundColor: '#0a0f1d',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 6,
    paddingBottom: 6,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  iconContainer: {
    width: ICON,
    height: ICON,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notice: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  navLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 3,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#e2e8f0',
    fontWeight: '600',
  },
});
