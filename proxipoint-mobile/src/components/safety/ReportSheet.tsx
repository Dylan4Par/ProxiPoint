import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ban, Flag } from 'lucide-react-native';
import {
  blockUser,
  isBlocked,
  reportContent,
  reportReasonsFor,
  type ReportReason,
  type ReportTargetType,
} from '../../lib/moderation';
import { openPhotoPolicy } from '../../lib/photoPolicy';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import { KeyboardAwareScrollView } from '../common/KeyboardAwareScrollView';

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** What's being reported, e.g. the Point or recap title. */
  label: string;
  /** Who posted it, if known; enables "Also block". */
  ownerHandle?: string | null;
}

/**
 * Report a Point, recap, photo, channel post, comment or someone's profile: pick a reason, add an optional note, optionally block the
 * person too. The content is hidden for you straight away.
 */
export const ReportSheet: React.FC<{
  target: ReportTarget | null;
  onClose: () => void;
  /** Called after a report is sent (e.g. to close the screen showing the content). */
  onReported?: (target: ReportTarget, blocked: boolean) => void;
}> = ({ target, onClose, onReported }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setReason(null);
    setNote('');
    setAlsoBlock(false);
    setSent(false);
  }, [target?.id]);

  if (!target) return null;
  const canBlock = Boolean(target.ownerHandle) && !isBlocked(target.ownerHandle);

  const submit = () => {
    if (!reason) return;
    reportContent({
      targetType: target.type,
      targetId: target.id,
      ownerHandle: target.ownerHandle ?? null,
      reason,
      note: note.trim(),
    });
    if (alsoBlock && target.ownerHandle) blockUser(target.ownerHandle);
    setSent(true);
    onReported?.(target, alsoBlock);
  };

  const what =
    target.type === 'recap'
      ? 'recap'
      : target.type === 'photo'
        ? 'photo'
        : target.type === 'profile'
          ? 'profile'
          : target.type === 'post'
            ? 'post'
            : target.type === 'comment'
              ? 'comment'
              : 'Point';

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="report-sheet">
          <View style={styles.handle} />
          {sent ? (
            <View style={styles.done}>
              <Flag size={26} color={c.accent} strokeWidth={2.25} />
              <Text style={styles.title}>Thanks for reporting</Text>
              <Text style={styles.body}>
                {target.type === 'profile'
                  ? 'Our team will review this profile. They won’t know you reported them.'
                  : `This ${what} is hidden for you, and it will be reviewed against the photo rules.`}
                {alsoBlock && target.ownerHandle ? ` You’ve blocked ${target.ownerHandle}.` : ''}
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={onClose} accessibilityRole="button">
                <Text style={styles.primaryText}>DONE</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <KeyboardAwareScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
              <Text style={styles.title}>Report this {what}</Text>
              <Text style={styles.body} numberOfLines={1}>
                {target.label}
              </Text>
              <Text style={styles.label}>What’s wrong?</Text>
              {reportReasonsFor(target.type).map((option) => {
                const selected = reason === option.id;
                return (
                  <TouchableOpacity
                    key={option.id}
                    style={[styles.reason, selected && styles.reasonSelected]}
                    onPress={() => setReason(option.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={[styles.radio, selected && styles.radioOn]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <Text style={styles.reasonText}>{option.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TextInput
                value={note}
                onChangeText={(value) => setNote(value.slice(0, 300))}
                placeholder="Anything else we should know? (optional)"
                placeholderTextColor={c.textFaint}
                multiline
                textAlignVertical="top"
                style={styles.input}
              />
              {canBlock ? (
                <TouchableOpacity
                  style={styles.blockRow}
                  onPress={() => setAlsoBlock((on) => !on)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: alsoBlock }}
                >
                  <View style={[styles.check, alsoBlock && styles.checkOn]}>
                    {alsoBlock ? <Ban size={12} color={c.base} strokeWidth={3} /> : null}
                  </View>
                  <Text style={styles.blockText}>Also block {target.ownerHandle}</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.note}>
                Reports are private. See the{' '}
                <Text style={styles.link} onPress={openPhotoPolicy}>
                  photo rules
                </Text>
                .
              </Text>
              <View style={styles.buttons}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onClose} accessibilityRole="button">
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, styles.flex, !reason && styles.primaryDisabled]}
                  onPress={submit}
                  disabled={!reason}
                  accessibilityRole="button"
                  testID="report-submit"
                >
                  <Text style={styles.primaryText}>REPORT</Text>
                </TouchableOpacity>
              </View>
            </KeyboardAwareScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.75)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '88%',
    backgroundColor: c.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  handle: { width: 44, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: 12 },
  content: { gap: 8, paddingBottom: 8 },
  title: { color: c.text, fontSize: 18, fontWeight: '800' },
  body: { color: c.textMuted, fontSize: 13, lineHeight: 19 },
  label: { color: c.textMuted, fontSize: 12, fontWeight: '700', marginTop: 6 },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.base,
  },
  reasonSelected: { borderColor: c.accent },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: c.iconFaint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: c.accent },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  reasonText: { color: c.text, fontSize: 14 },
  input: {
    minHeight: 70,
    maxHeight: 120,
    backgroundColor: c.base,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 4,
  },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  check: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: c.iconFaint, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: c.red, borderColor: c.red },
  blockText: { color: c.text, fontSize: 14 },
  note: { color: c.textFaint, fontSize: 11 },
  link: { color: c.accent, fontWeight: '700', textDecorationLine: 'underline' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
  secondaryBtn: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: c.text, fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    minHeight: 46,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: c.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: c.white, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  done: { alignItems: 'center', gap: 10, paddingVertical: 12 },
});
