import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { DROP_TAG_LIMIT, addTag, collectKnownTags, removeTag, selectedTags } from '../../lib/tagInput';
import { HASHTAG_LIST, bestHashtagFor, canonicalTag, searchHashtags } from '../../lib/hashtags';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const MAX_SUGGESTIONS = 8;

/** Shown before you type when you have no usual tags yet. */
const STARTER_TAGS = ['#LiveMusic', '#FoodTrucks', '#HappyHour', '#Hiking', '#BoardGames', '#ArtWalk', '#Yoga', '#Volunteer'];

/**
 * Tags as chips, picked from the allowed list (lib/hashtags): nobody can make up their own.
 * "# Find a tag" comes first and picked tags trail to its right as filled pills (tap × to remove).
 * Under them: your usual tags (one tap away), or, while typing, the listed tags that match
 * ("beer" → #CraftBeer, #HappyHour…). Return adds the best match; backspace on an empty field
 * removes the last chip. The value stays in "#A, #B" form for the form.
 */
export const TagPicker: React.FC<{
  value: string;
  onChange: (next: string) => void;
  /** Your usual tags, most relevant first (lib/tagInput myTagSuggestions). */
  mine: string[];
  /** Everything else nearby, for matches while typing. */
  known?: unknown[];
  limit?: number;
  /** Left-hand label ("Tags"); null when the screen has its own label above. */
  label?: string | null;
  testID?: string;
}> = ({ value, onChange, mine, known, limit = DROP_TAG_LIMIT, label = 'Tags', testID = 'drop-tags' }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const picked = selectedTags(value);
  const pickedKeys = new Set(picked.map((t) => t.toLowerCase()));
  const full = picked.length >= limit;

  // Before typing: your usual tags, then tags on Points nearby (all on the list), then starters.
  const usual = useMemo(() => {
    const seen = new Set<string>();
    return [...mine, ...collectKnownTags(known), ...STARTER_TAGS]
      .map((tag) => canonicalTag(tag))
      .filter((tag): tag is string => {
        if (!tag || seen.has(tag)) return false;
        seen.add(tag);
        return true;
      })
      .map((tag) => tag.slice(1));
  }, [mine, known]);

  const query = draft.trim();
  const matches = full || !query ? [] : searchHashtags(query, { exclude: picked, limit: MAX_SUGGESTIONS });
  const suggestions = full
    ? []
    : query
      ? matches.map((entry) => entry.tag.slice(1))
      : usual.filter((t) => !pickedKeys.has(t.toLowerCase())).slice(0, MAX_SUGGESTIONS);
  const noMatch = !full && Boolean(query) && matches.length === 0;

  const pick = (tag: string) => {
    const next = addTag(value, tag, limit);
    if (next !== value) onChange(next);
    setDraft('');
  };

  // Typing only searches the list (spaces are fine: "craft beer" finds #CraftBeer).
  const onChangeText = (text: string) => setDraft(text.replace(/^#+/, '').replace(/[^A-Za-z0-9_ ]/g, ''));

  // Return: the exact tag if it's on the list, otherwise the top match. Nothing new is ever made.
  const submitDraft = () => {
    if (!query) return;
    const best = bestHashtagFor(query, picked);
    if (best) pick(best);
  };

  return (
    <View testID={testID}>
      <View style={styles.row}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.chips}>
          {full ? (
            <Text style={styles.fullNote}>{limit} tags max</Text>
          ) : (
            <View style={styles.inputWrap}>
              <Text style={styles.hash}>#</Text>
              <TextInput
                ref={inputRef}
                value={draft}
                onChangeText={onChangeText}
                onSubmitEditing={submitDraft}
                onKeyPress={(e) => {
                  if (e.nativeEvent.key === 'Backspace' && draft === '' && picked.length > 0) {
                    onChange(removeTag(value, picked[picked.length - 1]));
                  }
                }}
                blurOnSubmit={false}
                returnKeyType="done"
                placeholder="Find a tag"
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                testID={`${testID}-input`}
              />
            </View>
          )}
          {picked.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.chip}
              onPress={() => onChange(removeTag(value, tag))}
              accessibilityRole="button"
              accessibilityLabel={`Remove #${tag}`}
              testID={`${testID}-chip-${tag}`}
            >
              <Text style={styles.chipText}>#{tag}</Text>
              <X size={14} color={c.accent} strokeWidth={2.5} />
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {noMatch ? (
        <Text style={[styles.noMatch, !label && styles.noIndent]} testID={`${testID}-no-match`}>
          No tag matches “{query}”. Try another word ({HASHTAG_LIST.length} tags to pick from).
        </Text>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={[styles.suggestions, !label && styles.noIndent]} testID={`${testID}-suggestions`}>
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.suggestion}
              onPress={() => pick(tag)}
              accessibilityRole="button"
              accessibilityLabel={`Add #${tag}`}
              testID={`${testID}-suggestion-${tag}`}
            >
              <Plus size={12} color={c.accentSoft} strokeWidth={2.75} />
              <Text style={styles.suggestionText}>#{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 4 },
    label: { width: 60, color: c.textMuted, fontSize: 12, fontWeight: '600', lineHeight: 30 },
    chips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      height: 30,
      paddingLeft: 12,
      paddingRight: 9,
      borderRadius: 15,
      backgroundColor: c.accentTint,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    chipText: { color: c.accent, fontSize: 13, fontWeight: '800' },
    inputWrap: { flexDirection: 'row', alignItems: 'center', width: 110, height: 30 },
    hash: { color: c.textMuted, fontSize: 14, fontWeight: '700', marginRight: 2 },
    input: { flex: 1, color: c.text, fontSize: 14, fontWeight: '600', padding: 0 },
    fullNote: { color: c.textFaint, fontSize: 12 },
    // Wraps instead of scrolling sideways, so every suggestion stays in view.
    suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 10, paddingLeft: 60 },
    suggestion: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.base,
    },
    suggestionText: { color: c.accentSoft, fontSize: 12, fontWeight: '700' },
    noMatch: { color: c.textFaint, fontSize: 12, paddingTop: 8, paddingLeft: 60 },
    noIndent: { paddingLeft: 0 },
  });
