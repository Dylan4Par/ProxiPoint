import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  CircleQuestionMark,
  CreditCard,
  Minus,
  Pencil,
  Plus,
  Search,
  Shield,
  SlidersHorizontal,
  Waypoints,
  type LucideIcon,
} from 'lucide-react-native';
import type { AppearanceMode, AppearancePalette } from '../../lib/appearance';

type SettingsPage = 'menu' | 'profile' | 'friends' | 'edit' | 'faqs';
type SectionId = 'app' | 'privacy' | 'plans' | 'integrations';

type ProfileSettingsProps = {
  visible: boolean;
  onClose: () => void;
  callsign: string;
  onChangeCallsign: (value: string) => void;
  tenantId: string;
  onChangeTenantId: (value: string) => void;
  serverUrl: string;
  onChangeServerUrl: (value: string) => void;
  mode: AppearanceMode;
  onChangeMode: (mode: AppearanceMode) => void;
  colors: AppearancePalette;
};

const FAQS = [
  {
    question: 'How do I drop a beacon?',
    answer: 'Open Drop Point, verify an address or use your current position, choose up to three channels, and drop the beacon.',
  },
  {
    question: 'Who can see a private beacon?',
    answer: 'Only the people you invite. A public beacon appears on the map for nearby operators.',
  },
  {
    question: 'How do I switch day and night?',
    answer: 'Open Settings, then App settings, and choose Day or Night. The choice is kept for the next visit.',
  },
];

