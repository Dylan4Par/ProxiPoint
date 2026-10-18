import React, { useState } from 'react';
import { Alert, Image, Modal, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Flag, Share2, Trash2, X } from 'lucide-react-native';
import { ReportSheet, type ReportTarget } from '../safety/ReportSheet';
import { formatBeaconDate } from '../../lib/beaconWindow';
import { SHARE_BASE_URL } from '../../lib/droppedPoint';
import { reactionTotal, toggleReaction, type PointRecap, type RecapPhoto } from '../../lib/pointRecap';
import { ReactionBar } from './ReactionBar';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

interface RecapCardProps {
  recap: PointRecap;
  onChange: (recap: PointRecap) => void;
  onDelete: (id: string) => void;
  /**
   * False on your own recaps (the Profile page): reactions are shown read-only and a Share
   * button takes the place of the add-reaction button. True when viewing someone else's.
   */
  canReact?: boolean;
  /** Who posted it (someone else's recap): lets the report also block them. */
  authorHandle?: string | null;
}

export const RecapCard: React.FC<RecapCardProps> = ({ recap, onChange, onDelete, canReact = false, authorHandle = null }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // canReact = someone else's recap: they can be reported, not deleted.
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const [shareError, setShareError] = useState('');

  const share = async () => {
    setShareError('');
    const url = `${SHARE_BASE_URL}${encodeURIComponent(recap.pointId)}`;
    const when = formatBeaconDate(new Date(recap.pointStartsAt));
    const lines = [`${recap.pointTitle} · ${when} · ${recap.where}`, recap.text, url].filter(Boolean);
    try {
      // Android only uses `message`, so the link goes in the text too; iOS shows `url` as a rich link.
      await Share.share(
        Platform.OS === 'ios' ? { message: lines.slice(0, -1).join('\n\n'), url } : { message: lines.join('\n\n') },
        { subject: `${recap.pointTitle} recap` },
      );
    } catch {
      setShareError('Couldn’t open sharing.');
    }
  };

  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = recap.photos.find((photo) => photo.id === viewingId) ?? null;

  const updatePhoto = (photo: RecapPhoto) =>
    onChange({ ...recap, photos: recap.photos.map((p) => (p.id === photo.id ? photo : p)) });

  const confirmDelete = () =>
    Alert.alert('Delete this recap?', 'The post, its photos and reactions will be removed.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(recap.id) },
    ]);

  return (
    <View style={styles.card} testID={`recap-${recap.id}`}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title} numberOfLines={1}>
            {recap.pointTitle}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {formatBeaconDate(new Date(recap.pointStartsAt))} · {recap.where}
          </Text>
        </View>
        {canReact ? (
          <TouchableOpacity
            onPress={() =>
              setReporting({ type: 'recap', id: recap.id, label: recap.pointTitle, ownerHandle: authorHandle })
            }
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Report recap"
            testID={`recap-report-${recap.id}`}
          >
            <Flag size={16} color={c.textFaint} strokeWidth={2} />
          </TouchableOpacity>
        ) : (
        <TouchableOpacity
          onPress={confirmDelete}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Delete recap"
        >
          <Trash2 size={16} color={c.textFaint} strokeWidth={2} />
        </TouchableOpacity>
        )}
      </View>

      {recap.text ? <Text style={styles.text}>{recap.text}</Text> : null}

      {recap.photos.length > 0 ? <PhotoGrid photos={recap.photos} onOpen={setViewingId} /> : null}

      {canReact ? (
        <ReactionBar
          reactions={recap.reactions}
          onToggle={(emoji) => onChange({ ...recap, reactions: toggleReaction(recap.reactions, emoji) })}
          testID={`recap-reactions-${recap.id}`}
        />
      ) : (
        <View style={styles.footer}>
          <View style={styles.footerReactions}>
            <ReactionBar reactions={recap.reactions} onToggle={() => undefined} readOnly />
          </View>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={share}
            accessibilityRole="button"
            accessibilityLabel="Share recap"
            testID={`recap-share-${recap.id}`}
          >
            <Share2 size={15} color={c.accent} strokeWidth={2.25} />
            <Text style={styles.shareText}>Share</Text>
          </TouchableOpacity>
        </View>
      )}
      {shareError ? <Text style={styles.shareError}>{shareError}</Text> : null}

      <ReportSheet target={reporting} onClose={() => setReporting(null)} />

      <PhotoViewer
        canReact={canReact}
        photo={viewing}
        index={viewing ? recap.photos.indexOf(viewing) : 0}
        total={recap.photos.length}
        onClose={() => setViewingId(null)}
        onChange={updatePhoto}
        onStep={(step) => {
          if (!viewing) return;
          const next = recap.photos[recap.photos.indexOf(viewing) + step];
          if (next) setViewingId(next.id);
        }}
      />
    </View>
  );
};

