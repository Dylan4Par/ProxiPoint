import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const BottomNavBar: React.FC = () => {
  return (
    <View style={styles.navWrapper}>
      {/* Discover Tab */}
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <Text style={styles.navIcon}>🧭</Text>
        <Text style={[styles.navLabel, styles.navLabelActive]}>Discover</Text>
      </TouchableOpacity>

      {/* In-line Create Event Button */}
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <View style={styles.inlineFab}>
          <Text style={styles.fabPlus}>+</Text>
        </View>
        <Text style={styles.navLabel}>Create Event</Text>
      </TouchableOpacity>

      {/* Activity / Alerts Tab */}
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <Text style={styles.navIcon}>🔔</Text>
        <Text style={styles.navLabel}>Activity/Alerts</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navWrapper: {
    height: 64,
    backgroundColor: '#0a0f1d',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingBottom: 6,
    paddingTop: 4,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  navIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  navLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#38bdf8',
  },
  inlineFab: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  fabPlus: {
    color: '#0f172a',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 20,
  },
});
