import React from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { LEGAL_DOCS, LEGAL_UPDATED, type LegalDocId } from '../../lib/legal';
import { CallSignMark } from '../brand/CallSignMark';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Full-screen reader for the Terms of Service, Privacy Policy or Community Guidelines, from
 * account creation and from Settings. Tabs along the top switch between the three.
 */
export const LegalDocModal: React.FC<{
  doc: LegalDocId | null;
  onChange: (doc: LegalDocId) => void;
  onClose: () => void;
}> = ({ doc, onChange, onClose }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const current = doc ? LEGAL_DOCS[doc] : null;
  return (
    <Modal visible={!!doc} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.page, { paddingTop: insets.top + 8 }]} testID={`legal-${doc ?? 'closed'}`}>
        <TouchableOpacity onPress={onClose} style={styles.back} accessibilityRole="button" accessibilityLabel="Close">
          <ChevronLeft size={20} color={c.text} strokeWidth={2.5} />
          <Text style={styles.backText}>BACK</Text>
        </TouchableOpacity>
        <View style={styles.tabs}>
          {(Object.keys(LEGAL_DOCS) as LegalDocId[]).map((id) => (
            <TouchableOpacity
              key={id}
              style={[styles.tab, id === doc && styles.tabOn]}
              onPress={() => onChange(id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: id === doc }}
            >
              <Text style={[styles.tabText, id === doc && styles.tabTextOn]} numberOfLines={1}>
                {id === 'terms' ? 'Terms' : id === 'privacy' ? 'Privacy' : 'Guidelines'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {current ? (
          <ScrollView key={current.id} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.title} accessibilityRole="header">
              {current.title}
            </Text>
            <Text style={styles.updated}>Updated {LEGAL_UPDATED}</Text>
            <Text style={styles.intro}>{current.intro}</Text>
            {current.sections.map((section, index) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {index + 1}. {section.title}
                </Text>
                {section.points.map((point) => (
                  <View key={point} style={styles.pointRow}>
                    <View style={styles.bullet} />
                    <Text style={styles.pointText}>{point}</Text>
                  </View>
                ))}
              </View>
            ))}
            <CallSignMark />
          </ScrollView>
        ) : null}
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: c.base },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6 },
    backText: { color: c.text, fontSize: 13, fontWeight: '800', letterSpacing: 1 },
    tabs: {
      flexDirection: 'row',
      marginHorizontal: 16,
      marginTop: 6,
      padding: 3,
      borderRadius: 12,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
    },
    tab: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
    tabOn: { backgroundColor: c.accentTint },
    tabText: { color: c.textMuted, fontSize: 13, fontWeight: '700' },
    tabTextOn: { color: c.accent },
    content: { paddingHorizontal: 20, paddingTop: 20 },
    title: { color: c.text, fontSize: 24, fontWeight: '800' },
    updated: { color: c.textFaint, fontSize: 12, marginTop: 4 },
    intro: { color: c.textSecondary, fontSize: 15, lineHeight: 22, marginTop: 14 },
    section: { marginTop: 22, gap: 8 },
    sectionTitle: { color: c.text, fontSize: 16, fontWeight: '800' },
    pointRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    bullet: { width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent, marginTop: 8 },
    pointText: { flex: 1, color: c.textBody, fontSize: 14, lineHeight: 21 },
  });
