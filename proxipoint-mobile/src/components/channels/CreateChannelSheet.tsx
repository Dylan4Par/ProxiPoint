import React, { useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Eye, Globe, Lock, X, type LucideIcon } from 'lucide-react-native';
import { KeyboardAwareScrollView } from '../common/KeyboardAwareScrollView';
import { createChannel, useChannels } from '../../lib/channels';
import {
  CHANNEL_ACCESS,
  CHANNEL_DESCRIPTION_MAX,
  CHANNEL_NAME_MAX,
  CHANNEL_TAG_LIMIT,
  uniqueHandle,
  validateNewChannel,
  type ChannelAccess,
} from '../../lib/channelAccess';
import { parseBeaconTags } from '../../lib/beaconDraft';
import { formatTagInput } from '../../lib/tagInput';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

export const ACCESS_ICON: Record<ChannelAccess, LucideIcon> = { public: Globe, restricted: Eye, private: Lock };

/**
 * Create a channel: name, what it's about, #tags (Points with them show up in it) and who can
 * view and post. You become its moderator.
 */
export const CreateChannelSheet: React.FC<{
  visible: boolean;
  myHandle: string;
  onClose: () => void;
  /** The new channel's id (open its page). */
  onCreated: (id: string) => void;
}> = ({ visible, myHandle, onClose, onCreated }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const channels = useChannels();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagText, setTagText] = useState('');
  const [access, setAccess] = useState<ChannelAccess>('public');
  const [tried, setTried] = useState(false);

  const tags = parseBeaconTags(tagText);
  const errors = validateNewChannel({ name, description, tags, access }, channels);
  const handle = name.trim() ? uniqueHandle(name, channels.map((channel) => channel.handle)) : null;

  const reset = () => {
    setName('');
    setDescription('');
    setTagText('');
    setAccess('public');
    setTried(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const create = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    const channel = createChannel({ name, description, tags, access }, myHandle);
    reset();
    onCreated(channel.id);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top }]} testID="create-channel">
        <View style={styles.header}>
          <TouchableOpacity onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel">
            <X size={22} color={c.text} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={styles.title}>New channel</Text>
          <TouchableOpacity
            style={styles.createBtn}
            onPress={create}
            accessibilityRole="button"
            testID="create-channel-submit"
          >
            <Text style={styles.createText}>CREATE</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>NAME</Text>
          <TextInput
            style={[styles.input, tried && errors.name ? styles.inputError : null]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Front Range Vinyl Swap"
            placeholderTextColor={c.textFaint}
            maxLength={CHANNEL_NAME_MAX}
            autoFocus
            accessibilityLabel="Channel name"
            testID="create-channel-name"
          />
          {tried && errors.name ? (
            <Text style={styles.error}>{errors.name}</Text>
          ) : handle ? (
            <Text style={styles.hint}>{handle}</Text>
          ) : null}

          <Text style={[styles.label, styles.spaced]}>DESCRIPTION</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="What it's for, and who it's for"
            placeholderTextColor={c.textFaint}
            maxLength={CHANNEL_DESCRIPTION_MAX}
            multiline
            textAlignVertical="top"
            accessibilityLabel="Channel description"
            testID="create-channel-description"
          />
          <Text style={styles.hint}>
            {description.length} / {CHANNEL_DESCRIPTION_MAX}
          </Text>

          <Text style={[styles.label, styles.spaced]}>#TAGS</Text>
          <TextInput
            style={[styles.input, tried && errors.tags ? styles.inputError : null]}
            value={tagText}
            onChangeText={(raw) => setTagText(formatTagInput(raw, tagText))}
            placeholder="#Vinyl, #RecordStore"
            placeholderTextColor={c.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Channel #tags"
            testID="create-channel-tags"
          />
          <Text style={tried && errors.tags ? styles.error : styles.hint}>
            {tried && errors.tags
              ? errors.tags
              : `Points with these #tags show up in the channel. Up to ${CHANNEL_TAG_LIMIT}.`}
          </Text>

          <Text style={[styles.label, styles.spaced]}>WHO CAN VIEW AND POST</Text>
          <View style={styles.options} accessibilityRole="radiogroup">
            {CHANNEL_ACCESS.map((option) => {
              const active = access === option.id;
              const Icon = ACCESS_ICON[option.id];
              return (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, active && styles.optionActive]}
                  onPress={() => setAccess(option.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  testID={`create-channel-access-${option.id}`}
                >
                  <Icon size={18} color={active ? c.violet : c.textMuted} strokeWidth={2.25} />
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]}>{option.label}</Text>
                    <Text style={styles.optionSummary}>{option.summary}</Text>
                  </View>
                  <View style={[styles.radio, active && styles.radioActive]}>
                    {active ? <Check size={12} color={c.white} strokeWidth={3} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.hint}>
            You’ll moderate it: approve who can post{access === 'private' ? ' and view' : ''}, and change this later.
          </Text>
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.base },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: c.border,
    },
    title: { color: c.text, fontSize: 17, fontWeight: '800' },
    createBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18, backgroundColor: c.violet },
    createText: { color: c.white, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
    scroll: { flex: 1 },
    content: { padding: 16 },
    label: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
    spaced: { marginTop: 20 },
    input: {
      color: c.text,
      fontSize: 15,
      backgroundColor: c.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    inputError: { borderColor: c.amber },
    multiline: { minHeight: 84 },
    hint: { color: c.textFaint, fontSize: 12, marginTop: 6 },
    error: { color: c.amber, fontSize: 12, fontWeight: '700', marginTop: 6 },
    options: { gap: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    optionActive: { borderColor: c.violet, backgroundColor: c.violetTint },
    optionCopy: { flex: 1, gap: 2 },
    optionLabel: { color: c.text, fontSize: 15, fontWeight: '800' },
    optionLabelActive: { color: c.violetText },
    optionSummary: { color: c.textSecondary, fontSize: 12, lineHeight: 17 },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: { backgroundColor: c.violet, borderColor: c.violet },
  });
