import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Bell, Globe, Lock, Plus, Users, X } from 'lucide-react-native';
import { INTEREST_TAG_LIMIT } from '../../lib/myProfile';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** "#LiveMusic" from "livemusic", "#live music", "##LiveMusic" (letters, numbers, _ only). */
function cleanTag(raw: string): string {
  const body = raw.replace(/#/g, '').replace(/[^A-Za-z0-9_]/g, '');
  return body ? `#${body.slice(0, 30)}` : '';
}

const same = (a: string, b: string) => a.replace(/^#+/, '').toLowerCase() === b.replace(/^#+/, '').toLowerCase();

/**
 * Profile → MY #TAGS: the tags you follow, with a Public / Private switch.
 * New Points and Boosts with these tags show up in Activity.
 */
export const MyTagsTile: React.FC<{
  tags: string[];
  isPublic: boolean;
  onChange: (tags: string[], isPublic: boolean) => void;
  /** Counted in "20+ people into #tag nearby" numbers (opt-in). */
  countMeIn?: boolean;
  onChangeCountMeIn?: (on: boolean) => void;
  /** Rounded nearby counts per #tag ("20+"), or null when too few to show. */
  nearbyCounts?: Record<string, string | null>;
}> = ({ tags, isPublic, onChange, countMeIn = false, onChangeCountMeIn, nearbyCounts = {} }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const knownTags = useDiscoveryStore((state) => state.tags) as string[];
  const full = tags.length >= INTEREST_TAG_LIMIT;

  const add = (raw: string) => {
    const tag = cleanTag(raw);
    if (!tag) return;
    if (tags.some((existing) => same(existing, tag))) {
      setError(`You already follow ${tag}.`);
      return;
    }
    if (full) {
      setError(`You can follow up to ${INTEREST_TAG_LIMIT} #tags.`);
      return;
    }
    onChange([...tags, tag], isPublic);
    setInput('');
    setError('');
  };

  const remove = (tag: string) => {
    onChange(tags.filter((existing) => existing !== tag), isPublic);
    setError('');
  };

  // Tags already used on Discover that you don't follow yet.
  const suggestions = (knownTags || [])
    .filter((tag) => typeof tag === 'string' && tag.replace(/^#+/, '').trim() && !/^#?all$/i.test(tag))
    .filter((tag) => !tags.some((existing) => same(existing, tag)))
    .slice(0, 12);

  return (
    <View style={styles.tile} testID="profile-tags">
      <View style={styles.visibilityRow}>
        {isPublic ? (
          <Globe size={16} color={c.green} strokeWidth={2.25} />
        ) : (
          <Lock size={16} color={c.textMuted} strokeWidth={2.25} />
        )}
        <View style={styles.visibilityCopy}>
          <Text style={styles.visibilityLabel}>{isPublic ? 'Public' : 'Private'}</Text>
          <Text style={styles.hint}>
            {isPublic ? 'Shown on your public profile.' : 'Only you can see these.'}
          </Text>
        </View>
        <Switch
          value={isPublic}
          onValueChange={(value) => onChange(tags, value)}
          trackColor={{ false: c.borderStrong, true: c.accentTrack }}
          thumbColor={isPublic ? c.accent : c.textMuted}
          accessibilityLabel="Show my #tags on my public profile"
          testID="profile-tags-public"
        />
      </View>

      {tags.length ? (
        <View style={styles.chips}>
          {tags.map((tag) => (
            <View key={tag} style={styles.chip}>
              <Text style={styles.chipText}>{tag}</Text>
              {nearbyCounts[tag] ? (
                <Text style={styles.chipCount} accessibilityLabel={`${nearbyCounts[tag]} people nearby`}>
                  {nearbyCounts[tag]}
                </Text>
              ) : null}
              <TouchableOpacity
                onPress={() => remove(tag)}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${tag}`}
              >
                <X size={13} color={c.accent} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>No #tags yet.</Text>
      )}

      {full ? null : (
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={(value) => {
              setInput(value === '' ? '' : cleanTag(value) || '#');
              setError('');
            }}
            onSubmitEditing={() => add(input)}
            placeholder="#LiveMusic"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            blurOnSubmit={false}
            style={styles.input}
            testID="profile-tags-input"
          />
          <TouchableOpacity
            style={[styles.addBtn, !cleanTag(input) && styles.addBtnOff]}
            onPress={() => add(input)}
            disabled={!cleanTag(input)}
            accessibilityRole="button"
            accessibilityLabel="Add #tag"
            testID="profile-tags-add"
          >
            <Plus size={18} color={c.base} strokeWidth={2.75} />
          </TouchableOpacity>
        </View>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!full && suggestions.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          // Lets a suggestion be tapped while the keyboard is open (otherwise the first tap only closes it).
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.suggestions}
        >
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.suggestion}
              onPress={() => add(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Follow ${tag}`}
            >
              <Plus size={16} color={c.textSecondary} strokeWidth={2.5} />
              <Text style={styles.suggestionText}>{tag.startsWith('#') ? tag : `#${tag}`}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {onChangeCountMeIn ? (
        <View style={styles.countRow}>
          <Users size={16} color={countMeIn ? c.violet : c.textMuted} strokeWidth={2.25} />
          <View style={styles.visibilityCopy}>
            <Text style={styles.visibilityLabel}>Count me in nearby numbers</Text>
            <Text style={styles.hint}>
              Adds you to counts like “20+ people into #Hiking within 5 km”. No name, no dot on the map: just
              your home area, never your live location. Numbers under 10 are never shown.
            </Text>
          </View>
          <Switch
            value={countMeIn}
            onValueChange={onChangeCountMeIn}
            trackColor={{ false: c.borderStrong, true: c.accentTrack }}
            thumbColor={countMeIn ? c.accent : c.textMuted}
            accessibilityLabel="Count me in nearby interest numbers"
            testID="profile-count-me-in"
          />
        </View>
      ) : null}

      <View style={styles.footer}>
        <Bell size={13} color={c.textMuted} strokeWidth={2} />
        <Text style={styles.hint}>
          New Points and Boosts with these #tags show up in Activity
          {isPublic ? '' : ', even while they’re private'}.
        </Text>
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    tile: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 12,
    },
    visibilityRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    visibilityCopy: { flex: 1, gap: 1 },
    visibilityLabel: { color: c.text, fontSize: 14, fontWeight: '700' },
    hint: { flex: 1, color: c.textMuted, fontSize: 12, lineHeight: 17 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingLeft: 12,
      paddingRight: 10,
      paddingVertical: 7,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.accentBorder,
      backgroundColor: c.accentTint,
    },
    chipText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    chipCount: { color: c.textMuted, fontSize: 11, fontWeight: '800' },
    countRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 10,
    },
    empty: { color: c.textFaint, fontSize: 13 },
    inputRow: { flexDirection: 'row', gap: 8 },
    input: {
      flex: 1,
      backgroundColor: c.base,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 14,
    },
    addBtn: {
      width: 44,
      borderRadius: 12,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnOff: { opacity: 0.4 },
    error: { color: c.amber, fontSize: 12, fontWeight: '600', marginTop: -4 },
    suggestions: { gap: 10, paddingRight: 4, paddingVertical: 2 },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 42,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: c.borderStrong,
    },
    suggestionText: { color: c.textSecondary, fontSize: 15, fontWeight: '700' },
    footer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      borderTopWidth: 1,
      borderTopColor: c.border,
      paddingTop: 10,
    },
  });
