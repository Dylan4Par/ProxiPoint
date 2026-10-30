import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { openPhotoPolicy } from '../../lib/photoPolicy';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/** One-line reminder under every photo picker, with a link to the full rules. */
export const PhotoRulesNote: React.FC<{ style?: object }> = ({ style }) => {
  const styles = useThemedStyles(createStyles);
  return (
  <Text style={[styles.note, style]}>
    Only share photos you have the right to post.{' '}
    <Text style={styles.link} onPress={openPhotoPolicy} accessibilityRole="link">
      Photo rules
    </Text>
  </Text>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  note: { color: c.textFaint, fontSize: 11, lineHeight: 15 },
  link: { color: c.accent, fontWeight: '700', textDecorationLine: 'underline' },
});
