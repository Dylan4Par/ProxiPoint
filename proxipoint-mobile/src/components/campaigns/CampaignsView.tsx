import React, { useEffect, useState } from 'react';
import { Alert, Modal, Platform, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Pencil, Plus, Radio, Send, Share2, Trash2, X } from 'lucide-react-native';
import { CampaignBuilder, type CampaignBuilderProps } from './CampaignBuilder';
import { useCampaigns } from '../../hooks/useCampaigns';
import {
  audienceSummary,
  campaignDateRange,
  campaignEvents,
  campaignPhase,
  campaignShareMessage,
  deleteCampaign,
  phaseLabel,
  saveCampaign,
  validateCampaign,
  type Campaign,
  type CampaignPhase,
} from '../../lib/campaigns';
import { cleanVenueLabel, formatPointWhen, pointStatus, shareUrl, type DroppedPoint } from '../../lib/droppedPoint';
import { useBoosts } from '../../lib/boost';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';

/**
 * Channels → Series: your grouped events. Each campaign has its Points, one announcement
 * (now or scheduled) and who it notifies. Tap one for its events and actions.
 */
export const CampaignsView: React.FC<{
  drops: DroppedPoint[];
  onCreatePoints: CampaignBuilderProps['onCreatePoints'];
  onAnnounce: CampaignBuilderProps['onAnnounce'];
  /** Opens one of your Points (Manage sheet). */
  onOpenPoint: (id: string) => void;
  /** Open a new series right away (the bottom bar's + → Series). Cleared with onNewHandled. */
  newRequest?: number | null;
  onNewHandled?: () => void;
}> = ({ drops, onCreatePoints, onAnnounce, onOpenPoint, newRequest = null, onNewHandled }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const campaigns = useCampaigns();
  const now = new Date(useBoosts()); // ticks every 30s: phases follow the clock
  const [builder, setBuilder] = useState<{ campaign: Campaign | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = campaigns.find((cm) => cm.id === openId) ?? null;
  useEffect(() => {
    if (!newRequest) return;
    setOpenId(null);
    setBuilder({ campaign: null });
    onNewHandled?.();
  }, [newRequest, onNewHandled]);

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} testID="campaigns-view">
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => setBuilder({ campaign: null })}
          accessibilityRole="button"
          testID="campaigns-new"
        >
          <Plus size={18} color={c.onAccent} strokeWidth={2.75} />
          <Text style={styles.newText}>New series</Text>
        </TouchableOpacity>

        {campaigns.length === 0 ? (
          <View style={styles.empty} testID="campaigns-empty">
            <View style={styles.emptyIcon}>
              <Radio size={24} color={c.accent} strokeWidth={2} />
            </View>
            <Text style={styles.emptyTitle}>Group your events</Text>
            <Text style={styles.emptyBody}>
              A run club, a trivia season, a festival weekend: put the dates together, schedule one announcement,
              and remind everyone going before each event.
            </Text>
          </View>
        ) : (
          campaigns.map((cm) => {
            const events = campaignEvents(cm, drops);
            const phase = campaignPhase(cm, events, now);
            return (
              <TouchableOpacity
                key={cm.id}
                style={styles.card}
                onPress={() => setOpenId(cm.id)}
                accessibilityRole="button"
                testID={`campaign-${cm.id}`}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {cm.name}
                  </Text>
                  <PhasePill phase={phase} label={phaseLabel(phase, cm)} />
                  {/* Its own button, so tapping the rest of the card still opens it. */}
                  <TouchableOpacity
                    style={styles.shareBtn}
                    onPress={() => void shareCampaign(cm, events)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Share ${cm.name}`}
                    testID={`campaign-share-${cm.id}`}
                  >
                    <Share2 size={16} color={c.accent} strokeWidth={2.25} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardMeta}>
                  {events.length} {events.length === 1 ? 'event' : 'events'} · {campaignDateRange(events)}
                </Text>
                <Text style={styles.cardAudience} numberOfLines={1}>
                  {audienceSummary(cm)}
                </Text>
                {cm.tags.length ? (
                  <View style={styles.tags}>
                    {cm.tags.slice(0, 4).map((t) => (
                      <Text key={t} style={styles.tag}>
                        {t}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Detail sheet */}
      <Modal visible={open != null} transparent animationType="slide" onRequestClose={() => setOpenId(null)}>
        {open ? (
          <CampaignDetail
            campaign={open}
            drops={drops}
            now={now}
            onClose={() => setOpenId(null)}
            onEdit={() => {
              setOpenId(null);
              setBuilder({ campaign: open });
            }}
            onOpenPoint={(id) => {
              setOpenId(null);
              onOpenPoint(id);
            }}
            onAnnounce={onAnnounce}
          />
        ) : null}
      </Modal>

      <CampaignBuilder
        visible={builder != null}
        campaign={builder?.campaign ?? null}
        drops={drops}
        onClose={() => setBuilder(null)}
        onCreatePoints={onCreatePoints}
        onAnnounce={onAnnounce}
      />
    </View>
  );
};

/** Opens the share sheet with the campaign's dates and each upcoming event's link. */
async function shareCampaign(campaign: Campaign, events: DroppedPoint[]): Promise<void> {
  const message = campaignShareMessage(campaign, events);
  const first = events.find((e) => pointStatus(e) !== 'past') ?? events[0];
  try {
    // iOS can show one link as a rich preview; Android only uses message, which has every link.
    await Share.share(
      Platform.OS === 'ios' && first ? { message, url: shareUrl(first) } : { message },
      { subject: campaign.name },
    );
  } catch {
    Alert.alert('Couldn’t open sharing', 'Try again in a moment.');
  }
}

const PhasePill: React.FC<{ phase: CampaignPhase; label: string }> = ({ phase, label }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const color =
    phase === 'live'
      ? c.green
      : phase === 'scheduled'
        ? c.amber
        : phase === 'announced'
          ? c.accent
          : phase === 'cancelled'
            ? c.red
            : c.textMuted;
  return (
    <View style={[styles.pill, { borderColor: color }]}>
      <Text style={[styles.pillText, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
};

const CampaignDetail: React.FC<{
  campaign: Campaign;
  drops: DroppedPoint[];
  now: Date;
  onClose: () => void;
  onEdit: () => void;
  onOpenPoint: (id: string) => void;
  onAnnounce: CampaignBuilderProps['onAnnounce'];
}> = ({ campaign, drops, now, onClose, onEdit, onOpenPoint, onAnnounce }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  const events = campaignEvents(campaign, drops);
  const phase = campaignPhase(campaign, events, now);
  const canAnnounce = campaign.status === 'draft' || campaign.status === 'scheduled';

  const announceNow = () => {
    const input = { ...campaign, broadcastAt: null };
    const problem = validateCampaign(input, events, 'publish');
    if (problem) {
      setError(problem);
      return;
    }
    const saved = saveCampaign(input, true, campaign.id);
    onAnnounce(saved, events);
  };

  const confirmDelete = () =>
    Alert.alert(
      'Delete series?',
      'Its events stay on the map; only the grouping and the announcement settings are removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteCampaign(campaign.id);
            onClose();
          },
        },
      ],
    );

  return (
    <View style={styles.backdrop}>
      <TouchableOpacity style={styles.flex} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} testID="campaign-detail">
        <View style={styles.sheetHeader}>
          <View style={styles.flex}>
            <Text style={styles.sheetTitle}>{campaign.name}</Text>
            <Text style={styles.cardMeta}>
              {events.length} {events.length === 1 ? 'event' : 'events'} · {campaignDateRange(events)}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close">
            <X size={22} color={c.text} strokeWidth={2.25} />
          </TouchableOpacity>
        </View>
        <PhasePill phase={phase} label={phaseLabel(phase, campaign)} />
        {campaign.description ? <Text style={styles.description}>{campaign.description}</Text> : null}
        <Text style={styles.cardAudience}>{audienceSummary(campaign)}</Text>

        <ScrollView style={styles.eventList}>
          {events.length ? (
            events.map((e, i) => {
              const status = pointStatus(e, now);
              return (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.eventRow, i > 0 && styles.rowDivider]}
                  onPress={() => onOpenPoint(e.id)}
                  accessibilityRole="button"
                >
                  <View style={styles.flex}>
                    <Text style={[styles.eventTitle, status === 'past' && styles.past]} numberOfLines={1}>
                      {e.title}
                    </Text>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {formatPointWhen(e, now)}
                    </Text>
                    <Text style={styles.eventWhere} numberOfLines={1}>
                      {cleanVenueLabel(e.venue)}
                    </Text>
                  </View>
                  <ChevronRight size={18} color={c.textMuted} strokeWidth={2.25} />
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={styles.emptyBody}>No events yet. Edit the series to add some.</Text>
          )}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.iconBtn} onPress={confirmDelete} accessibilityRole="button" accessibilityLabel="Delete series" testID="campaign-delete">
            <Trash2 size={18} color={c.red} strokeWidth={2.25} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => void shareCampaign(campaign, events)}
            accessibilityRole="button"
            accessibilityLabel="Share series"
            testID="campaign-share"
          >
            <Share2 size={18} color={c.accent} strokeWidth={2.25} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={onEdit} accessibilityRole="button" testID="campaign-edit">
            <Pencil size={16} color={c.accent} strokeWidth={2.25} />
            <Text style={styles.secondaryText}>Edit</Text>
          </TouchableOpacity>
          {canAnnounce ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={announceNow} accessibilityRole="button" testID="campaign-announce-now">
              <Send size={16} color={c.onAccent} strokeWidth={2.5} />
              <Text style={styles.primaryText}>Announce now</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const createStyles = (c: ThemeColors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
    newBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 46,
      borderRadius: 23,
      backgroundColor: c.accent,
    },
    newText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 28, paddingHorizontal: 12 },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.accentTint,
    },
    emptyTitle: { color: c.text, fontSize: 17, fontWeight: '800' },
    emptyBody: { color: c.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      padding: 14,
      gap: 4,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardName: { flex: 1, color: c.text, fontSize: 16, fontWeight: '800' },
    shareBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    cardMeta: { color: c.textMuted, fontSize: 13, fontWeight: '600' },
    cardAudience: { color: c.textFaint, fontSize: 12 },
    tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    tag: {
      color: c.accent,
      fontSize: 12,
      fontWeight: '800',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: c.accentTint,
      overflow: 'hidden',
    },
    pill: {
      alignSelf: 'flex-start',
      maxWidth: '60%',
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    pillText: { fontSize: 11, fontWeight: '800' },
    backdrop: { flex: 1, backgroundColor: 'rgba(2, 6, 23, 0.6)' },
    sheet: {
      maxHeight: '82%',
      backgroundColor: c.sheet,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 8,
    },
    sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    sheetTitle: { color: c.text, fontSize: 20, fontWeight: '900' },
    description: { color: c.textBody, fontSize: 14, lineHeight: 20 },
    eventList: { flexGrow: 0, marginTop: 4 },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    eventTitle: { color: c.text, fontSize: 15, fontWeight: '700' },
    eventWhere: { color: c.textFaint, fontSize: 12 },
    past: { color: c.textMuted },
    error: { color: c.amber, fontSize: 13, fontWeight: '600' },
    actions: { flexDirection: 'row', gap: 10, paddingTop: 6 },
    iconBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryBtn: {
      flex: 1,
      flexDirection: 'row',
      gap: 6,
      height: 48,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: c.accent, fontSize: 15, fontWeight: '800' },
    primaryBtn: {
      flex: 1.4,
      flexDirection: 'row',
      gap: 6,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '800' },
  });
