import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Camera, ChevronLeft, ChevronRight, List, MapPin, RotateCcw } from 'lucide-react-native';
import { OperatorAvatar } from './OperatorAvatar';
import { useOperatorAvatar, useProfileAvatarStore } from '../../stores/useProfileAvatarStore';
import {
  REACTION_EMOJI,
  formatEventWhen,
  type HostGallery,
  type HostPhoto,
} from '../../lib/profileGallery';
import { loadHostGallery, reactToHostPhoto } from '../../services/profileGallery';

type ListId = 'activities' | 'history' | 'territories';

const BUBBLES: { x: `${number}%`; y: number; size: number; color: string }[] = [
  { x: '4%', y: 18, size: 54, color: '#65a30d' },
  { x: '18%', y: 70, size: 36, color: '#ca8a04' },
  { x: '28%', y: 8, size: 28, color: '#0284c7' },
  { x: '46%', y: 36, size: 70, color: '#166534' },
  { x: '62%', y: 12, size: 40, color: '#b45309' },
  { x: '74%', y: 64, size: 48, color: '#0f766e' },
  { x: '86%', y: 20, size: 34, color: '#7c2d12' },
  { x: '8%', y: 110, size: 30, color: '#1d4ed8' },
  { x: '88%', y: 108, size: 26, color: '#a16207' },
];

