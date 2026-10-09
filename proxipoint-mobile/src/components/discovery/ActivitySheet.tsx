import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AppearancePalette } from '../../lib/appearance';
import type { ActivitySection } from '../../lib/activityFeed';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useActivityStore, useActivityNotice } from '../../stores/useActivityStore';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

export const ActivitySheet: React.FC = () => {
  const open = useActivityStore((state) => state.open);
  const setOpen = useActivityStore((state) => state.setOpen);
  const markViewed = useActivityStore((state) => state.markViewed);
  const { feed, unread } = useActivityNotice();
  const colors = useAppearanceStore((state) => state.colors);
  const focusCard = useDiscoveryStore((state) => state.focusCard);
  const nodes = useDiscoveryStore((state) => state.nodes);
  const unreadKey = unread.join('|');

  useEffect(() => {
    if (!open || !unreadKey) return;
    markViewed(unreadKey.split('|'));
  }, [open, unreadKey, markViewed]);

  if (!open) return null;

  const openEvent = (eventId?: string) => {
    if (!eventId || !nodes[eventId]) return;
    focusCard(eventId);
    setOpen(false);
  };

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable style={[styles.backdrop, { backgroundColor: colors.modalBackdrop }]} onPress={() => setOpen(false)} />
      <View style={[styles.sheet, { backgroundColor: colors.drawer, borderColor: colors.border }]} testID="activity-sheet">
        <View style={[styles.handle, { backgroundColor: colors.pull }]} />
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>Activity</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close activity" testID="activity-close" onPress={() => setOpen(false)}>
            <Text style={[styles.close, { color: colors.textMuted }]}>Close</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {feed.map((section) => (
            <ActivitySectionBlock key={section.id} section={section} colors={colors} onOpen={openEvent} />
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const ActivitySectionBlock: React.FC<{
  section: ActivitySection;
  colors: AppearancePalette;
  onOpen: (eventId?: string) => void;
}> = ({ section, colors, onOpen }) => (
  <View style={styles.section} testID={`activity-section-${section.id}`}>
    <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
    {section.items.length === 0 ? (
      <Text style={[styles.empty, { color: colors.textDim }]}>{section.empty}</Text>
    ) : (
      section.items.map((item) => (
        <TouchableOpacity
          key={item.id}
          accessibilityRole="button"
          style={[styles.row, { borderColor: colors.border, backgroundColor: colors.card }]}
          onPress={() => onOpen(item.eventId)}
        >
          <View style={[styles.dot, { backgroundColor: dotColor(section.id) }]} />
          <View style={styles.rowCopy}>
            <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>{item.title}</Text>
            <Text style={[styles.rowDetail, { color: colors.textMuted }]} numberOfLines={1}>{item.detail}</Text>
          </View>
        </TouchableOpacity>
      ))
    )}
  </View>
);

function dotColor(kind: ActivitySection['id']): string {
  if (kind === 'rsvp') return '#38bdf8';
  if (kind === 'promo') return '#f59e0b';
  if (kind === 'following') return '#22c55e';
  return '#a78bfa';
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    maxHeight: '82%',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    marginTop: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  close: {
    fontSize: 14,
    fontWeight: '700',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
    marginBottom: 8,
  },
  empty: {
    fontSize: 13,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rowCopy: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  rowDetail: {
    fontSize: 12,
    marginTop: 2,
  },
});
