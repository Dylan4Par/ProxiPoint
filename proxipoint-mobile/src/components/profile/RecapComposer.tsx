import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Clock, Globe, ImagePlus, MapPin, PenLine, X, Zap, type LucideIcon } from 'lucide-react-native';
import { formatBeaconDate } from '../../lib/beaconWindow';
import { pointStatus, publicWhere, type DroppedPoint } from '../../lib/droppedPoint';
import {
  newId,
  RECAP_PHOTO_LIMIT,
  RECAP_TEXT_LIMIT,
  type PointRecap,
} from '../../lib/pointRecap';
import { pickRecapPhotos } from '../../lib/profilePhotos';
import { PhotoRulesNote } from '../safety/PhotoRulesNote';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** The empty state's how-it-works steps (matches what the Drop Point sheet offers). */
const EXPLAIN_STEPS: Array<{ Icon: LucideIcon; title: string; body: string }> = [
  { Icon: Zap, title: 'Start it now', body: 'Drop it while it’s happening and it shows as LIVE NOW.' },
  { Icon: Clock, title: 'Or schedule it', body: 'Pick a start and end time; it goes live on its own.' },
  { Icon: Globe, title: 'Choose who sees it', body: 'Private (people you invite), one Channel, or Public.' },
  { Icon: ImagePlus, title: 'Post a recap here', body: 'Once it has started, share photos and a few words.' },
];

interface RecapComposerProps {
  drops: DroppedPoint[];
  onPost: (recap: PointRecap) => void;
  /** Shown when there's nothing to recap yet. */
  onDropPoint: () => void;
}