/** 1 photo: wide. 2: side by side. 3: one large, two stacked. */
const PhotoGrid: React.FC<{ photos: RecapPhoto[]; onOpen: (id: string) => void }> = ({ photos, onOpen }) => {
  const styles = useThemedStyles(createStyles);
  const tile = (photo: RecapPhoto, style: object) => {
    const total = reactionTotal(photo.reactions);
    return (
      <TouchableOpacity
        key={photo.id}
        style={[styles.tile, style]}
        onPress={() => onOpen(photo.id)}
        activeOpacity={0.85}
        accessibilityRole="imagebutton"
        accessibilityLabel="Open photo"
      >
        <Image source={{ uri: photo.uri }} style={styles.tileImage} />
        {total > 0 ? (
          <View style={styles.tileBadge}>
            <Text style={styles.tileBadgeText}>
              {Object.keys(photo.reactions).slice(0, 2).join('')} {total}
            </Text>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  };

  if (photos.length === 1) return <View style={styles.gridOne}>{tile(photos[0], styles.fill)}</View>;
  if (photos.length === 2)
    return (
      <View style={styles.gridTwo}>
        {photos.map((photo) => tile(photo, styles.half))}
      </View>
    );
  return (
    <View style={styles.gridThree}>
      {tile(photos[0], styles.big)}
      <View style={styles.stack}>{photos.slice(1, 3).map((photo) => tile(photo, styles.small))}</View>
    </View>
  );
};

/** Full-screen photo with reactions. Also used by the Photos tile on host profiles. */
export const PhotoViewer: React.FC<{
  canReact: boolean;
  /** Optional line under the counter, e.g. which recap the photo is from. */
  caption?: string;
  photo: RecapPhoto | null;
  index: number;
  total: number;
  onClose: () => void;
  onChange: (photo: RecapPhoto) => void;
  onStep: (step: number) => void;
}> = ({ canReact, caption, photo, index, total, onClose, onChange, onStep }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={photo != null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.viewer, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.viewerTop}>
          <View style={styles.viewerHeading}>
            <Text style={styles.viewerCount}>
              {index + 1} / {total}
            </Text>
            {caption ? (
              <Text style={styles.viewerCaption} numberOfLines={1}>
                {caption}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={onClose} style={styles.viewerClose} accessibilityRole="button" accessibilityLabel="Close photo">
            <X size={22} color={c.text} strokeWidth={2.25} />
          </TouchableOpacity>
        </View>
        {photo ? (
          <>
            <View style={styles.viewerImageWrap}>
              <Image source={{ uri: photo.uri }} style={styles.viewerImage} resizeMode="contain" />
              {/* Tap the left or right side to move between photos. */}
              <TouchableOpacity style={[styles.stepZone, { left: 0 }]} onPress={() => onStep(-1)} disabled={index === 0} />
              <TouchableOpacity
                style={[styles.stepZone, { right: 0 }]}
                onPress={() => onStep(1)}
                disabled={index >= total - 1}
              />
            </View>
            <ReactionBar
              reactions={photo.reactions}
              onToggle={(emoji) => onChange({ ...photo, reactions: toggleReaction(photo.reactions, emoji) })}
              onDark
              readOnly={!canReact}
            />
          </>
        ) : null}
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 14,
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  headerCopy: { flex: 1, gap: 2 },
  title: { color: c.text, fontSize: 15, fontWeight: '800' },
  meta: { color: c.textMuted, fontSize: 12 },
  text: { color: c.textBody, fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  footerReactions: { flex: 1 },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.accentBorder,
    backgroundColor: 'rgba(34, 211, 238, 0.08)',
  },
  shareText: { color: c.accent, fontSize: 12, fontWeight: '800' },
  shareError: { color: c.amber, fontSize: 12, fontWeight: '600' },
  tile: { borderRadius: 12, overflow: 'hidden', backgroundColor: c.base },
  tileImage: { width: '100%', height: '100%' },
  tileBadge: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    backgroundColor: c.photoChip,
  },
  tileBadgeText: { color: c.text, fontSize: 11, fontWeight: '700' },
  gridOne: { aspectRatio: 16 / 10 },
  fill: { flex: 1 },
  gridTwo: { flexDirection: 'row', gap: 6, aspectRatio: 2 },
  half: { flex: 1 },
  gridThree: { flexDirection: 'row', gap: 6, aspectRatio: 3 / 2 },
  big: { flex: 2 },
  stack: { flex: 1, gap: 6 },
  small: { flex: 1 },
  viewer: { flex: 1, backgroundColor: c.viewerBackdrop, paddingHorizontal: 16, gap: 14 },
  viewerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  viewerCount: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
  viewerHeading: { flex: 1, gap: 2, marginRight: 12 },
  viewerCaption: { color: c.text, fontSize: 14, fontWeight: '700' },
  viewerClose: { padding: 6 },
  viewerImageWrap: { flex: 1 },
  viewerImage: { width: '100%', height: '100%' },
  stepZone: { position: 'absolute', top: 0, bottom: 0, width: '30%' },
});
