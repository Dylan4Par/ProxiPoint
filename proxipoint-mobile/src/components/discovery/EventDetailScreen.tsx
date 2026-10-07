import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Platform,
} from 'react-native';
import { formatEventSchedule } from '../../lib/eventDetails';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

function openEventUrl(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url).catch(() => undefined);
}

export const EventDetailScreen: React.FC = () => {
  const eventDetailId = useDiscoveryStore((state) => state.eventDetailId);
  const node = useDiscoveryStore((state) => (eventDetailId ? state.nodes[eventDetailId] : undefined));
  const closeEventDetail = useDiscoveryStore((state) => state.closeEventDetail);
  const toggleRsvp = useDiscoveryStore((state) => state.toggleRsvp);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [failedUrls, setFailedUrls] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setPhotoIndex(0);
    setFailedUrls({});
  }, [eventDetailId]);

  useEffect(() => {
    if (!eventDetailId || typeof window === 'undefined') return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEventDetail();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [eventDetailId, closeEventDetail]);

  if (!node) return null;

  const pictures = node.pictures ?? [];
  const active = pictures[photoIndex] ?? pictures[0];
  const schedule = formatEventSchedule(node.startsAt, node.endsAt);
  const failed = active ? failedUrls[active.url] : true;

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {active && !failed ? (
            <Image
              source={{ uri: active.url }}
              style={styles.heroImage}
              resizeMode="cover"
              accessibilityLabel={active.caption}
              onError={() => setFailedUrls((current) => ({ ...current, [active.url]: true }))}
            />
          ) : (
            <View style={styles.heroFallback}>
              <Text style={styles.heroFallbackText}>{active?.caption ?? node.venue}</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.close}
            onPress={closeEventDetail}
            accessibilityRole="button"
            accessibilityLabel="Close event details"
          >
            <Text style={styles.closeMark}>✕</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.body}>
          <View style={styles.kickerRow}>
            <Text style={styles.tag}>{node.tag}</Text>
            <View style={[styles.statusPill, { backgroundColor: `${node.statusColor}26` }]}>
              <Text style={[styles.statusText, { color: node.statusColor }]}>{node.status}</Text>
            </View>
          </View>
          <Text style={styles.title}>{node.title}</Text>
          <Text style={styles.venue}>
            {node.venue}
            {node.distanceMeters > 0 ? ` · ${node.distanceMeters >= 1000 ? `${(node.distanceMeters / 1000).toFixed(1)} km` : `${node.distanceMeters} m`}` : ''}
          </Text>

          <Text style={styles.section}>Date and time</Text>
          <Text style={styles.dateLabel}>{schedule.dateLabel}</Text>
          <Text style={styles.timeLabel}>{schedule.timeLabel}</Text>

          <Text style={styles.section}>Event link</Text>
          <TouchableOpacity onPress={() => openEventUrl(node.url)} accessibilityRole="link" accessibilityLabel="Open event link">
            <Text style={styles.url}>{node.url}</Text>
          </TouchableOpacity>

          <Text style={styles.section}>Details</Text>
          <Text style={styles.summary}>{node.summary}</Text>

          {pictures.length > 0 ? (
            <>
              <Text style={styles.section}>Pictures</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
                {pictures.map((picture, index) => {
                  const broken = failedUrls[picture.url];
                  const selected = index === photoIndex;
                  return (
                    <TouchableOpacity
                      key={`${picture.url}-${index}`}
                      style={[styles.thumbWrap, selected && styles.thumbSelected]}
                      onPress={() => setPhotoIndex(index)}
                      accessibilityRole="button"
                      accessibilityLabel={picture.caption}
                    >
                      {broken ? (
                        <View style={styles.thumbFallback} />
                      ) : (
                        <Image
                          source={{ uri: picture.url }}
                          style={styles.thumb}
                          resizeMode="cover"
                          onError={() => setFailedUrls((current) => ({ ...current, [picture.url]: true }))}
                        />
                      )}
                      <Text style={styles.thumbCaption} numberOfLines={2}>
                        {picture.caption}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          ) : null}

          <TouchableOpacity
            style={[styles.rsvp, node.isRsvpd && styles.rsvpOn]}
            onPress={() => toggleRsvp(node.id)}
            accessibilityRole="button"
            accessibilityLabel={node.isRsvpd ? 'Cancel RSVP' : 'RSVP to event'}
          >
            <Text style={[styles.rsvpText, node.isRsvpd && styles.rsvpTextOn]}>
              {node.isRsvpd ? 'Going' : 'RSVP'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#070b13',
    zIndex: 40,
  },
  content: {
    paddingBottom: 36,
  },
  hero: {
    height: 300,
    backgroundColor: '#111827',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  heroFallbackText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '700',
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(8, 15, 29, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMark: {
    color: '#e2e8f0',
    fontSize: 16,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tag: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '800',
    marginTop: 10,
    lineHeight: 34,
  },
  venue: {
    color: '#94a3b8',
    fontSize: 15,
    marginTop: 6,
  },
  section: {
    color: '#7dd3fc',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginTop: 22,
    marginBottom: 6,
  },
  dateLabel: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '700',
  },
  timeLabel: {
    color: '#cbd5e1',
    fontSize: 16,
    marginTop: 4,
  },
  url: {
    color: '#38bdf8',
    fontSize: 15,
    lineHeight: 22,
    textDecorationLine: 'underline',
  },
  summary: {
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 24,
  },
  gallery: {
    gap: 10,
    paddingBottom: 4,
  },
  thumbWrap: {
    width: 132,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  thumbSelected: {
    borderColor: '#22d3ee',
  },
  thumb: {
    width: '100%',
    height: 88,
    backgroundColor: '#111827',
  },
  thumbFallback: {
    width: '100%',
    height: 88,
    backgroundColor: '#1e293b',
  },
  thumbCaption: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  rsvp: {
    marginTop: 26,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#22d3ee',
    paddingVertical: 14,
    alignItems: 'center',
  },
  rsvpOn: {
    backgroundColor: '#0e7490',
    borderColor: '#67e8f9',
  },
  rsvpText: {
    color: '#67e8f9',
    fontSize: 16,
    fontWeight: '800',
  },
  rsvpTextOn: {
    color: '#f8fafc',
  },
});
