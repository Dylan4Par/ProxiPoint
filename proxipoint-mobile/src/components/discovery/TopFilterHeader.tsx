import React, { useRef, useState } from 'react';
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
import { tourTarget } from '../tour/tourTargets';
import { CalendarDays, Check, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react-native';
import { DEFAULT_POINT_SORT, POINT_SORTS, setPointSort, usePointSort } from '../../lib/pointSort';
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
  /** Replaces the default top row (avatar, Nearby / RSVP'd, calendar). Explore Map uses its own. */
  topRow?: React.ReactNode;
}

export const TopFilterHeader: React.FC<TopFilterHeaderProps> = ({
  onOpenProfile,
  profileInitial,
  profilePhotoUri,
  liveOnly = false,
  onToggleLiveOnly,
  onOpenCalendar,
  showAvatar = true,
  topRow,
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

  // Chip row: arrows on whichever side has more chips hidden (tap to scroll that way).
  const chipScroll = useRef<ScrollView | null>(null);
  const [chipView, setChipView] = useState({ x: 0, width: 0, content: 0 });
  const moreLeft = chipView.x > 4;
  const moreRight = chipView.content - chipView.width - chipView.x > 4;
  const nudgeChips = (direction: 1 | -1) => {
    const max = Math.max(0, chipView.content - chipView.width);
    const x = Math.min(max, Math.max(0, chipView.x + direction * chipView.width * 0.7));
    chipScroll.current?.scrollTo({ x, animated: true });
  };

  // Explore Map's own top row has no Nearby / RSVP'd switch, so it always shows Nearby.
  React.useEffect(() => {
    if (topRow && activeTab !== 'Nearby') setActiveTab('Nearby');
  }, [topRow, activeTab, setActiveTab]);

  // Filter & sort sheet (sort order, Live now, and the hashtag chips).
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const sort = usePointSort();
  // Badge on the filter button: how many choices differ from the defaults.
  const activeCount = (sort !== DEFAULT_POINT_SORT ? 1 : 0) + (liveOnly ? 1 : 0);
  const [newTagInput, setNewTagInput] = useState('');

  const handleAddNewTag = () => {
    if (newTagInput.trim()) {
      addTag(newTagInput);
      setNewTagInput('');
    }
  };

  return (
    <View style={styles.headerContainer}>
      {/* Top row: a custom one (Explore Map), or avatar + Nearby / RSVP'd + calendar. */}
      {topRow ? (
        <View style={styles.topRow}>{topRow}</View>
      ) : (
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
      )}

      {/* Horizontal Tag Carousel with Trailing Inline ✎ Pill */}
      <View style={styles.chipArea} ref={tourTarget('map-filter-rail')} collapsable={false}>
      <ScrollView
        ref={chipScroll}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tagScrollContainer}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          setChipView((v) => (Math.abs(v.x - x) < 1 ? v : { ...v, x }));
        }}
        onLayout={(e) => {
          const width = e.nativeEvent.layout.width;
          setChipView((v) => (v.width === width ? v : { ...v, width }));
        }}
        onContentSizeChange={(content) => setChipView((v) => (v.content === content ? v : { ...v, content }))}
      >
        {/* Filter & sort, first in the row. The badge counts choices that aren't the defaults. */}
        <TouchableOpacity
          style={[styles.addTagPill, activeCount > 0 && styles.filterBtnActive]}
          activeOpacity={0.8}
          onPress={() => setTagModalOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={activeCount ? `Filter and sort, ${activeCount} on` : 'Filter and sort'}
          testID="filter-manage-tags"
        >
          <SlidersHorizontal size={16} color={activeCount ? c.onAccent : c.accent} strokeWidth={2.5} />
          {activeCount > 0 ? (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeCount}</Text>
            </View>
          ) : null}
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
      {moreLeft ? (
        <TouchableOpacity
          style={[styles.moreArrow, styles.moreArrowLeft]}
          onPress={() => nudgeChips(-1)}
          accessibilityRole="button"
          accessibilityLabel="Scroll filters back"
          testID="chips-more-left"
        >
          <ChevronLeft size={16} color={c.accent} strokeWidth={2.75} />
        </TouchableOpacity>
      ) : null}
      {moreRight ? (
        <TouchableOpacity
          style={[styles.moreArrow, styles.moreArrowRight]}
          onPress={() => nudgeChips(1)}
          accessibilityRole="button"
          accessibilityLabel="More filters"
          testID="chips-more-right"
        >
          <ChevronRight size={16} color={c.accent} strokeWidth={2.75} />
        </TouchableOpacity>
      ) : null}
      </View>

      {/* Filter & sort sheet */}
      <Modal
        visible={tagModalOpen}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setTagModalOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableWithoutFeedback onPress={() => setTagModalOpen(false)}>
            <View style={styles.sheetDismiss} />
          </TouchableWithoutFeedback>
          <View style={styles.sheet} testID="filter-sheet">
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter & sort</Text>
              <TouchableOpacity onPress={() => setTagModalOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
                <X size={20} color={c.textMuted} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetContent}>
              {/* Sort */}
              <Text style={styles.sectionSubtitle}>Sort by</Text>
              <View style={styles.sortList}>
                {POINT_SORTS.map((option) => {
                  const on = sort === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.sortRow, on && styles.sortRowOn]}
                      onPress={() => setPointSort(option.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      testID={`sort-${option.id}`}
                    >
                      <View style={styles.sortCopy}>
                        <Text style={[styles.sortLabel, on && styles.sortLabelOn]}>{option.label}</Text>
                        <Text style={styles.sortHint}>{option.hint}</Text>
                      </View>
                      {on ? <Check size={18} color={c.accent} strokeWidth={3} /> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.sortNote}>Boosted Points stay at the top, labeled.</Text>

              {/* Show */}
              {onToggleLiveOnly ? (
                <>
                  <Text style={styles.sectionSubtitle}>Show</Text>
                  <TouchableOpacity
                    style={[styles.sortRow, liveOnly && styles.sortRowOn]}
                    onPress={onToggleLiveOnly}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: liveOnly }}
                    testID="filter-sheet-live"
                  >
                    <View style={styles.sortCopy}>
                      <Text style={[styles.sortLabel, liveOnly && styles.sortLabelOn]}>Live now only</Text>
                      <Text style={styles.sortHint}>Points happening right now</Text>
                    </View>
                    {liveOnly ? <Check size={18} color={c.accent} strokeWidth={3} /> : null}
                  </TouchableOpacity>
                </>
              ) : null}

              {/* Hashtag chips */}
              <Text style={[styles.sectionSubtitle, styles.sectionGap]}>Your hashtags</Text>
              <View style={styles.addTagRow}>
                <TextInput
                  style={styles.addTagInput}
                  placeholder="Add a hashtag, e.g. Pickleball"
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
              <View style={styles.chipWrap}>
                {tags.map((tag) => (
                  <View key={tag} style={styles.editorChip}>
                    <Text style={styles.editorChipText}>{tag}</Text>
                    {tag !== 'All' && (
                      <TouchableOpacity
                        onPress={() => removeTag(tag)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${tag}`}
                      >
                        <Text style={styles.removeChipText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            </ScrollView>

            <View style={styles.sheetButtons}>
              <TouchableOpacity
                style={[styles.resetBtn, activeCount === 0 && styles.resetBtnOff]}
                disabled={activeCount === 0}
                onPress={() => {
                  setPointSort(DEFAULT_POINT_SORT);
                  if (liveOnly) onToggleLiveOnly?.();
                }}
                accessibilityRole="button"
              >
                <Text style={styles.resetText}>Reset</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, styles.doneBtn]} onPress={() => setTagModalOpen(false)} accessibilityRole="button">
                <Text style={styles.saveBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    gap: 8,
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
  chipArea: { position: 'relative' },
  /* Small round arrow over the chip row's edge, centered on the chips (below the 12pt top padding). */
  moreArrow: {
    position: 'absolute',
    top: 12,
    bottom: 0,
    width: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.headerGlass,
  },
  moreArrowLeft: { left: 0, borderTopRightRadius: 16, borderBottomRightRadius: 16 },
  moreArrowRight: { right: 0, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 },
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
  /* Round filter button at the start of the chip row (same height as the chips). */
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
  filterBtnActive: {
    backgroundColor: c.accent,
    borderColor: c.accent,
  },
  filterBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: c.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: { color: '#1c1917', fontSize: 10, fontWeight: '900' },
  /* Filter & sort sheet */
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.6)',
    justifyContent: 'flex-end',
  },
  sheetDismiss: { flex: 1 },
  sheet: {
    maxHeight: '85%',
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: c.borderStrong,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: c.borderStrong,
    alignSelf: 'center',
    marginBottom: 10,
  },
  sheetContent: { paddingBottom: 8 },
  sortList: { gap: 6 },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    marginBottom: 6,
  },
  sortRowOn: { borderColor: c.accent, backgroundColor: c.accentTint },
  sortCopy: { flex: 1, gap: 1 },
  sortLabel: { color: c.text, fontSize: 14, fontWeight: '700' },
  sortLabelOn: { color: c.accent },
  sortHint: { color: c.textMuted, fontSize: 12 },
  sortNote: { color: c.textFaint, fontSize: 11, marginBottom: 16 },
  sectionGap: { marginTop: 10 },
  sheetButtons: { flexDirection: 'row', gap: 10, marginTop: 8 },
  resetBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.borderStrong,
    alignItems: 'center',
    marginTop: 6,
  },
  resetBtnOff: { opacity: 0.4 },
  resetText: { color: c.text, fontSize: 14, fontWeight: '700' },
  doneBtn: { flex: 1 },
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
