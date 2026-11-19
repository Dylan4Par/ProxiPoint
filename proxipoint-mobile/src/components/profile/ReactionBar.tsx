import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SmilePlus } from 'lucide-react-native';
import { REACTION_EMOJIS, type ReactionEmoji, type Reactions } from '../../lib/pointRecap';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Emoji-only reactions: chips for the emojis already used (tap to add/remove yours) and a
 * smiley button that opens the fixed emoji set. No comments, by design.
 */
export const ReactionBar: React.FC<{
  reactions: Reactions;
  onToggle: (emoji: ReactionEmoji) => void;
  /** Lighter look for use on top of a photo. */
  onDark?: boolean;
  /** Just show the counts (e.g. your own recap): no adding or removing. */
  readOnly?: boolean;
  testID?: string;
}> = ({ reactions, onToggle, onDark = false, readOnly = false, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [picking, setPicking] = useState(false);
  const used = REACTION_EMOJIS.filter((emoji) => (reactions[emoji]?.count ?? 0) > 0);
  if (readOnly && used.length === 0) return null;

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.row}>
        {used.map((emoji) => {
          const entry = reactions[emoji]!;
          return (
            <TouchableOpacity
              key={emoji}
              style={[styles.chip, onDark && styles.chipDark, entry.mine && styles.chipMine]}
              onPress={() => onToggle(emoji)}
              disabled={readOnly}
              accessibilityRole={readOnly ? 'text' : 'button'}
              accessibilityLabel={`${emoji} ${entry.count}${entry.mine ? ', you reacted' : ''}`}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              <Text style={[styles.count, entry.mine && styles.countMine]}>{entry.count}</Text>
            </TouchableOpacity>
          );
        })}
        {readOnly ? null : (
        <TouchableOpacity
          style={[styles.addBtn, onDark && styles.chipDark, picking && styles.chipMine]}
          onPress={() => setPicking((open) => !open)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          accessibilityRole="button"
          accessibilityLabel={picking ? 'Close reactions' : 'Add a reaction'}
        >
          <SmilePlus size={17} color={picking ? c.accent : c.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        )}
      </View>

      {picking && !readOnly ? (
        <View style={[styles.picker, onDark && styles.pickerDark]}>
          {REACTION_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[styles.pickItem, reactions[emoji]?.mine && styles.pickItemMine]}
              onPress={() => {
                onToggle(emoji);
                setPicking(false);
              }}
              accessibilityRole="button"
              accessibilityLabel={`React ${emoji}`}
            >
              <Text style={styles.pickEmoji}>{emoji}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  wrap: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
  },
  chipDark: { backgroundColor: c.glass, borderColor: c.borderStrong },
  chipMine: { borderColor: c.accent, backgroundColor: 'rgba(34, 211, 238, 0.12)' },
  emoji: { fontSize: 14 },
  count: { color: c.textSecondary, fontSize: 12, fontWeight: '700' },
  countMine: { color: c.accentSoft },
  addBtn: {
    width: 34,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  picker: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: 2,
    padding: 4,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: c.borderStrong,
    backgroundColor: c.surface,
  },
  pickerDark: { backgroundColor: c.glassSolid },
  pickItem: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  pickItemMine: { backgroundColor: 'rgba(34, 211, 238, 0.18)' },
  pickEmoji: { fontSize: 22 },
});