export const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  visible,
  onClose,
  callsign,
  onChangeCallsign,
  tenantId,
  onChangeTenantId,
  serverUrl,
  onChangeServerUrl,
  mode,
  onChangeMode,
  colors,
}) => {
  const styles = useMemo(() => createSettingsStyles(colors, mode), [colors, mode]);
  const [page, setPage] = useState<SettingsPage>('menu');
  const [openSection, setOpenSection] = useState<SectionId | null>(null);
  const [friendQuery, setFriendQuery] = useState('');
  const [friends, setFriends] = useState<string[]>([]);
  const initial = callsign.trim().charAt(0).toUpperCase() || 'R';

  useEffect(() => {
    if (!visible) return;
    setPage('menu');
    setOpenSection(null);
  }, [visible]);

  const goBack = () => {
    if (page === 'menu') onClose();
    else setPage('menu');
  };

  const addFriend = () => {
    const handle = friendQuery.trim().replace(/^@+/, '');
    if (handle.length < 2 || friends.includes(handle)) return;
    setFriends((current) => [...current, handle]);
    setFriendQuery('');
  };

  const toggleSection = (id: SectionId) => {
    setOpenSection((current) => (current === id ? null : id));
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={goBack}>
      <View style={styles.page} testID="profile-settings">
        <View style={styles.header}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Back"
            testID="settings-back"
            onPress={goBack}
            style={styles.backBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <ChevronLeft color={colors.text} size={22} strokeWidth={2.4} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>SETTINGS</Text>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {page === 'menu' ? (
            <MenuPage
              styles={styles}
              colors={colors}
              initial={initial}
              callsign={callsign}
              openSection={openSection}
              onToggle={toggleSection}
              onOpen={setPage}
              mode={mode}
              onChangeMode={onChangeMode}
              tenantId={tenantId}
              onChangeTenantId={onChangeTenantId}
              serverUrl={serverUrl}
              onChangeServerUrl={onChangeServerUrl}
            />
          ) : null}

          {page === 'profile' ? (
            <View style={styles.subpage}>
              <View style={styles.profileAvatarLg}>
                <Text style={styles.profileInitialLg}>{initial}</Text>
              </View>
              <Text style={styles.profileNameLg}>{callsign}</Text>
              <Text style={styles.onlineText}>Online</Text>
            </View>
          ) : null}

          {page === 'friends' ? (
            <View style={styles.subpage}>
              <Text style={styles.subTitle}>Add friends</Text>
              <View style={styles.friendRow}>
                <TextInput
                  testID="friend-handle-input"
                  value={friendQuery}
                  onChangeText={setFriendQuery}
                  onSubmitEditing={addFriend}
                  placeholder="ProxiPoint handle"
                  placeholderTextColor={colors.textDim}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.friendInput}
                />
                <TouchableOpacity accessibilityRole="button" style={styles.friendAdd} onPress={addFriend}>
                  <Text style={styles.friendAddText}>Add</Text>
                </TouchableOpacity>
              </View>
              {friends.map((friend) => (
                <Text key={friend} style={styles.friendName}>@{friend}</Text>
              ))}
            </View>
          ) : null}

          {page === 'edit' ? (
            <View style={styles.subpage}>
              <Text style={styles.subTitle}>Edit profile</Text>
              <Text style={styles.fieldLabel}>Callsign</Text>
              <TextInput
                testID="profile-callsign-input"
                value={callsign}
                onChangeText={onChangeCallsign}
                placeholder="Ranger-F0A5ACCF"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                style={styles.fieldInput}
              />
              <TouchableOpacity accessibilityRole="button" style={styles.doneBtn} onPress={() => setPage('menu')}>
                <Text style={styles.doneBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {page === 'faqs' ? (
            <View style={styles.subpage}>
              <Text style={styles.subTitle}>FAQs</Text>
              {FAQS.map((item) => (
                <View key={item.question} style={styles.faqItem}>
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  <Text style={styles.faqAnswer}>{item.answer}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
};

type MenuPageProps = {
  styles: ReturnType<typeof createSettingsStyles>;
  colors: AppearancePalette;
  initial: string;
  callsign: string;
  openSection: SectionId | null;
  onToggle: (id: SectionId) => void;
  onOpen: (page: SettingsPage) => void;
  mode: AppearanceMode;
  onChangeMode: (mode: AppearanceMode) => void;
  tenantId: string;
  onChangeTenantId: (value: string) => void;
  serverUrl: string;
  onChangeServerUrl: (value: string) => void;
};

const MenuPage: React.FC<MenuPageProps> = ({
  styles,
  colors,
  initial,
  callsign,
  openSection,
  onToggle,
  onOpen,
  mode,
  onChangeMode,
  tenantId,
  onChangeTenantId,
  serverUrl,
  onChangeServerUrl,
}) => (
  <View>
    <View style={styles.identityRow}>
      <View style={styles.profileAvatar}>
        <Text style={styles.profileInitial}>{initial}</Text>
      </View>
      <Text style={styles.profileName} numberOfLines={1}>{callsign}</Text>
      <TouchableOpacity
        accessibilityRole="button"
        testID="settings-view-profile"
        onPress={() => onOpen('profile')}
        style={styles.viewProfileBtn}
      >
        <Text style={styles.viewProfileText}>VIEW PROFILE</Text>
      </TouchableOpacity>
    </View>

    <SettingsRow
      styles={styles}
      icon={Search}
      color={colors.text}
      label="Add friends"
      trailing="chevron"
      testID="settings-add-friends"
      onPress={() => onOpen('friends')}
    />

    <SettingsRow
      styles={styles}
      icon={Pencil}
      color={colors.text}
      label="Edit profile"
      trailing="chevron"
      testID="settings-edit-profile"
      onPress={() => onOpen('edit')}
    />
    <SettingsRow
      styles={styles}
      icon={SlidersHorizontal}
      color={colors.text}
      label="App settings"
      trailing={openSection === 'app' ? 'minus' : 'plus'}
      testID="settings-app"
      onPress={() => onToggle('app')}
    />
    {openSection === 'app' ? (
      <View style={styles.expandBody}>
        <Text style={styles.fieldLabel}>Appearance</Text>
        <View style={styles.modeTrack}>
          <TouchableOpacity
            testID="appearance-day"
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'day' }}
            style={[styles.modeOption, mode === 'day' && styles.modeOptionSelected]}
            onPress={() => onChangeMode('day')}
          >
            <Text style={[styles.modeOptionText, mode === 'day' && styles.modeOptionTextSelected]}>Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="appearance-night"
            accessibilityRole="button"
            accessibilityState={{ selected: mode === 'night' }}
            style={[styles.modeOption, mode === 'night' && styles.modeOptionSelected]}
            onPress={() => onChangeMode('night')}
          >
            <Text style={[styles.modeOptionText, mode === 'night' && styles.modeOptionTextSelected]}>Night</Text>
          </TouchableOpacity>
        </View>
      </View>
    ) : null}

    <SettingsRow
      styles={styles}
      icon={Shield}
      color={colors.text}
      label="Privacy"
      trailing={openSection === 'privacy' ? 'minus' : 'plus'}
      testID="settings-privacy"
      onPress={() => onToggle('privacy')}
    />
    {openSection === 'privacy' ? (
      <View style={styles.expandBody}>
        <Text style={styles.expandText}>
          Private beacons are visible only to the people you invite. Public beacons appear on the map for nearby operators.
        </Text>
      </View>
    ) : null}

    <SettingsRow
      styles={styles}
      icon={CreditCard}
      color={colors.text}
      label="Plans & Purchases"
      trailing={openSection === 'plans' ? 'minus' : 'plus'}
      testID="settings-plans"
      onPress={() => onToggle('plans')}
    />
    {openSection === 'plans' ? (
      <View style={styles.expandBody}>
        <Text style={styles.expandText}>There are no paid plans. Discover, Drop Point, and invites are included.</Text>
      </View>
    ) : null}

    <SettingsRow
      styles={styles}
      icon={Waypoints}
      color={colors.text}
      label="Integrations"
      trailing={openSection === 'integrations' ? 'minus' : 'plus'}
      testID="settings-integrations"
      onPress={() => onToggle('integrations')}
    />
    {openSection === 'integrations' ? (
      <View style={styles.expandBody}>
        <Text style={styles.fieldLabel}>Tenant ID</Text>
        <TextInput
          value={tenantId}
          onChangeText={onChangeTenantId}
          autoCapitalize="none"
          placeholderTextColor={colors.textDim}
          style={styles.fieldInput}
        />
        <Text style={styles.fieldLabel}>Ingest WebSocket URL</Text>
        <TextInput
          value={serverUrl}
          onChangeText={onChangeServerUrl}
          autoCapitalize="none"
          placeholderTextColor={colors.textDim}
          style={styles.fieldInput}
        />
        <View style={styles.statusBox}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Engine: overwatchcore-ingest :8080</Text>
        </View>
      </View>
    ) : null}

    <SettingsRow
      styles={styles}
      icon={CircleQuestionMark}
      color={colors.text}
      label="FAQs"
      trailing="chevron"
      testID="settings-faqs"
      onPress={() => onOpen('faqs')}
    />
  </View>
);

const SettingsRow: React.FC<{
  styles: ReturnType<typeof createSettingsStyles>;
  icon: LucideIcon;
  color: string;
  label: string;
  trailing: 'chevron' | 'plus' | 'minus';
  testID: string;
  onPress: () => void;
}> = ({ styles, icon: Icon, color, label, trailing, testID, onPress }) => (
  <TouchableOpacity accessibilityRole="button" testID={testID} style={styles.row} onPress={onPress}>
    <Icon color={color} size={22} strokeWidth={2} />
    <Text style={styles.rowLabel}>{label}</Text>
    {trailing === 'chevron' ? <ChevronRight color={color} size={18} strokeWidth={2} /> : null}
    {trailing === 'plus' ? <Plus color={color} size={18} strokeWidth={2.2} /> : null}
    {trailing === 'minus' ? <Minus color={color} size={18} strokeWidth={2.2} /> : null}
  </TouchableOpacity>
);

function createSettingsStyles(c: AppearancePalette, mode: AppearanceMode) {
  const link = mode === 'day' ? '#16a34a' : '#4ade80';
  return StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: c.modal,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 18,
      paddingBottom: 14,
      paddingHorizontal: 16,
      gap: 6,
    },
    backBtn: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: {
      color: c.text,
      fontSize: 15,
      fontWeight: '800',
      letterSpacing: 0.6,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    identityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 22,
      gap: 14,
    },
    profileAvatar: {
      width: 58,
      height: 58,
      borderRadius: 29,
      backgroundColor: c.inset,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileInitial: {
      color: c.accentBright,
      fontSize: 22,
      fontWeight: '800',
    },
    profileName: {
      flex: 1,
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
    },
    viewProfileBtn: {
      borderBottomWidth: 2,
      borderBottomColor: link,
      paddingBottom: 1,
    },
    viewProfileText: {
      color: link,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      minHeight: 58,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    rowLabel: {
      flex: 1,
      color: c.text,
      fontSize: 17,
      fontWeight: '500',
    },
    expandBody: {
      paddingHorizontal: 56,
      paddingRight: 20,
      paddingBottom: 16,
      gap: 8,
    },
    expandText: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
    fieldLabel: {
      color: c.textMuted,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 6,
    },
    fieldInput: {
      backgroundColor: c.inset,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
      marginBottom: 12,
    },
    modeTrack: {
      flexDirection: 'row',
      backgroundColor: c.inset,
      borderRadius: 12,
      padding: 3,
      borderWidth: 1,
      borderColor: c.border,
      gap: 4,
    },
    modeOption: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 9,
    },
    modeOptionSelected: {
      backgroundColor: c.accent,
    },
    modeOptionText: {
      color: c.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    modeOptionTextSelected: {
      color: c.onAccent,
    },
    statusBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: c.statusBox,
      borderRadius: 8,
      padding: 10,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#10b981',
    },
    statusText: {
      color: c.accentBright,
      fontSize: 12,
      fontWeight: '700',
    },
    subpage: {
      paddingHorizontal: 20,
      paddingTop: 12,
    },
    subTitle: {
      color: c.text,
      fontSize: 22,
      fontWeight: '800',
      marginBottom: 16,
    },
    profileAvatarLg: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.inset,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    profileInitialLg: {
      color: c.accentBright,
      fontSize: 32,
      fontWeight: '800',
    },
    profileNameLg: {
      color: c.text,
      fontSize: 26,
      fontWeight: '800',
    },
    onlineText: {
      color: '#16a34a',
      fontSize: 14,
      fontWeight: '700',
      marginTop: 4,
    },
    friendRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    friendInput: {
      flex: 1,
      backgroundColor: c.inset,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      color: c.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 15,
    },
    friendAdd: {
      backgroundColor: c.accent,
      borderRadius: 10,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    friendAddText: {
      color: c.onAccent,
      fontSize: 14,
      fontWeight: '800',
    },
    friendName: {
      color: c.text,
      fontSize: 16,
      fontWeight: '600',
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    doneBtn: {
      backgroundColor: c.accent,
      borderRadius: 10,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    doneBtnText: {
      color: c.onAccent,
      fontSize: 15,
      fontWeight: '800',
    },
    faqItem: {
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    faqQuestion: {
      color: c.text,
      fontSize: 16,
      fontWeight: '700',
      marginBottom: 4,
    },
    faqAnswer: {
      color: c.textMuted,
      fontSize: 14,
      lineHeight: 20,
    },
  });
}
