import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layers, MapPin, X, type LucideIcon } from 'lucide-react-native';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * The + in the bottom bar: choose a Single Drop (Create Drop) or a Series (several events under
 * one name and announcement; Channels → Series).
 */
export const CreateChooserSheet: React.FC<{
  visible: boolean;
  onSingle: () => void;
  onSeries: () => void;
  onClose: () => void;
}> = ({ visible, onSingle, onSeries, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();

  const Option: React.FC<{ Icon: LucideIcon; title: string; body: string; onPress: () => void; testID: string }> = ({
    Icon,
    title,
    body,
    onPress,
    testID,
  }) => (
    <TouchableOpacity style={styles.option} onPress={onPress} accessibilityRole="button" accessibilityLabel={title} testID={testID}>
      <View style={styles.optionIcon}>
        <Icon size={22} color={c.accent} strokeWidth={2} />
      </View>
      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionBody}>{body}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]} testID="create-chooser">
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>CREATE</Text>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="create-chooser-close"
          >
            <X size={20} color={c.textMuted} strokeWidth={2.25} />
          </TouchableOpacity>
        </View>
        <Option
          Icon={MapPin}
          title="Single Drop"
          body="Create a one-time event or location marker."
          onPress={onSingle}
          testID="create-single"
        />
        <Option
          Icon={Layers}
          title="Series"
          body="Group multiple events, dates, or drops together."
          onPress={onSeries}
          testID="create-series"
        />
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.55)' },
    sheet: {
      backgroundColor: c.sheet,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 8,
      paddingHorizontal: 18,
      gap: 12,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong },
    header: { alignItems: 'center', justifyContent: 'center', paddingVertical: 10, marginBottom: 4 },
    title: { color: c.text, fontSize: 15, fontWeight: '800', letterSpacing: 1.2 },
    close: { position: 'absolute', right: 0, top: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    optionIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.accentTint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionCopy: { flex: 1, gap: 3 },
    optionTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    optionBody: { color: c.textMuted, fontSize: 13, lineHeight: 18 },
  });