/** "Post Point": a short recap of a live or ended Point, with up to 3 photos. */
export const RecapComposer: React.FC<RecapComposerProps> = ({ drops, onPost, onDropPoint }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  // Only Points that have started can be recapped. Most recent first.
  const eligible = useMemo(
    () =>
      drops
        .filter((drop) => pointStatus(drop) !== 'upcoming')
        .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime()),
    [drops],
  );

  const [open, setOpen] = useState(false);
  const [pointId, setPointId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = eligible.find((drop) => drop.id === pointId) ?? eligible[0] ?? null;

  const reset = () => {
    setOpen(false);
    setPointId(null);
    setText('');
    setPhotos([]);
    setError('');
  };

  const addPhotos = async () => {
    if (busy || photos.length >= RECAP_PHOTO_LIMIT) return;
    setBusy(true);
    setError('');
    try {
      const picked = await pickRecapPhotos(RECAP_PHOTO_LIMIT - photos.length);
      setPhotos((current) => [...current, ...picked].slice(0, RECAP_PHOTO_LIMIT));
    } catch {
      setError('Couldn’t load those photos. Try different ones.');
    } finally {
      setBusy(false);
    }
  };

  const post = () => {
    if (!selected) return;
    const trimmed = text.trim();
    if (!trimmed && photos.length === 0) {
      setError('Write a few words or add a photo.');
      return;
    }
    onPost({
      id: newId('recap'),
      pointId: selected.id,
      pointTitle: selected.title,
      pointStartsAt: selected.startsAt,
      where: publicWhere(selected),
      text: trimmed,
      photos: photos.map((uri) => ({ id: newId('photo'), uri, reactions: {} })),
      reactions: {},
      createdAt: new Date().toISOString(),
    });
    reset();
  };

  if (eligible.length === 0) {
    return (
      <View style={styles.emptyCard} testID="recap-empty">
        <Text style={styles.explainTitle}>What’s a Point?</Text>
        <Text style={styles.explainLead}>
          A Point is an event you put on the map: a show, a pickup game, a meetup, a pop-up. People nearby
          can find it and RSVP.
        </Text>
        <View style={styles.steps}>
          {EXPLAIN_STEPS.map(({ Icon, title, body }) => (
            <View key={title} style={styles.step}>
              <View style={styles.stepIcon}>
                <Icon size={16} color={c.accent} strokeWidth={2.25} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>{title}</Text>
                <Text style={styles.stepBody}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.primaryBtn} onPress={onDropPoint} accessibilityRole="button">
          <MapPin size={15} color={c.base} strokeWidth={2.5} />
          <Text style={styles.primaryText}>DROP A POINT</Text>
        </TouchableOpacity>
        <Text style={styles.explainNote}>You can also tap + on Explore Map.</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <TouchableOpacity
        style={styles.openTile}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        testID="recap-open"
      >
        <PenLine size={18} color={c.accent} strokeWidth={2.25} />
        <View style={{ flex: 1 }}>
          <Text style={styles.openTitle}>Post a recap</Text>
          <Text style={styles.openSub} numberOfLines={1}>
            How did {eligible[0].title} go? Add a few words and up to {RECAP_PHOTO_LIMIT} photos.
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card} testID="recap-composer">
      <Text style={styles.label}>Point</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pointRow}>
        {eligible.map((drop) => {
          const active = selected?.id === drop.id;
          return (
            <TouchableOpacity
              key={drop.id}
              style={[styles.pointChip, active && styles.pointChipActive]}
              onPress={() => setPointId(drop.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.pointChipText, active && styles.pointChipTextActive]} numberOfLines={1}>
                {drop.title}
              </Text>
              <Text style={[styles.pointChipDate, active && styles.pointChipTextActive]}>
                {formatBeaconDate(new Date(drop.startsAt))}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.labelRow}>
        <Text style={styles.label}>Recap</Text>
        <Text style={[styles.count, text.length >= RECAP_TEXT_LIMIT && styles.countFull]}>
          {text.length} / {RECAP_TEXT_LIMIT}
        </Text>
      </View>
      <TextInput
        value={text}
        onChangeText={(value) => {
          setText(value.slice(0, RECAP_TEXT_LIMIT));
          setError('');
        }}
        placeholder="Happy to see everyone here! It was a great turnout!"
        placeholderTextColor={c.textFaint}
        multiline
        textAlignVertical="top"
        style={styles.input}
        testID="recap-text"
      />

      <Text style={styles.label}>
        Photos ({photos.length}/{RECAP_PHOTO_LIMIT})
      </Text>
      <View style={styles.photoRow}>
        {photos.map((uri, index) => (
          <View key={`${uri}-${index}`} style={styles.thumb}>
            <Image source={{ uri }} style={styles.thumbImage} />
            <TouchableOpacity
              style={styles.thumbRemove}
              onPress={() => setPhotos((current) => current.filter((_, i) => i !== index))}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
            >
              <X size={12} color={c.text} strokeWidth={3} />
            </TouchableOpacity>
          </View>
        ))}
        {photos.length < RECAP_PHOTO_LIMIT ? (
          <TouchableOpacity
            style={[styles.thumb, styles.addThumb]}
            onPress={addPhotos}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Add photos"
            testID="recap-add-photos"
          >
            {busy ? <ActivityIndicator color={c.accent} /> : <ImagePlus size={22} color={c.accent} strokeWidth={2} />}
          </TouchableOpacity>
        ) : null}
      </View>

      <PhotoRulesNote />
      <Text style={styles.note}>People can react with emojis. Recaps don’t have comments.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={reset} accessibilityRole="button">
          <Text style={styles.secondaryText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, styles.flex]} onPress={post} accessibilityRole="button" testID="recap-post">
          <Text style={styles.primaryText}>POST</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  flex: { flex: 1 },
  openTile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accent,
    backgroundColor: 'rgba(34, 211, 238, 0.06)',
    padding: 14,
  },
  openTitle: { color: c.text, fontSize: 15, fontWeight: '800' },
  openSub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  card: {
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: c.accent,
    padding: 14,
    gap: 8,
  },
  label: { color: c.textMuted, fontSize: 12, fontWeight: '700' },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  count: { color: c.textFaint, fontSize: 11, fontWeight: '700' },
  countFull: { color: c.amber },
  pointRow: { gap: 8 },
  pointChip: {
    maxWidth: 180,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
  },
  pointChipActive: { backgroundColor: c.accent, borderColor: c.accentSoft },
  pointChipText: { color: c.text, fontSize: 13, fontWeight: '700' },
  pointChipDate: { color: c.textMuted, fontSize: 11, marginTop: 1 },
  pointChipTextActive: { color: c.onAccent },
  input: {
    minHeight: 84,
    maxHeight: 160,
    backgroundColor: c.base,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  photoRow: { flexDirection: 'row', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', backgroundColor: c.base },
  thumbImage: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: c.photoChip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addThumb: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { color: c.textFaint, fontSize: 11, marginTop: 2 },
  error: { color: c.amber, fontSize: 12, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  secondaryBtn: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: c.text, fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    minHeight: 44,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: c.base, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: c.border,
    padding: 18,
  },
  emptyText: { color: c.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  explainTitle: { color: c.text, fontSize: 16, fontWeight: '800', alignSelf: 'flex-start' },
  explainLead: { color: c.textSecondary, fontSize: 13, lineHeight: 19, alignSelf: 'stretch' },
  steps: { alignSelf: 'stretch', gap: 10, marginVertical: 4 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.accentTint,
    borderWidth: 1,
    borderColor: c.accentBorder,
  },
  stepCopy: { flex: 1, gap: 1 },
  stepTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
  stepBody: { color: c.textMuted, fontSize: 12.5, lineHeight: 17 },
  explainNote: { color: c.textFaint, fontSize: 12 },
});
