import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** The company behind ProxiPoint. */
export const COMPANY_NAME = 'Call Sign Solutions';
export const COMPANY_URL = 'https://callsignsolutions.com';

/**
 * A quiet "A Call Sign Solutions product" line for the bottom of the welcome, sign-in, sign-up and
 * onboarding screens: the brand connection shows up exactly when people set up their account,
 * without competing with the ProxiPoint logo. Tapping it opens the company site.
 *
 * Swap the text for the company's logo file here when there is one (keep it this small).
 */
export const CallSignMark: React.FC<{ linked?: boolean }> = ({ linked = true }) => {
  const styles = useThemedStyles(createStyles);
  const content = (
    <View style={styles.row}>
      <View style={styles.rule} />
      <Text style={styles.text}>
        A <Text style={styles.name}>{COMPANY_NAME.toUpperCase()}</Text> PRODUCT
      </Text>
      <View style={styles.rule} />
    </View>
  );
  if (!linked) return <View style={styles.wrap}>{content}</View>;
  return (
    <TouchableOpacity
      style={styles.wrap}
      onPress={() => void Linking.openURL(COMPANY_URL).catch(() => undefined)}
      accessibilityRole="link"
      accessibilityLabel={`A ${COMPANY_NAME} product. Opens ${COMPANY_URL.replace('https://', '')}`}
      hitSlop={8}
      testID="callsign-mark"
    >
      {content}
    </TouchableOpacity>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    wrap: { alignSelf: 'center', paddingVertical: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    rule: { width: 18, height: StyleSheet.hairlineWidth, backgroundColor: c.textFaint },
    text: { color: c.textFaint, fontSize: 10, fontWeight: '600', letterSpacing: 1.6 },
    name: { color: c.textMuted, fontWeight: '800' },
  });
