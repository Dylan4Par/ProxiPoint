import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react-native';
import { KeyboardAwareScrollView } from '../common/KeyboardAwareScrollView';
import { CallSignMark } from '../brand/CallSignMark';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Shared pieces for the welcome, sign-in, sign-up and onboarding screens: the page frame (with the
 * Call Sign Solutions line pinned to the bottom), text fields, buttons and inline errors.
 */

export const AuthPage: React.FC<{
  children: React.ReactNode;
  onBack?: () => void;
  /** Shown above the brand line, e.g. the onboarding Continue buttons. */
  footer?: React.ReactNode;
  /** Shown at the top (e.g. onboarding progress), next to the back button. */
  header?: React.ReactNode;
  testID?: string;
}> = ({ children, onBack, footer, header, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.page, { paddingTop: insets.top + 8 }]} testID={testID}>
      {onBack || header ? (
        <View style={styles.topRow}>
          {onBack ? (
            <TouchableOpacity onPress={onBack} style={styles.back} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
              <ChevronLeft size={22} color={c.text} strokeWidth={2.5} />
            </TouchableOpacity>
          ) : (
            <View style={styles.back} />
          )}
          <View style={styles.topCenter}>{header}</View>
          <View style={styles.back} />
        </View>
      ) : null}
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.body}>{children}</View>
      </KeyboardAwareScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {footer}
        <CallSignMark />
      </View>
    </View>
  );
};

export const AuthTitle: React.FC<{ title: string; subtitle?: string }> = ({ title, subtitle }) => {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.titleWrap}>
      <Text style={styles.title} accessibilityRole="header">
        {title}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
};

type AuthFieldProps = TextInputProps & {
  label: string;
  error?: string | null;
  hint?: React.ReactNode;
  prefix?: string;
  secret?: boolean;
};

export const AuthField = React.forwardRef<TextInput, AuthFieldProps>(({ label, error, hint, prefix, secret, style, ...input }, ref) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const [hidden, setHidden] = useState(true);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label.toUpperCase()}</Text>
      <View style={[styles.inputRow, focused && styles.inputFocused, !!error && styles.inputError]}>
        {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={c.textFaint}
          style={[styles.input, style]}
          secureTextEntry={secret ? hidden : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
        />
        {secret ? (
          <TouchableOpacity
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            {hidden ? <Eye size={18} color={c.textMuted} /> : <EyeOff size={18} color={c.textMuted} />}
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <View>{hint}</View> : null}
    </View>
  );
});
AuthField.displayName = 'AuthField';

export const AuthButton: React.FC<{
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'text';
  disabled?: boolean;
  busy?: boolean;
  testID?: string;
}> = ({ label, onPress, kind = 'primary', disabled, busy, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const off = disabled || busy;
  return (
    <TouchableOpacity
      style={[
        kind === 'primary' ? styles.primary : kind === 'secondary' ? styles.secondary : styles.textBtn,
        off && kind !== 'text' && styles.btnOff,
      ]}
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      testID={testID}
    >
      {busy ? (
        <ActivityIndicator color={kind === 'primary' ? c.onAccent : c.accent} />
      ) : (
        <Text style={kind === 'primary' ? styles.primaryText : kind === 'secondary' ? styles.secondaryText : styles.textBtnText}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};

export const AuthError: React.FC<{ message: string | null }> = ({ message }) => {
  const styles = useThemedStyles(createStyles);
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite">
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
};

export const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.base },
    topRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, minHeight: 40 },
    back: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    topCenter: { flex: 1, alignItems: 'center' },
    scroll: { flex: 1 },
    scrollContent: { flexGrow: 1 },
    body: { flex: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 16 },
    bottom: { paddingHorizontal: 24, gap: 6 },
    titleWrap: { marginBottom: 24, gap: 6 },
    title: { color: c.text, fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
    subtitle: { color: c.textMuted, fontSize: 15, lineHeight: 21 },
    field: { marginBottom: 16 },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
    },
    inputFocused: { borderColor: c.accent },
    inputError: { borderColor: c.red },
    prefix: { color: c.textMuted, fontSize: 16, fontWeight: '700' },
    input: { flex: 1, color: c.text, fontSize: 16, paddingVertical: 13 },
    fieldError: { color: c.red, fontSize: 12, marginTop: 6 },
    primary: {
      height: 52,
      borderRadius: 26,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: c.onAccent, fontSize: 16, fontWeight: '800' },
    secondary: {
      height: 52,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: c.text, fontSize: 16, fontWeight: '700' },
    textBtn: { paddingVertical: 10, alignItems: 'center' },
    textBtnText: { color: c.accent, fontSize: 14, fontWeight: '700' },
    btnOff: { opacity: 0.45 },
    errorBox: {
      backgroundColor: c.surface,
      borderLeftWidth: 3,
      borderLeftColor: c.red,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    errorText: { color: c.textBody, fontSize: 14, lineHeight: 19 },
  });
