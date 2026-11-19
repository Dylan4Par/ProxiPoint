import React, { forwardRef, memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BadgeCheck, XCircle } from 'lucide-react-native';
import { OFFENSIVE_MESSAGE, containsOffensive } from '../../lib/profanity';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Name field for a spot picked on the map. It keeps its own text so typing only re-renders this
 * small field, not the whole Create Drop sheet: the latest text goes into `latest` right away
 * (for the Drop Point checks), and to `onSettled` once typing pauses (for the tile's glow).
 */
export const SpotNameInput = memo(
  forwardRef<
    TextInput,
    {
      minLength: number;
      latest: React.MutableRefObject<string>;
      onSettled: (name: string) => void;
    }
  >(function SpotNameInput({ minLength, latest, onSettled }, ref) {
    const styles = useThemedStyles(createStyles);
    const { colors: c } = useTheme();
    const [text, setText] = useState(latest.current);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
      if (timer.current) clearTimeout(timer.current);
    }, []);

    const offensive = containsOffensive(text);
    const ok = text.trim().length >= minLength && !offensive;

    const change = (value: string) => {
      setText(value);
      latest.current = value;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => onSettled(value), 200);
    };

    return (
      <View>
        <View style={styles.row}>
          {text.trim() ? (
            ok ? (
              <BadgeCheck size={20} color={c.green} strokeWidth={2.25} testID="drop-spot-named" />
            ) : (
              <XCircle size={20} color={c.red} strokeWidth={2.25} testID="drop-spot-name-bad" />
            )
          ) : null}
          <TextInput
            ref={ref}
            value={text}
            onChangeText={change}
            onBlur={() => onSettled(latest.current)}
            maxLength={60}
            autoCorrect={false}
            autoComplete="off"
            importantForAutofill="no"
            style={styles.input}
            testID="drop-place"
          />
          {!text ? (
            <View style={styles.placeholder} pointerEvents="none">
              <Text style={styles.placeholderText} numberOfLines={1}>
                Name this spot
              </Text>
              <Text style={styles.hint} numberOfLines={1} testID="drop-spot-name-hint">
                ({minLength} character minimum)
              </Text>
            </View>
          ) : null}
        </View>
        {offensive ? (
          <Text style={styles.error} testID="drop-spot-name-error">
            {OFFENSIVE_MESSAGE}
          </Text>
        ) : null}
      </View>
    );
  }),
);

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: { flex: 1, color: c.text, fontSize: 17, fontWeight: '600', padding: 0 },
    placeholder: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
    placeholderText: { color: c.textFaint, fontSize: 17, fontWeight: '600' },
    hint: { color: c.accent, fontSize: 12, fontWeight: '600' },
    error: { marginTop: 6, color: c.red, fontSize: 12, fontWeight: '600' },
  });
