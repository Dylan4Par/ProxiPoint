import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export const BottomNavBar: React.FC = () => {
  return (
    <View style={styles.navWrapper}>
      {/* 1. Discover Button with Scaled Compass */}
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <View style={styles.iconContainer}>
          <View style={styles.compassBadge}>
            <View style={styles.compassNeedleWrap}>
              <View style={styles.needleNorth} />
              <View style={styles.needleCenterPin} />
              <View style={styles.needleSouth} />
            </View>
          </View>
        </View>
        <Text style={[styles.navLabel, styles.navLabelActive]}>Discover</Text>
      </TouchableOpacity>

      {/* 2. Drop Point Button with Matched 34px Badge */}
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <View style={styles.iconContainer}>
          <View style={styles.dropPointBadge}>
            <View style={styles.pinHead}>
              <View style={styles.pinHole} />
            </View>
            <View style={styles.pinTip} />
          </View>
        </View>
        <Text style={styles.navLabel}>Drop Point</Text>
      </TouchableOpacity>

      {/* 3. Activity Button with Scaled Bell Icon */}
      <TouchableOpacity style={styles.navItem} activeOpacity={0.7}>
        <View style={styles.iconContainer}>
          <View style={styles.bellWrapper}>
            <View style={styles.bellCap} />
            <View style={styles.bellBody} />
            <View style={styles.bellLip} />
            <View style={styles.bellClapper} />
          </View>
        </View>
        <Text style={styles.navLabel}>Activity</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  navWrapper: {
    height: 72,
    backgroundColor: '#0a0f1d',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    paddingTop: 10,
    paddingBottom: 10,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  /* Scaled-down 34x34 Icon Container */
  iconContainer: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  navLabelActive: {
    color: '#e2e8f0',
    fontWeight: '600',
  },

  /* 1. Scaled Compass Badge (34px) */
  compassBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassNeedleWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  needleNorth: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#0a1120',
  },
  needleCenterPin: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#0a1120',
    borderWidth: 0.8,
    borderColor: '#22d3ee',
    marginVertical: -1,
    zIndex: 2,
  },
  needleSouth: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0e7490',
  },

  /* 2. Scaled Drop Point Badge (34px) */
  dropPointBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHead: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0a1120',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHole: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#22d3ee',
  },
  pinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 3,
    borderRightWidth: 3,
    borderTopWidth: 5,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#0a1120',
    marginTop: -1.5,
  },

  /* 3. Scaled Golden Bell (34px container) */
  bellWrapper: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellCap: {
    width: 4,
    height: 2.5,
    backgroundColor: '#facc15',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  bellBody: {
    width: 15,
    height: 11,
    backgroundColor: '#facc15',
    borderTopLeftRadius: 7.5,
    borderTopRightRadius: 7.5,
    marginTop: -1,
  },
  bellLip: {
    width: 18,
    height: 2.5,
    backgroundColor: '#facc15',
    borderRadius: 1.2,
    marginTop: 1,
  },
  bellClapper: {
    width: 5,
    height: 2.5,
    backgroundColor: '#facc15',
    borderBottomLeftRadius: 2.5,
    borderBottomRightRadius: 2.5,
    marginTop: 1,
  },
});
