import React, { useEffect, useState } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft, ShieldCheck } from 'lucide-react-native';
import {
  acceptPhotoPolicy,
  closePhotoPolicy,
  declinePhotoPolicy,
  getPhotoPolicyState,
  openPhotoPolicy,
  PHOTO_POLICY_SECTIONS,
  PHOTO_POLICY_UPDATED,
  PHOTO_RULES_SUMMARY,
  subscribePhotoPolicy,
  SUPPORT_EMAIL,
} from '../../lib/photoPolicy';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Mount once near the top of the app (DiscoverScreen does). Shows the one-time photo
 * agreement when a picker asks for it, and the full Photo rules page from anywhere.
 */
export const PhotoPolicyHost: React.FC = () => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [policy, setPolicy] = useState(getPhotoPolicyState());

  useEffect(() => subscribePhotoPolicy(() => setPolicy(getPhotoPolicyState())), []);

  const acceptedOn = policy.acceptedAt
    ? new Date(policy.acceptedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <>
      {/* One-time agreement before the first photo upload */}
      <Modal visible={policy.agreementOpen} transparent animationType="fade" onRequestClose={declinePhotoPolicy}>
        <View style={styles.backdrop}>
          <View style={styles.card} testID="photo-policy-agreement">
            <View style={styles.iconCircle}>
              <ShieldCheck size={22} color={c.accent} strokeWidth={2.25} />
            </View>
            <Text style={styles.cardTitle}>Before you add photos</Text>
            <Text style={styles.cardBody}>Photos on ProxiPoint follow a few rules so events stay safe for everyone:</Text>
            <View style={styles.summary}>
              {PHOTO_RULES_SUMMARY.map((rule) => (
                <View key={rule} style={styles.summaryRow}>
                  <Check size={14} color={c.green} strokeWidth={3} />
                  <Text style={styles.summaryText}>{rule}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity onPress={openPhotoPolicy} accessibilityRole="link" testID="photo-policy-read-more">
              <Text style={styles.link}>Read the full photo rules</Text>
            </TouchableOpacity>
            <View style={styles.buttons}>
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={declinePhotoPolicy}
                accessibilityRole="button"
                testID="photo-policy-decline"
              >
                <Text style={styles.btnSecondaryText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnPrimary]}
                onPress={acceptPhotoPolicy}
                accessibilityRole="button"
                testID="photo-policy-accept"
              >
                <Text style={styles.btnPrimaryText}>I agree</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Full Photo rules page (rendered after the agreement so it opens on top of it) */}
      <Modal visible={policy.policyOpen} animationType="slide" onRequestClose={closePhotoPolicy}>
        <View style={[styles.page, { paddingTop: insets.top + 8 }]} testID="photo-policy-page">
          <TouchableOpacity onPress={closePhotoPolicy} style={styles.back} accessibilityRole="button">
            <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
            <Text style={styles.backText}>PHOTO RULES</Text>
          </TouchableOpacity>
          <ScrollView contentContainerStyle={[styles.pageContent, { paddingBottom: insets.bottom + 32 }]}>
            <Text style={styles.updated}>Updated {PHOTO_POLICY_UPDATED}</Text>
            {acceptedOn ? <Text style={styles.accepted}>You agreed to these rules on {acceptedOn}.</Text> : null}
            {PHOTO_POLICY_SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.points.map((point) => (
                  <View key={point} style={styles.pointRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.pointText}>{point}</Text>
                  </View>
                ))}
              </View>
            ))}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Questions</Text>
              <TouchableOpacity onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} accessibilityRole="link">
                <Text style={styles.link}>{SUPPORT_EMAIL}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  card: {
    alignSelf: 'stretch',
    backgroundColor: c.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: c.border,
    padding: 20,
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(34, 211, 238, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: c.text, fontSize: 18, fontWeight: '800' },
  cardBody: { color: c.textSecondary, fontSize: 13, lineHeight: 19 },
  summary: { gap: 8 },
  summaryRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  summaryText: { flex: 1, color: c.textBody, fontSize: 13, lineHeight: 18 },
  link: { color: c.accent, fontSize: 13, fontWeight: '800', textDecorationLine: 'underline' },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnSecondary: { borderWidth: 1, borderColor: c.borderStrong, backgroundColor: c.base },
  btnSecondaryText: { color: c.text, fontSize: 14, fontWeight: '700' },
  btnPrimary: { backgroundColor: c.accent },
  btnPrimaryText: { color: c.base, fontSize: 14, fontWeight: '900' },
  page: { flex: 1, backgroundColor: c.base, paddingHorizontal: 16 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, alignSelf: 'flex-start' },
  backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1.2 },
  pageContent: { paddingTop: 12, gap: 18 },
  updated: { color: c.textFaint, fontSize: 12 },
  accepted: { color: c.green, fontSize: 12, fontWeight: '600', marginTop: -10 },
  section: { gap: 8 },
  sectionTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
  pointRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: c.accent, marginTop: 7 },
  pointText: { flex: 1, color: c.textSecondary, fontSize: 14, lineHeight: 20 },
});