export const HostProfile: React.FC<{
  callsign: string;
  onBack: () => void;
  onPickAvatar: () => void;
  avatarError?: string;
}> = ({ callsign, onBack, onPickAvatar, avatarError = '' }) => {
  const [gallery, setGallery] = useState<HostGallery | null>(null);
  const uploadedAvatar = useOperatorAvatar(callsign);
  const [following, setFollowing] = useState(false);
  const [openList, setOpenList] = useState<ListId | null>(null);
  const [note, setNote] = useState('');
  const actor = callsign.trim().replace(/^@+/, '') || 'ranger';

  useEffect(() => {
    let cancelled = false;
    loadHostGallery(callsign).then((next) => {
      if (!cancelled) setGallery(next);
    });
    return () => {
      cancelled = true;
    };
  }, [callsign]);

  useEffect(() => {
    if (gallery?.avatarUri) useProfileAvatarStore.getState().remember(callsign, gallery.avatarUri);
  }, [callsign, gallery?.avatarUri]);

  if (!gallery) {
    return <View style={styles.page} testID="host-profile" />;
  }

  const latest = gallery.photos[0];
  const initial = gallery.displayName.trim().charAt(0).toUpperCase() || 'R';
  const avatarUri = uploadedAvatar || gallery.avatarUri;

  const react = (emoji: string) => {
    if (!latest) return;
    void reactToHostPhoto(gallery, latest.id, actor, emoji).then((result) => {
      setGallery(result.gallery);
      setNote(result.error);
    });
  };

  return (
    <View style={styles.page} testID="host-profile">
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {BUBBLES.map((bubble) => (
            <View
              key={`${bubble.x}-${bubble.y}`}
              style={[styles.bubble, { left: bubble.x, top: bubble.y, width: bubble.size, height: bubble.size, borderRadius: bubble.size / 2, backgroundColor: bubble.color }]}
            />
          ))}
          <View style={styles.heroBar}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back" testID="host-profile-back" onPress={onBack} style={styles.backBtn}>
              <ChevronLeft color="#f8fafc" size={20} strokeWidth={2.4} />
              <Text style={styles.backText}>BACK</Text>
            </TouchableOpacity>
            <View style={styles.rankPill}>
              <Text style={styles.rankText}>{gallery.activities} events</Text>
            </View>
          </View>
          <View style={styles.avatarWrap}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Upload profile picture"
              testID="host-avatar-upload"
              onPress={onPickAvatar}
              style={styles.avatarHit}
            >
              <OperatorAvatar
                uri={avatarUri}
                initial={initial}
                size={92}
                backgroundColor="#0f172a"
                color="#f8fafc"
                fontSize={36}
                style={styles.avatar}
                testID="profile-avatar-image"
              />
              <View style={styles.cameraBadge}>
                <Camera color="#f8fafc" size={14} strokeWidth={2.4} />
              </View>
              <View style={styles.avatarBadge}>
                <Text style={styles.avatarBadgeText}>{gallery.activities}</Text>
              </View>
            </TouchableOpacity>
          </View>
          <Text style={styles.name}>{gallery.displayName}</Text>
          {avatarError ? <Text style={styles.avatarError}>{avatarError}</Text> : null}
          <View style={styles.statsRow}>
            <Stat label="Following" value={gallery.following} />
            <Stat label="Followers" value={gallery.followers} />
            <Stat label="Activities" value={gallery.activities} />
            <TouchableOpacity
              accessibilityRole="button"
              testID="profile-follow"
              style={[styles.followBtn, following && styles.followBtnOn]}
              onPress={() => setFollowing((current) => !current)}
            >
              <Text style={styles.followText}>{following ? 'FOLLOWING' : 'FOLLOW'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {latest ? (
          <View style={styles.sheet}>
            <Text style={styles.latestLabel}>Latest Event:</Text>
            <Text style={styles.latestTitle}>
              {formatEventWhen(latest.eventAt)} - {latest.eventPlace}
            </Text>
            <Image source={{ uri: latest.imageUri }} style={styles.photo} resizeMode="cover" accessibilityLabel={latest.eventTitle} />
            <View style={styles.emojiRow}>
              {REACTION_EMOJI.map((emoji) => {
                const mine = latest.reactions.some((reaction) => reaction.actor === actor && reaction.emoji === emoji);
                return (
                  <TouchableOpacity
                    key={emoji}
                    accessibilityRole="button"
                    accessibilityLabel={`React ${emoji}`}
                    testID={`photo-react-${emoji}`}
                    style={[styles.emojiBtn, mine && styles.emojiBtnOn]}
                    onPress={() => react(emoji)}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {note ? <Text style={styles.note}>{note}</Text> : null}
            <View style={styles.reactionList}>
              {latest.reactions.map((reaction) => (
                <View key={`${reaction.actor}-${reaction.emoji}`} style={styles.reactionRow}>
                  <View style={styles.reactionAvatar}>
                    <Text style={styles.reactionInitial}>{reaction.actor.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={styles.reactionActor}>@{reaction.actor}</Text>
                  <Text style={styles.reactionEmoji}>{reaction.emoji}</Text>
                </View>
              ))}
            </View>

            <ProfileLink
              icon={<List color="#0f172a" size={20} strokeWidth={2} />}
              label="View activities"
              open={openList === 'activities'}
              onPress={() => setOpenList((current) => (current === 'activities' ? null : 'activities'))}
            />
            {openList === 'activities'
              ? gallery.photos.map((photo) => <Text key={photo.id} style={styles.listItem}>{photo.eventTitle}</Text>)
              : null}
            <ProfileLink
              icon={<RotateCcw color="#0f172a" size={20} strokeWidth={2} />}
              label="View history"
              open={openList === 'history'}
              onPress={() => setOpenList((current) => (current === 'history' ? null : 'history'))}
            />
            {openList === 'history'
              ? gallery.photos.map((photo) => (
                <Text key={photo.id} style={styles.listItem}>{formatEventWhen(photo.eventAt)} · {photo.eventPlace}</Text>
              ))
              : null}
            <ProfileLink
              icon={<MapPin color="#0f172a" size={20} strokeWidth={2} />}
              label="View territories"
              open={openList === 'territories'}
              onPress={() => setOpenList((current) => (current === 'territories' ? null : 'territories'))}
            />
            {openList === 'territories'
              ? uniqueTerritories(gallery.photos).map((territory) => <Text key={territory} style={styles.listItem}>{territory}</Text>)
              : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const ProfileLink: React.FC<{ icon: React.ReactNode; label: string; open: boolean; onPress: () => void }> = ({
  icon,
  label,
  open,
  onPress,
}) => (
  <TouchableOpacity accessibilityRole="button" style={styles.linkRow} onPress={onPress}>
    {icon}
    <Text style={styles.linkLabel}>{label}</Text>
    <ChevronRight color="#0f172a" size={18} strokeWidth={2} style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }} />
  </TouchableOpacity>
);

function uniqueTerritories(photos: HostPhoto[]): string[] {
  const names: string[] = [];
  for (const photo of photos) {
    if (photo.territory && !names.includes(photo.territory)) names.push(photo.territory);
  }
  return names;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scroll: {
    paddingBottom: 28,
  },
  hero: {
    backgroundColor: '#07140d',
    paddingBottom: 18,
    overflow: 'hidden',
  },
  bubble: {
    position: 'absolute',
    opacity: 0.9,
  },
  heroBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingHorizontal: 14,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 2,
  },
  backText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  rankPill: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    zIndex: 2,
  },
  rankText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarWrap: {
    alignSelf: 'center',
    marginTop: 28,
    zIndex: 2,
  },
  avatarHit: {
    position: 'relative',
  },
  avatar: {
    borderWidth: 3,
    borderColor: '#f8fafc',
  },
  cameraBadge: {
    position: 'absolute',
    left: -4,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarError: {
    color: '#fecaca',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  avatarInitial: {
    color: '#f8fafc',
    fontSize: 36,
    fontWeight: '800',
  },
  avatarBadge: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  avatarBadgeText: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '800',
  },
  name: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 10,
    paddingHorizontal: 16,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  stat: {
    alignItems: 'center',
    minWidth: 64,
  },
  statLabel: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: '#22c55e',
    borderRadius: 22,
    minHeight: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  followBtnOn: {
    backgroundColor: '#15803d',
  },
  followText: {
    color: '#052e16',
    fontSize: 13,
    fontWeight: '800',
  },
  sheet: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  latestLabel: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '700',
  },
  latestTitle: {
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 2,
    marginBottom: 12,
  },
  photo: {
    width: '100%',
    height: 210,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
  },
  emojiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  emojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
  },
  emojiBtnOn: {
    borderColor: '#22c55e',
    backgroundColor: '#dcfce7',
  },
  emoji: {
    fontSize: 20,
  },
  note: {
    color: '#b91c1c',
    fontSize: 12,
    marginTop: 8,
  },
  reactionList: {
    marginTop: 10,
    marginBottom: 8,
    gap: 8,
  },
  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reactionAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionInitial: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
  },
  reactionActor: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '700',
  },
  reactionEmoji: {
    fontSize: 18,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  linkLabel: {
    flex: 1,
    color: '#0f172a',
    fontSize: 16,
    fontWeight: '500',
  },
  listItem: {
    color: '#334155',
    fontSize: 14,
    paddingLeft: 32,
    paddingBottom: 8,
  },
});
