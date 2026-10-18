import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
  Image,
} from 'react-native';
import { CalendarDays, Plus } from 'lucide-react-native';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

interface TopFilterHeaderProps {
  /** Tap on the avatar opens the Profile page. */
  onOpenProfile?: () => void;
  profileInitial?: string;
  profilePhotoUri?: string | null;
  /** "Live Now" filter: only Points happening right now. Works together with a hashtag. */
  liveOnly?: boolean;
  onToggleLiveOnly?: () => void;
  /** Calendar button next to Nearby / RSVP'd. */
  onOpenCalendar?: () => void;
  /** Avatar at the left of the top row. Off on Explore Map, where Profile is its own tab. */
  showAvatar?: boolean;
}

export const TopFilterHeader: React.FC<TopFilterHeaderProps> = ({
  onOpenProfile,
  profileInitial,
  profilePhotoUri,
  liveOnly = false,
  onToggleLiveOnly,
  onOpenCalendar,
  showAvatar = true,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const setActiveTab = useDiscoveryStore((s) => s.setActiveTab);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const setSelectedTag = useDiscoveryStore((s) => s.setSelectedTag);
  const tags = useDiscoveryStore((s) => s.tags);
  const addTag = useDiscoveryStore((s) => s.addTag);
  const removeTag = useDiscoveryStore((s) => s.removeTag);

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callsign, setCallsign] = useState('Ranger-F0A5ACCF');
  const [tenantId, setTenantId] = useState('00000000-0000-0000-0000-000000000001');
  const [serverUrl, setServerUrl] = useState('ws://10.0.2.2:8080/api/v1/ingest');

  // Tag Editor Modal State
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');

  const handleAddNewTag = () => {
    if (newTagInput.trim()) {
      addTag(newTagInput);
      setNewTagInput('');
    }
  };

  return (
    <View style={styles.headerContainer}>
      {/* Top Row: Avatar Pill + Segmented Switcher */}
      <View style={styles.topRow}>
        {showAvatar ? (
        <TouchableOpacity
          style={styles.avatarButton}
          // Tap: your Profile page. Long-press: the developer connection settings below.
          onPress={() => (onOpenProfile ? onOpenProfile() : setSettingsOpen(true))}
          onLongPress={() => setSettingsOpen(true)}
          delayLongPress={600}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open your profile"
          accessibilityHint="Long-press for connection settings"
          testID="header-profile"
        >
          <View style={styles.avatarInner}>
            {profilePhotoUri ? (
              <Image source={{ uri: profilePhotoUri }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarInitial}>{profileInitial || callsign.charAt(0).toUpperCase() || 'R'}</Text>
            )}
          </View>
          <View style={styles.onlineBadge} />
        </TouchableOpacity>
        ) : null}

        <View style={styles.segmentedWrapper}>
          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'Nearby' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('Nearby')}
          >
            <Text style={[styles.segmentText, activeTab === 'Nearby' && styles.segmentTextActive]}>
              Nearby
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.segmentBtn, activeTab === 'RSVPd' && styles.segmentBtnActive]}
            onPress={() => setActiveTab('RSVPd')}
          >
            <Text style={[styles.segmentText, activeTab === 'RSVPd' && styles.segmentTextActive]}>
              RSVP'd
            </Text>
          </TouchableOpacity>
        </View>

        {onOpenCalendar ? (
          <TouchableOpacity
            style={styles.calendarBtn}
            onPress={onOpenCalendar}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
            testID="header-calendar"
          >
            <CalendarDays size={20} color={c.sky} strokeWidth={2.25} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Horizontal Tag Carousel with Trailing Inline ✎ Pill */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tagScrollContainer}
      >
        {/* "+" first in the row: add or remove the hashtag chips. */}
        <TouchableOpacity
          style={styles.addTagPill}
          activeOpacity={0.8}
          onPress={() => setTagModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add or remove hashtags"
          testID="filter-manage-tags"
        >
          <Plus size={16} color={c.accent} strokeWidth={2.75} />
        </TouchableOpacity>
        {tags.map((tag) => {
          const isAll = tag === 'All';
          // "All" means no filters at all, so it isn't highlighted while Live Now is on.
          const isActive = selectedTag === tag && !(isAll && liveOnly);
          const pill = (
            <TouchableOpacity
              key={tag}
              style={[styles.tagPill, isActive && styles.tagPillActive]}
              onPress={() => {
                setSelectedTag(tag);
                if (isAll && liveOnly) onToggleLiveOnly?.();
              }}
            >
              <Text style={[styles.tagText, isActive && styles.tagTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          );
          if (!isAll || !onToggleLiveOnly) return pill;
          return (
            <React.Fragment key={tag}>
              {pill}
              <TouchableOpacity
                style={[styles.tagPill, styles.livePill, liveOnly && styles.livePillActive]}
                onPress={onToggleLiveOnly}
                accessibilityRole="button"
                accessibilityState={{ selected: liveOnly }}
                accessibilityLabel="Live now"
                testID="filter-live-now"
              >
                <View style={[styles.liveDot, liveOnly && styles.liveDotActive]} />
                <Text style={[styles.tagText, styles.liveText, liveOnly && styles.liveTextActive]}>Live Now</Text>
              </TouchableOpacity>
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* Tag Management Modal */}
      <Modal
        visible={tagModalOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setTagModalOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setTagModalOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Manage Keyword Hashtags</Text>
                  <TouchableOpacity onPress={() => setTagModalOpen(false)}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Add New Tag Input */}
                <View style={styles.addTagRow}>
                  <TextInput
                    style={styles.addTagInput}
                    placeholder="e.g. Pickleball, FarmersMarket"
                    placeholderTextColor={c.iconFaint}
                    value={newTagInput}
                    onChangeText={setNewTagInput}
                    onSubmitEditing={handleAddNewTag}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={styles.addTagBtn} onPress={handleAddNewTag}>
                    <Text style={styles.addTagBtnText}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {/* Active Tags */}
                <Text style={styles.sectionSubtitle}>Active Keywords (tap ✕ to remove)</Text>
                <View style={styles.chipWrap}>
                  {tags.map((tag) => (
                    <View key={tag} style={styles.editorChip}>
                      <Text style={styles.editorChipText}>{tag}</Text>
                      {tag !== 'All' && (
                        <TouchableOpacity
                          onPress={() => removeTag(tag)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.removeChipText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => setTagModalOpen(false)}
                >
                  <Text style={styles.saveBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* Settings Modal Sheet */}
      <Modal
        visible={settingsOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSettingsOpen(false)}
      >
        <TouchableWithoutFeedback onPress={() => setSettingsOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Connection Settings (dev)</Text>
                  <TouchableOpacity onPress={() => setSettingsOpen(false)}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Device Callsign / Handle</Text>
                  <TextInput
                    style={styles.textInput}
                    value={callsign}
                    onChangeText={setCallsign}
                    placeholder="e.g. Ranger-F0A5ACCF"
                    placeholderTextColor={c.iconFaint}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Tenant ID (UUID)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tenantId}
                    onChangeText={setTenantId}
                    autoCapitalize="none"
                    placeholderTextColor={c.iconFaint}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Ingest WebSocket URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    placeholderTextColor={c.iconFaint}
                  />
                </View>

                <View style={styles.statusBox}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusBoxText}>Engine: overwatchcore-ingest :8080</Text>
                </View>

                <TouchableOpacity
                  style={styles.saveBtn}
                  onPress={() => setSettingsOpen(false)}
                >
                  <Text style={styles.saveBtnText}>Save & Apply</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
  headerContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: c.headerGlass,
    zIndex: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
  },
  avatarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: c.border,
    borderWidth: 1.5,
    borderColor: c.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarInitial: {
    color: c.sky,
    fontSize: 16,
    fontWeight: '800',
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: c.greenDeep,
    borderWidth: 2,
    borderColor: c.mapBase,
  },
  calendarBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.border,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  segmentedWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: c.border,
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 20,
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(6, 182, 212, 0.15)',
    borderWidth: 1,
    borderColor: c.accentDeep,
  },
  segmentText: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: c.sky,
    fontWeight: '700',
  },
  tagScrollContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 8,
    alignItems: 'center',
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: c.border,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  tagPillActive: {
    backgroundColor: c.accentDeep,
    borderColor: c.accent,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderColor: 'rgba(52, 211, 153, 0.45)',
  },
  livePillActive: {
    backgroundColor: c.green,
    borderColor: c.greenBright,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: c.green,
  },
  liveDotActive: {
    backgroundColor: c.greenInk,
  },
  liveText: {
    color: c.greenBright,
  },
  liveTextActive: {
    color: c.greenInk,
    fontWeight: '800',
  },
  tagText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: c.surface,
    fontWeight: '700',
  },
  /* Round "+" at the start of the chip row (same height as the chips). */
  addTagPill: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: c.border,
    borderWidth: 1,
    borderColor: c.accentDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: c.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
    paddingBottom: 10,
  },
  modalTitle: {
    color: c.text,
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseText: {
    color: c.textMuted,
    fontSize: 18,
    fontWeight: '700',
    padding: 4,
  },
  addTagRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  addTagInput: {
    flex: 1,
    backgroundColor: c.border,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  addTagBtn: {
    backgroundColor: c.accentDeep,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  addTagBtnText: {
    color: c.surface,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: c.textFaint,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18,
  },
  editorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: c.borderStrong,
  },
  editorChipText: {
    color: c.textBody,
    fontSize: 12,
    fontWeight: '600',
  },
  removeChipText: {
    color: c.danger,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: c.textMuted,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: c.border,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: c.borderStrong,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.chipBlue,
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginVertical: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: c.greenDeep,
  },
  statusBoxText: {
    color: c.sky,
    fontSize: 11,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: c.accentDeep,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    color: c.surface,
    fontSize: 14,
    fontWeight: '700',
  },
});
