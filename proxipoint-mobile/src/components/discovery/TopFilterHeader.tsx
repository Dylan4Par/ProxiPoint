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
} from 'react-native';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';

export const TopFilterHeader: React.FC = () => {
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
        <TouchableOpacity
          style={styles.avatarButton}
          onPress={() => setSettingsOpen(true)}
          activeOpacity={0.8}
        >
          <View style={styles.avatarInner}>
            <Text style={styles.avatarInitial}>R</Text>
          </View>
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
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tagScrollContainer}
      >
        {tags.map((tag) => {
          const isActive = selectedTag === tag;
          return (
            <TouchableOpacity
              key={tag}
              style={[styles.tagPill, isActive && styles.tagPillActive]}
              onPress={() => setSelectedTag(tag)}
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
                    placeholderTextColor="#475569"
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
                  <Text style={styles.modalTitle}>Node & Profile Settings</Text>
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
                    placeholderTextColor="#475569"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Tenant ID (UUID)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={tenantId}
                    onChangeText={setTenantId}
                    autoCapitalize="none"
                    placeholderTextColor="#475569"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Ingest WebSocket URL</Text>
                  <TextInput
                    style={styles.textInput}
                    value={serverUrl}
                    onChangeText={setServerUrl}
                    autoCapitalize="none"
                    placeholderTextColor="#475569"
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

const styles = StyleSheet.create({
  headerContainer: {
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
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
    backgroundColor: '#1e293b',
    borderWidth: 1.5,
    borderColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#38bdf8',
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
    borderColor: '#0a1120',
  },
  segmentedWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#1e293b',
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
    borderColor: '#06b6d4',
  },
  segmentText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: '#38bdf8',
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
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
  },
  tagPillActive: {
    backgroundColor: '#06b6d4',
    borderColor: '#22d3ee',
  },
  tagText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  tagTextActive: {
    color: '#0f172a',
    fontWeight: '700',
  },
  trailingEditPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#06b6d4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trailingEditIcon: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 10,
  },
  modalTitle: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCloseText: {
    color: '#94a3b8',
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
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  },
  addTagBtn: {
    backgroundColor: '#06b6d4',
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 10,
  },
  addTagBtnText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#64748b',
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
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  editorChipText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
  },
  removeChipText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 2,
  },
  fieldGroup: {
    marginBottom: 14,
  },
  fieldLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  textInput: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f8fafc',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#172554',
    padding: 10,
    borderRadius: 8,
    gap: 8,
    marginVertical: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10b981',
  },
  statusBoxText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '600',
  },
  saveBtn: {
    backgroundColor: '#06b6d4',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 6,
  },
  saveBtnText: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
});
