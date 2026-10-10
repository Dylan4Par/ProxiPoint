import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatFeedMeta } from '../../lib/feedSections';
import { getChannelStyle } from '../../lib/tagIcons';
import { getTrustBadge, type ProxiEvent } from '../../lib/trust';
import { ChannelBadge } from './ChannelBadge';
import { PulsingDot } from './PulsingDot';

interface Props {
  event: ProxiEvent;
  live?: boolean;
  selected?: boolean;
  onPress?: () => void;
  onToggleRsvp?: () => void;
}

export const EventCard: React.FC<Props> = ({ event, live = false, selected = false, onPress, onToggleRsvp }) => {
  const channel = getChannelStyle(event.tag);
  const trust = getTrustBadge(event.hostDrops, event.hostUpvotes);
  const meta = formatFeedMeta(event);
  const isSelected = selected || Boolean(event.selected);

  return (
    <View style={[styles.card, isSelected && styles.cardSelected]}>
      <TouchableOpacity
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${event.title}, ${meta}`}
        onPress={onPress}
        style={styles.cardHit}
      >
        <ChannelBadge tag={event.tag} />
        <View style={styles.cardBody}>
          <Text style={[styles.channelLabel, { color: channel.accent }]} numberOfLines={1}>
            {event.tag}
          </Text>
          <Text style={styles.titleText} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.hostCallsign} numberOfLines={1}>
            {event.hostCallsign}
          </Text>
          {trust.show ? (
            <Text style={styles.verifiedBadge} numberOfLines={2}>
              {trust.label}
            </Text>
          ) : null}
          <Text style={styles.subline} numberOfLines={1}>
            {event.venue} · {event.attendeeCount} going
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.trailing}>
        {live ? <PulsingDot size={7} /> : <View style={styles.dotSpacer} />}
        <Text style={[styles.metaText, live && styles.metaLive]}>{meta}</Text>
        <TouchableOpacity
          style={[styles.rsvpBtn, event.isRsvpd && styles.rsvpBtnActive]}
          accessibilityRole="button"
          accessibilityLabel={event.isRsvpd ? `Cancel RSVP for ${event.title}` : `RSVP to ${event.title}`}
          onPress={onToggleRsvp}
        >
          <Text style={[styles.rsvpLabel, event.isRsvpd && styles.rsvpLabelActive]}>
            {event.isRsvpd ? "RSVP'd" : 'RSVP'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#020617',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 3,
  },
  cardSelected: {
    borderColor: '#22d3ee',
    backgroundColor: '#0b1629',
  },
  cardHit: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minWidth: 0,
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
  },
  channelLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  titleText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  hostCallsign: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 3,
  },
  verifiedBadge: {
    alignSelf: 'flex-start',
    color: '#facc15',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    borderColor: 'rgba(250, 204, 21, 0.55)',
    borderWidth: 1,
    borderRadius: 999,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
  },
  subline: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 3,
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 72,
    gap: 2,
  },
  dotSpacer: {
    height: 18,
  },
  metaText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '700',
  },
  metaLive: {
    color: '#6ee7b7',
  },
  rsvpBtn: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#020617',
  },
  rsvpBtnActive: {
    borderColor: 'rgba(34, 211, 238, 0.55)',
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
  },
  rsvpLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  rsvpLabelActive: {
    color: '#22d3ee',
  },
});
