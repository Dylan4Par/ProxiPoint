import React, { useMemo } from 'react';
import { Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { AppearancePalette } from '../../lib/appearance';
import { inviteSummary } from '../../lib/beaconInvite';
import { formatDuration, formatStartLabel } from '../../lib/beaconSchedule';
import { directionsUrl, eventDetailsText, eventSourceUrl } from '../../lib/eventDetail';
import type { DiscoveryNode } from '../../stores/useDiscoveryStore';

function openExternalUrl(url: string) {
  if (!url) return;
  if (Platform.OS === 'web') {
    const browser = globalThis as { open?: (next: string, target?: string, features?: string) => unknown };
    if (typeof browser.open === 'function') {
      browser.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
  }
  void Linking.openURL(url);
}

export const EventDetailPanel: React.FC<{
  node: DiscoveryNode;
  tagLabel: string;
  colors: AppearancePalette;
  onRsvp: () => void;
}> = ({ node, tagLabel, colors, onRsvp }) => {
  const styles = useMemo(() => createStyles(colors), [colors]);
  const source = eventSourceUrl(node);
  const directions = directionsUrl(node.latitude, node.longitude, node.etaMode);
  const details = eventDetailsText(node);
  const schedule = node.startsAt
    ? `${node.visibility === 'private' ? 'Private' : 'Public'} · ${formatStartLabel(new Date(node.startsAt), new Date())} · ${formatDuration(node.durationMinutes ?? 60)}`
    : node.status;

  return (
    <ScrollView
      testID="event-detail"
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.tag}>{tagLabel}</Text>
      <Text style={styles.title}>{node.title}</Text>
      <Text style={styles.venue}>{node.venue}</Text>
      {node.regionChain || node.regionName ? (
        <Text style={styles.region}>{node.regionChain || node.regionName}</Text>
      ) : null}
      {node.hostName ? <Text style={styles.meta}>Host · {node.hostName}</Text> : null}
      <Text style={styles.meta}>{schedule}</Text>
      {node.visibility === 'private' && inviteSummary(node.invites) ? (
        <Text style={styles.meta}>{inviteSummary(node.invites)}</Text>
      ) : null}

      <Text style={styles.section}>Event details</Text>
      <Text testID="event-details" style={styles.body}>
        {details}
      </Text>
      <View style={styles.goingRow}>
        <Text style={styles.metaInline}>
          {node.distanceMeters}m away · {node.eta}
        </Text>
        <View style={styles.goingField} testID="event-going-stack">
          <View style={styles.avatarStack}>
            <View style={[styles.avatar, { backgroundColor: '#f97316' }]} />
            <View style={[styles.avatar, { backgroundColor: '#3b82f6', marginLeft: -10 }]} />
            <View style={[styles.avatarCount, { marginLeft: -10 }]}>
              <Text style={styles.avatarCountText}>{node.attendeeCount}+</Text>
            </View>
          </View>
          <Text style={styles.goingText}>{node.attendeeCount} going</Text>
        </View>
      </View>

      <Text style={styles.section}>Source</Text>
      {source ? (
        <TouchableOpacity
          accessibilityRole="link"
          testID="event-source-link"
          onPress={() => openExternalUrl(source)}
        >
          <Text style={styles.link}>{source}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.body}>No source link for this drop.</Text>
      )}

      <View style={styles.actions}>
        {directions ? (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Get directions"
            testID="event-directions"
            style={styles.directions}
            onPress={() => openExternalUrl(directions)}
          >
            <Text style={styles.directionsText}>Get directions</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ selected: node.isRsvpd }}
          testID={`rsvp-button-${node.id}`}
          style={[styles.rsvp, node.isRsvpd && styles.rsvpActive]}
          onPress={onRsvp}
        >
          <Text style={[styles.rsvpIcon, node.isRsvpd && styles.rsvpIconActive]}>✓</Text>
          <Text style={[styles.rsvpLabel, node.isRsvpd && styles.rsvpLabelActive]}>RSVP</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

function createStyles(c: AppearancePalette) {
  return StyleSheet.create({
    scroll: {
      flex: 1,
      minHeight: 0,
    },
    content: {
      paddingHorizontal: 18,
      paddingBottom: 28,
    },
    tag: {
      color: c.accent,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    title: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      marginTop: 4,
    },
    venue: {
      color: c.text,
      fontSize: 15,
      fontWeight: '700',
      marginTop: 8,
    },
    region: {
      color: c.region,
      fontSize: 13,
      fontWeight: '700',
      marginTop: 4,
    },
    meta: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600',
      marginTop: 6,
    },
    goingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 10,
      marginTop: 10,
    },
    metaInline: {
      color: c.textMuted,
      fontSize: 13,
      fontWeight: '600',
    },
    goingField: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    goingText: {
      color: c.text,
      fontSize: 13,
      fontWeight: '700',
    },
    avatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: c.drawer,
    },
    avatarCount: {
      width: 28,
      height: 26,
      borderRadius: 13,
      backgroundColor: c.pull,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: c.drawer,
    },
    avatarCountText: {
      color: c.text,
      fontSize: 9,
      fontWeight: '800',
    },
    section: {
      color: c.text,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginTop: 18,
      marginBottom: 6,
    },
    body: {
      color: c.text,
      fontSize: 15,
      lineHeight: 22,
    },
    link: {
      color: c.accentBright,
      fontSize: 14,
      lineHeight: 20,
      textDecorationLine: 'underline',
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 20,
    },
    directions: {
      flex: 1,
      backgroundColor: c.accent,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    directionsText: {
      color: c.onAccent,
      fontSize: 16,
      fontWeight: '800',
    },
    rsvp: {
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 72,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1.5,
      borderRadius: 12,
      borderColor: c.textMuted,
    },
    rsvpActive: {
      borderColor: c.accentBright,
    },
    rsvpIcon: {
      color: c.textMuted,
      fontSize: 22,
      lineHeight: 24,
      fontWeight: '700',
    },
    rsvpIconActive: {
      color: c.accent,
    },
    rsvpLabel: {
      color: c.textDim,
      fontSize: 13,
      lineHeight: 16,
      fontWeight: '700',
    },
    rsvpLabelActive: {
      color: c.accent,
    },
  });
}
