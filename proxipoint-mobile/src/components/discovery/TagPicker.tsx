import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { DROP_TAG_LIMIT, addCustomTag, addTag, collectKnownTags, removeTag, selectedTags } from '../../lib/tagInput';
import { canonicalTag } from '../../lib/hashtags';
import { slugForTag } from '../../lib/tagSlug';
import { TagAutocomplete, type PickedTag, type TagAutocompleteHandle } from '../common/TagAutocomplete';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const MAX_SUGGESTIONS = 8;

/** Shown before you type when you have no usual tags yet. */
const STARTER_TAGS = ['#LiveMusic', '#FoodTrucks', '#HappyHour', '#Hiking', '#BoardGames', '#ArtWalk', '#Yoga', '#Volunteer'];

/**
 * Tags as chips. "# Find a tag" comes first and picked tags trail to its right as filled pills
 * (tap × to remove). Before typing: your usual tags, one tap away. While typing: the hyphen-aware
 * autocomplete (components/common/TagAutocomplete: "music" finds #live-music, with usage counts),
 * and, with allowCustom, "Use '#…'" for a tag that isn't listed. Return adds the best match;
 * backspace on an empty field removes the last chip. The value stays in "#A, #B" form.
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
  /** Search box hint; "Find a tag" by default. */
  placeholder?: string;
  /** false: no starter / usual tags before typing (matches still show while you type). */
  suggestUpfront?: boolean;
  /** A white input box (forms whose other fields are boxes, e.g. New channel). */
  boxed?: boolean;
  /** Let people add a tag that isn't listed (Points); otherwise listed tags only. */
  allowCustom?: boolean;
  testID?: string;
}> = ({
  value,
  onChange,
  mine,
  known,
  limit = DROP_TAG_LIMIT,
  label = 'Tags',
  placeholder = 'Find a tag',
  suggestUpfront = true,
  boxed = false,
  allowCustom = false,
  testID = 'drop-tags',
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [query, setQuery] = useState('');
  const search = useRef<TagAutocompleteHandle>(null);

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

  // Before typing: your usual tags (the autocomplete takes over once you type).
  const suggestions =
    full || query || !suggestUpfront ? [] : usual.filter((t) => !pickedKeys.has(t.toLowerCase())).slice(0, MAX_SUGGESTIONS);

  const pick = (tag: string) => {
    const next = addTag(value, tag, limit);
    if (next !== value) onChange(next);
  };
  const pickFromSearch = (picked: PickedTag) => {
    const next = canonicalTag(picked.tag) ? addTag(value, picked.tag, limit) : allowCustom ? addCustomTag(value, picked.tag, limit) : value;
    if (next !== value) onChange(next);
  };

  return (
    <View testID={testID}>
      <View style={[styles.row, boxed && styles.rowBoxed]}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        <View style={styles.chips}>
          {full ? (
            <Text style={styles.fullNote}>{limit} tags max</Text>
          ) : (
            // Wide enough for the whole hint ("Find a tag (optional)" needs more than "Find a tag").
            <View style={[styles.searchWrap, { minWidth: Math.max(140, placeholder.length * 8 + 24) }]}>
              <TagAutocomplete
                ref={search}
                onPick={pickFromSearch}
                exclude={picked.map((tag) => slugForTag(tag))}
                placeholder={placeholder}
                allowCreate={allowCustom}
                onQueryChange={setQuery}
                onBackspaceEmpty={() => {
                  if (picked.length > 0) onChange(removeTag(value, picked[picked.length - 1]));
                }}
                testID={`${testID}-search`}
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
    // Same look as the form's other fields: white, rounded, with a border.
    rowBoxed: {
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 9,
      minHeight: 48,
      alignItems: 'center',
    },
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
    searchWrap: { flexGrow: 1, flexBasis: 140 },
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
    noIndent: { paddingLeft: 0 },
  });
