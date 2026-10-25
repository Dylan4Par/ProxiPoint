import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Plus, X } from 'lucide-react-native';
import { DROP_TAG_LIMIT, addTag, cleanTagWord, collectKnownTags, removeTag, selectedTags } from '../../lib/tagInput';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

const MAX_SUGGESTIONS = 10;

/**
 * Tags as chips. Picked tags show as filled pills (tap × to remove); under them, your usual
 * tags are one tap away. "Add tag" types a new one (space, comma or return adds it; backspace
 * on an empty field removes the last chip). The value stays in "#A, #B" form for the form.
 */
export const TagPicker: React.FC<{
  value: string;
  onChange: (next: string) => void;
  /** Your usual tags, most relevant first (lib/tagInput myTagSuggestions). */
  mine: string[];
  /** Everything else nearby, for matches while typing. */
  known?: unknown[];
  limit?: number;
  testID?: string;
}> = ({ value, onChange, mine, known, limit = DROP_TAG_LIMIT, testID = 'drop-tags' }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const picked = selectedTags(value);
  const pickedKeys = new Set(picked.map((t) => t.toLowerCase()));
  const full = picked.length >= limit;

  const pool = useMemo(() => {
    const seen = new Set<string>();
    return [...mine, ...collectKnownTags(known)].filter((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [mine, known]);

  const fragment = cleanTagWord(draft).toLowerCase();
  const suggestions = full
    ? []
    : (fragment ? pool.filter((t) => t.toLowerCase().startsWith(fragment)) : mine)
        .filter((t) => !pickedKeys.has(t.toLowerCase()))
        .slice(0, MAX_SUGGESTIONS);

  const commit = (words: string[], current = value) => {
    let next = current;
    words.forEach((word) => {
      next = addTag(next, word, limit);
    });
    if (next !== value) onChange(next);
    return next;
  };

  const onChangeText = (text: string) => {
    if (/[\s,]/.test(text)) {
      const parts = text.split(/[\s,]+/);
      const rest = parts.pop() ?? '';
      commit(parts);
      setDraft(cleanTagWord(rest));
    } else {
      setDraft(text.replace(/^#+/, '').replace(/[^A-Za-z0-9_]/g, ''));
    }
  };

  const submitDraft = () => {
    if (draft) commit([draft]);
    setDraft('');
  };

  return (
    <View testID={testID}>
      <View style={styles.row}>
        <Text style={styles.label}>Tags</Text>
        <View style={styles.chips}>
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
                onBlur={submitDraft}
                onKeyPress={(e) => {
                  if (e.nativeEvent.key === 'Backspace' && draft === '' && picked.length > 0) {
                    onChange(removeTag(value, picked[picked.length - 1]));
                  }
                }}
                blurOnSubmit={false}
                returnKeyType="done"
                placeholder={picked.length ? 'Add tag' : 'Pick below or type a tag'}
                placeholderTextColor={c.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
                testID={`${testID}-input`}
              />
            </View>
          )}
        </View>
      </View>
      {suggestions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          contentContainerStyle={styles.suggestions}
          testID={`${testID}-suggestions`}
        >
          {suggestions.map((tag) => (
            <TouchableOpacity
              key={tag}
              style={styles.suggestion}
              onPress={() => {
                commit([tag]);
                setDraft('');
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add #${tag}`}
              testID={`${testID}-suggestion-${tag}`}
            >
              <Plus size={12} color={c.accentSoft} strokeWidth={2.75} />
              <Text style={styles.suggestionText}>#{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
    inputWrap: { flexDirection: 'row', alignItems: 'center', minWidth: 120, flexGrow: 1, height: 30 },
    hash: { color: c.textMuted, fontSize: 14, fontWeight: '700', marginRight: 2 },
    input: { flex: 1, color: c.text, fontSize: 14, fontWeight: '600', padding: 0 },
    fullNote: { color: c.textFaint, fontSize: 12 },
    suggestions: { gap: 8, paddingTop: 10, paddingLeft: 60 },
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
  });
