import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { Plus } from 'lucide-react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import {
  TAG_QUERY_MIN,
  displayForSlug,
  finishSlug,
  isUsableCustomSlug,
  localTagSuggestions,
  matchRange,
  normalizeTagInput,
  usageLabel,
  type TagSuggestionItem,
} from '../../lib/tagSlug';
import { TAGS_URL, fetchTagSuggestions } from '../../services/tagsApi';

/** How long typing has to pause before asking the server (the phone's own list answers at once). */
export const TAG_DEBOUNCE_MS = 175;

export interface PickedTag {
  slug: string;
  /** As shown: "#LiveMusic", or "#AcousticBrunch" for a new one. */
  tag: string;
  isCanonical: boolean;
}

export interface TagAutocompleteHandle {
  focus: () => void;
  clear: () => void;
}

/**
 * Hyphen-aware tag search: what's typed becomes slug form ("Live Music" -> live-music), the listed
 * tags answer instantly, and after a short pause the server's suggestions (with how often each
 * is used, and tags other people made) replace them. Matches start the tag or a hyphenated word
 * in it ("music" finds #live-music), and the matched part is highlighted. When the typed tag
 * isn't one of the suggestions, "➕ Use '#…'" adds it as a new tag (if allowCreate).
 */
export const TagAutocomplete = forwardRef<
  TagAutocompleteHandle,
  {
    onPick: (picked: PickedTag) => void;
    /** Slugs already picked (left out of the suggestions). */
    exclude?: readonly string[];
    placeholder?: string;
    /** Offer "Use '#…'" for a tag that isn't listed (it's made as a new, not-listed tag). */
    allowCreate?: boolean;
    /** Backspace on an empty field (e.g. to drop the last picked chip). */
    onBackspaceEmpty?: () => void;
    /** Tells the parent whether a query is being typed (so it can hide its own suggestions). */
    onQueryChange?: (query: string) => void;
    inputStyle?: StyleProp<ViewStyle>;
    testID?: string;
  }
>(({ onPick, exclude = [], placeholder = 'Find a tag', allowCreate = false, onBackspaceEmpty, onQueryChange, inputStyle, testID = 'tag-autocomplete' }, ref) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const input = useRef<TextInput>(null);
  const [text, setText] = useState('');
  const [remote, setRemote] = useState<{ q: string; items: TagSuggestionItem[] } | null>(null);
  const [loading, setLoading] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    clear: () => setText(''),
  }));

  const q = finishSlug(text);
  const excludeKey = exclude.join(',');
  // Instant answer from the listed tags while the server's is on its way.
  const local = useMemo(() => localTagSuggestions(q, exclude), [q, excludeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced server lookup; an older answer never replaces a newer query's.
  useEffect(() => {
    onQueryChange?.(q);
    if (!TAGS_URL || q.length < TAG_QUERY_MIN) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetchTagSuggestions(q, controller.signal)
        .then((items) => setRemote({ q, items }))
        .catch(() => undefined) // offline: the listed tags still answer
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, TAG_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const skip = new Set(exclude);
  const suggestions = remote && remote.q === q ? remote.items.filter((item) => !skip.has(item.slug)) : local;
  const exact = suggestions.some((item) => item.slug === q) || skip.has(q);
  const canCreate = allowCreate && !exact && isUsableCustomSlug(q);
  const open = q.length >= TAG_QUERY_MIN;

  const pick = (item: { slug: string; isCanonical: boolean }) => {
    onPick({ slug: item.slug, tag: displayForSlug(item.slug), isCanonical: item.isCanonical });
    setText('');
    setRemote(null);
  };
  // Return: the exact match, else the top suggestion, else the new tag (when allowed).
  const submit = () => {
    if (!open) return;
    const best = suggestions.find((item) => item.slug === q) ?? suggestions[0];
    if (best) pick(best);
    else if (canCreate) pick({ slug: q, isCanonical: false });
  };

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={[styles.inputRow, inputStyle]}>
        <Text style={styles.hash}>#</Text>
        <TextInput
          ref={input}
          value={text}
          onChangeText={(value) => setText(normalizeTagInput(value))}
          onSubmitEditing={submit}
          onKeyPress={(e) => {
            if (e.nativeEvent.key === 'Backspace' && text === '') onBackspaceEmpty?.();
          }}
          blurOnSubmit={false}
          returnKeyType="done"
          placeholder={placeholder}
          placeholderTextColor={c.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Find a tag"
          testID={`${testID}-input`}
        />
        {loading ? <ActivityIndicator size="small" color={c.textFaint} /> : null}
      </View>

      {open ? (
        <View style={styles.dropdown} testID={`${testID}-dropdown`}>
          {suggestions.map((item) => {
            const range = matchRange(item.slug, q);
            const uses = usageLabel(item.usageCount);
            return (
              <TouchableOpacity
                key={item.slug}
                style={styles.row}
                onPress={() => pick(item)}
                accessibilityRole="button"
                accessibilityLabel={`Add #${item.slug}${uses ? `, ${uses}` : ''}`}
                testID={`${testID}-option-${item.slug}`}
              >
                <Text style={styles.slug} numberOfLines={1}>
                  #
                  {range ? (
                    <>
                      {item.slug.slice(0, range[0])}
                      <Text style={styles.hit}>{item.slug.slice(range[0], range[1])}</Text>
                      {item.slug.slice(range[1])}
                    </>
                  ) : (
                    item.slug
                  )}
                </Text>
                {uses ? <Text style={styles.count}>{uses}</Text> : null}
              </TouchableOpacity>
            );
          })}
          {canCreate ? (
            <TouchableOpacity
              style={[styles.row, styles.createRow, suggestions.length === 0 && styles.createOnly]}
              onPress={() => pick({ slug: q, isCanonical: false })}
              accessibilityRole="button"
              accessibilityLabel={`Use #${q} as a new tag`}
              testID={`${testID}-create`}
            >
              <Plus size={14} color={c.accent} strokeWidth={2.75} />
              <Text style={styles.createText} numberOfLines={1}>
                Use '#{q}'
              </Text>
            </TouchableOpacity>
          ) : suggestions.length === 0 && !loading ? (
            <Text style={styles.none}>
              {allowCreate && q.length < 3 ? 'Keep typing: tags are at least 3 characters.' : `No tag matches “${q}”.`}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});
TagAutocomplete.displayName = 'TagAutocomplete';

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { flex: 1, minWidth: 140 },
    inputRow: { flexDirection: 'row', alignItems: 'center', height: 30, gap: 4 },
    hash: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
    input: { flex: 1, color: c.text, fontSize: 14, fontWeight: '600', padding: 0 },
    // A card under the field (in the flow, so it's never clipped by the form around it).
    dropdown: {
      marginTop: 6,
      paddingVertical: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
    slug: { flex: 1, color: c.textSecondary, fontSize: 14, fontWeight: '600' },
    hit: { color: c.accent, fontWeight: '900' },
    count: { color: c.textFaint, fontSize: 12, fontWeight: '700' },
    createRow: { borderTopWidth: 1, borderTopColor: c.border },
    createOnly: { borderTopWidth: 0 },
    createText: { flex: 1, color: c.accent, fontSize: 14, fontWeight: '800' },
    none: { color: c.textMuted, fontSize: 12, paddingHorizontal: 12, paddingVertical: 9 },
  });
