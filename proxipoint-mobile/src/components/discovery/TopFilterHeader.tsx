import React, { useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  TextInput,
  TouchableWithoutFeedback,
} from 'react-native';
import type { AppearancePalette } from '../../lib/appearance';
import { useAppearanceStore } from '../../stores/useAppearanceStore';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useOperatorAvatar } from '../../stores/useProfileAvatarStore';
import { OperatorAvatar } from './OperatorAvatar';
import { ProfileSettings } from './ProfileSettings';

export const TopFilterHeader: React.FC = () => {
  const activeTab = useDiscoveryStore((s) => s.activeTab);
  const setActiveTab = useDiscoveryStore((s) => s.setActiveTab);
  const selectedTag = useDiscoveryStore((s) => s.selectedTag);
  const setSelectedTag = useDiscoveryStore((s) => s.setSelectedTag);
  const tags = useDiscoveryStore((s) => s.tags);
  const addTag = useDiscoveryStore((s) => s.addTag);
  const removeTag = useDiscoveryStore((s) => s.removeTag);
  const mode = useAppearanceStore((s) => s.mode);
  const setMode = useAppearanceStore((s) => s.setMode);
  const colors = useAppearanceStore((s) => s.colors);
  const styles = useMemo(() => createHeaderStyles(colors), [colors]);

  // Settings Modal State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [callsign, setCallsign] = useState('Ranger-F0A5ACCF');
  const [tenantId, setTenantId] = useState('00000000-0000-0000-0000-000000000001');
  const [serverUrl, setServerUrl] = useState('ws://10.0.2.2:8080/api/v1/ingest');

  // Tag Editor Modal State
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState('');
  const channelScrollRef = useRef<ScrollView>(null);
  const channelScrollX = useRef(0);
  const suppressChannelPress = useRef(false);

  const beginChannelPan = (event: { nativeEvent?: { pageX?: number } }) => {
    const startX = event.nativeEvent?.pageX ?? 0;
    const origin = channelScrollX.current;
    let moved = false;
    const onMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.pageX - startX;
      if (Math.abs(dx) > 4) moved = true;
      if (!moved) return;
      channelScrollRef.current?.scrollTo({ x: Math.max(0, origin - dx), animated: false });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (moved) {
        suppressChannelPress.current = true;
        window.setTimeout(() => {
          suppressChannelPress.current = false;
        }, 0);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const selectChannel = (tag: string) => {
    if (suppressChannelPress.current) return;
    setSelectedTag(tag);
  };

  const profileInitial = callsign.trim().charAt(0).toUpperCase() || 'R';
  const avatarUri = useOperatorAvatar(callsign);

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
        <TouchableOpacity
          testID="profile-button"
          style={styles.avatarButton}
          onPress={() => setSettingsOpen(true)}
          activeOpacity={0.8}
        >
          <OperatorAvatar
            uri={avatarUri}
            initial={profileInitial}
            size={36}
            backgroundColor={colors.inset}
            color={colors.accentBright}
            fontSize={16}
            style={styles.avatarInner}
          />
          <View style={styles.onlineBadge} />
        </TouchableOpacity>

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
      </View>

      {/* Horizontal Tag Carousel with Trailing Inline ✎ Pill */}
      <ScrollView
        horizontal
        ref={channelScrollRef}
        testID="channel-scroller"
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={(scrollEvent) => {
          channelScrollX.current = scrollEvent.nativeEvent.contentOffset.x;
        }}
        onMouseDown={beginChannelPan}
        contentContainerStyle={styles.tagScrollContainer}
        style={[styles.tagScroll, dragStyles.tagScroll]}
      >
        {tags.map((tag) => {
          const isActive = selectedTag === tag;
          return (
            <TouchableOpacity
              key={tag}
              style={[styles.tagPill, isActive && styles.tagPillActive]}
              onPress={() => selectChannel(tag)}
            >
              <Text style={[styles.tagText, isActive && styles.tagTextActive]}>
                {tag}
              </Text>
            </TouchableOpacity>
          );
        })}

        {/* Trailing ✎ Pill inside the scroll list */}
        <TouchableOpacity
          style={styles.trailingEditPill}
          activeOpacity={0.8}
          onPress={() => setTagModalOpen(true)}
        >
          <Text style={styles.trailingEditIcon}>✎</Text>
        </TouchableOpacity>
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
                    placeholderTextColor={colors.textDim}
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

      <ProfileSettings
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        callsign={callsign}
        onChangeCallsign={setCallsign}
        tenantId={tenantId}
        onChangeTenantId={setTenantId}
        serverUrl={serverUrl}
        onChangeServerUrl={setServerUrl}
        mode={mode}
        onChangeMode={setMode}
        colors={colors}
      />
    </View>
  );
};

const dragStyles = StyleSheet.create({
  tagScroll: {
    flexGrow: 0,
    cursor: 'grab',
    userSelect: 'none',
  },
});

function createHeaderStyles(c: AppearancePalette) {
  return StyleSheet.create({
  headerContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: c.header,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
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
    backgroundColor: c.surface,
    borderWidth: 1.5,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: c.inset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: c.accentBright,
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
    backgroundColor: '#10b981',
    borderWidth: 2,
    borderColor: c.onlineBorder,
  },
  segmentedWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: c.surface,
    borderRadius: 24,
    padding: 3,
    borderWidth: 1,
    borderColor: c.segmentBorder,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 20,
  },
  segmentBtnActive: {
    backgroundColor: c.accentSoft,
    borderWidth: 1,
    borderColor: c.accent,
  },
  segmentText: {
    color: c.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: c.accentBright,
    fontWeight: '700',
  },
  tagScroll: {
    flexGrow: 0,
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
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
  },
  tagPillActive: {
    backgroundColor: c.accent,
    borderColor: c.region,
  },
  tagText: {
    color: c.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: c.onAccent,
    fontWeight: '700',
  },
  trailingEditPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingEditIcon: {
    color: c.accentBright,
    fontSize: 13,
    fontWeight: '700',
  },
  /* Modals */
  modalBackdrop: {
    flex: 1,
    backgroundColor: c.modalBackdrop,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    backgroundColor: c.modal,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: c.border,
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
    backgroundColor: c.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.border,
    color: c.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  addTagBtn: {
    backgroundColor: c.accent,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  addTagBtnText: {
    color: c.onAccent,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: c.textDim,
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
    backgroundColor: c.surface,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: c.border,
  },
  editorChipText: {
    color: c.text,
    fontSize: 12,
    fontWeight: '600',
  },
  removeChipText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  saveBtn: {
    backgroundColor: c.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    color: c.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
});
}
