import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, CalendarPlus, Check, Hash, MapPin, Plus, Radio, Repeat, Trash2, Users, X } from 'lucide-react-native';
import { KeyboardAwareScrollView } from '../common/KeyboardAwareScrollView';
import { WhenChip } from '../discovery/WhenChip';
import {
  CAMPAIGN_DESCRIPTION_MAX,
  CAMPAIGN_NAME_MAX,
  DEFAULT_AUDIENCE,
  MIN_CAMPAIGN_EVENTS,
  REMINDER_OPTIONS,
  campaignOfEvent,
  nextWeekEvent,
  phaseLabel,
  saveCampaign,
  validateCampaign,
  validateNewEvent,
  type Campaign,
  type CampaignAudience,
  type NewCampaignEvent,
} from '../../lib/campaigns';
import { useCampaigns } from '../../hooks/useCampaigns';
import { applyDateInput, applyTimeInput, formatBeaconDate, formatBeaconTime } from '../../lib/beaconWindow';
import { parseBeaconTags } from '../../lib/beaconDraft';
import { cleanVenueLabel, formatPointWhen, pointStatus, type DroppedPoint } from '../../lib/droppedPoint';
import { dropRangeError } from '../../lib/dropRange';
import { useUnits } from '../../lib/units';
import { useChannels } from '../../lib/channels';
import { canPostIn } from '../../lib/channelAccess';
import { geocodePlaces } from '../../services/placeGeocoder';
import { useDiscoveryStore } from '../../stores/useDiscoveryStore';
import { useTheme, useThemedStyles, type ThemeColors } from '../../theme/ThemeContext';
import type { PlaceSuggestion } from '../../types/beacon';

export interface CampaignBuilderProps {
  visible: boolean;
  /** The campaign being edited, or null for a new one. */
  campaign: Campaign | null;
  /** Your Points (existing ones can be added to the campaign). */
  drops: DroppedPoint[];
  onClose: () => void;
  /** Turns new events into real Points (on the map); returns them in the same order. */
  onCreatePoints: (
    events: NewCampaignEvent[],
    meta: { campaignName: string; description: string; tags: string[] },
  ) => Promise<DroppedPoint[]>;
  /** The announcement just went out (published with no time, or a time that's now). */
  onAnnounce: (campaign: Campaign, events: DroppedPoint[]) => void;
}

const HOUR = 3_600_000;

/** Tomorrow at `hour`:00. */
function tomorrowAt(hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const tagsToText = (tags: string[]) => tags.join(', ');

interface EventForm {
  title: string;
  query: string;
  place: NewCampaignEvent['place'];
  start: Date;
  end: Date;
}

const blankForm = (title = ''): EventForm => {
  const start = tomorrowAt(18);
  return { title, query: '', place: null, start, end: new Date(start.getTime() + 2 * HOUR) };
};

export const CampaignBuilder: React.FC<CampaignBuilderProps> = ({
  visible,
  campaign,
  drops,
  onClose,
  onCreatePoints,
  onAnnounce,
}) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const units = useUnits();
  const self = useDiscoveryStore((s) => s.selfCoordinates);
  const campaigns = useCampaigns();
  const postable = useChannels().filter((ch) => ch.joined && canPostIn(ch));

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [newEvents, setNewEvents] = useState<NewCampaignEvent[]>([]);
  const [form, setForm] = useState<EventForm | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [pickingExisting, setPickingExisting] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [broadcastAt, setBroadcastAt] = useState<Date>(tomorrowAt(9));
  const [audience, setAudience] = useState<CampaignAudience>(DEFAULT_AUDIENCE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const keySeq = useRef(0);
  const nextKey = () => `new-${Date.now()}-${(keySeq.current += 1)}`;

  // Fill the form each time it opens.
  useEffect(() => {
    if (!visible) return;
    setName(campaign?.name ?? '');
    setDescription(campaign?.description ?? '');
    setTagsText(tagsToText(campaign?.tags ?? []));
    setSelectedIds(campaign?.eventIds ?? []);
    setNewEvents([]);
    setForm(null);
    setFormError(null);
    setSuggestions([]);
    setPickingExisting(false);
    setScheduled(Boolean(campaign?.broadcastAt) && campaign?.status !== 'sent');
    setBroadcastAt(campaign?.broadcastAt ? new Date(campaign.broadcastAt) : tomorrowAt(9));
    setAudience(campaign?.audience ?? DEFAULT_AUDIENCE);
    setError(null);
    setSaving(false);
  }, [visible, campaign]);

  // Place search for the new-event form.
  useEffect(() => {
    const query = form?.query.trim() ?? '';
    if (!form || form.place?.label === form.query || query.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void geocodePlaces(query).then((found) => {
        if (!cancelled) setSuggestions(found);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form?.query, form?.place?.label]);

  const alreadySent = campaign?.status === 'sent';
  const tags = parseBeaconTags(tagsText);
  const selectedDrops = useMemo(() => drops.filter((d) => selectedIds.includes(d.id)), [drops, selectedIds]);
  // Everything in the campaign, in time order: existing Points and the new events typed in here.
  const rows = useMemo(
    () =>
      [
        ...selectedDrops.map((d) => ({ kind: 'point' as const, id: d.id, title: d.title, startsAt: d.startsAt, endsAt: d.endsAt, where: cleanVenueLabel(d.venue), drop: d })),
        ...newEvents.map((e) => ({ kind: 'new' as const, id: e.key, title: e.title, startsAt: e.startsAt, endsAt: e.endsAt, where: e.place?.label ?? '', drop: null })),
      ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [selectedDrops, newEvents],
  );
  const eligible = drops.filter((d) => pointStatus(d) !== 'past' && !selectedIds.includes(d.id));
  const lastNew = newEvents[newEvents.length - 1] ?? null;

  const updateForm = (patch: Partial<EventForm>) => {
    setForm((f) => (f ? { ...f, ...patch } : f));
    setFormError(null);
  };

  const commitFormStart = (kind: 'date' | 'time', value: string) => {
    if (!form) return;
    const next = kind === 'date' ? applyDateInput(form.start, value) : applyTimeInput(form.start, value);
    if (!next) return;
    const span = Math.max(15 * 60_000, form.end.getTime() - form.start.getTime());
    updateForm({ start: next, end: new Date(next.getTime() + span) });
  };
  const commitFormEnd = (kind: 'date' | 'time', value: string) => {
    if (!form) return;
    let next = kind === 'date' ? applyDateInput(form.end, value) : applyTimeInput(form.end, value);
    if (!next) return;
    // An end time earlier than the start means the next day (e.g. 9 PM – 1 AM).
    if (kind === 'time' && next.getTime() <= form.start.getTime()) next = new Date(next.getTime() + 24 * HOUR);
    updateForm({ end: next });
  };

  const addFormEvent = () => {
    if (!form) return;
    const event: NewCampaignEvent = {
      key: nextKey(),
      title: form.title.trim(),
      place: form.place,
      startsAt: form.start.toISOString(),
      endsAt: form.end.toISOString(),
    };
    const problem = validateNewEvent(event) ?? (event.place ? dropRangeError(self, event.place, units) : null);
    if (problem) {
      setFormError(problem);
      return;
    }
    setNewEvents((list) => [...list, event]);
    setForm(null);
    setError(null);
  };

  const removeRow = (row: (typeof rows)[number]) => {
    if (row.kind === 'point') setSelectedIds((ids) => ids.filter((id) => id !== row.id));
    else setNewEvents((list) => list.filter((e) => e.key !== row.id));
  };

  const setAudienceField = <K extends keyof CampaignAudience>(key: K, value: CampaignAudience[K]) => {
    setAudience((a) => ({ ...a, [key]: value }));
    setError(null);
  };

  const save = async (publish: boolean) => {
    if (saving) return;
    const input = {
      name,
      description,
      tags,
      eventIds: [...selectedIds, ...newEvents.map((e) => e.key)],
      broadcastAt: scheduled && !alreadySent ? broadcastAt.toISOString() : null,
      audience,
    };
    const timed = rows.map((r) => ({ id: r.id, startsAt: r.startsAt, endsAt: r.endsAt }));
    const problem =
      validateCampaign(input, timed, publish ? 'publish' : 'draft') ??
      newEvents.map((e) => validateNewEvent(e)).find(Boolean) ??
      null;
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = newEvents.length
        ? await onCreatePoints(newEvents, { campaignName: name.trim(), description: description.trim(), tags })
        : [];
      const saved = saveCampaign(
        { ...input, eventIds: [...selectedIds, ...created.map((p) => p.id)] },
        publish,
        campaign?.id,
      );
      if (saved.status === 'sent' && campaign?.status !== 'sent') {
        const ids = new Set(saved.eventIds);
        onAnnounce(saved, [...drops, ...created].filter((p) => ids.has(p.id)));
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save the campaign. Try again.');
      setSaving(false);
    }
  };

  const publishLabel = alreadySent ? 'Save changes' : scheduled ? 'Schedule' : 'Publish';

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + 8 }]} testID="campaign-builder">
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{campaign ? 'EDIT CAMPAIGN' : 'NEW CAMPAIGN'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" testID="campaign-close">
            <X size={22} color={c.text} strokeWidth={2.25} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* ---- Details ---- */}
          <View style={styles.card}>
            <TextInput
              style={styles.nameInput}
              placeholder="Campaign name, e.g. Fall Run Club"
              placeholderTextColor={c.textFaint}
              value={name}
              onChangeText={(v) => {
                setName(v.slice(0, CAMPAIGN_NAME_MAX));
                setError(null);
              }}
              testID="campaign-name"
            />
            <View style={styles.hairline} />
            <TextInput
              style={styles.descInput}
              placeholder="What's it about? (optional)"
              placeholderTextColor={c.textFaint}
              value={description}
              onChangeText={(v) => setDescription(v.slice(0, CAMPAIGN_DESCRIPTION_MAX))}
              multiline
              testID="campaign-description"
            />
            <View style={styles.hairline} />
            <View style={styles.inlineRow}>
              <Hash size={16} color={c.textMuted} strokeWidth={2.25} />
              <TextInput
                style={styles.inlineInput}
                placeholder="#RunClub, #5k"
                placeholderTextColor={c.textFaint}
                value={tagsText}
                onChangeText={(v) => {
                  setTagsText(v);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                testID="campaign-tags"
              />
            </View>
          </View>
          <Text style={styles.note}>Each new event gets these #tags and the description.</Text>

          {/* ---- Events ---- */}
          <Text style={styles.section}>EVENTS · {rows.length}</Text>
          {rows.length ? (
            <View style={styles.card}>
              {rows.map((row, i) => (
                <View key={row.id} style={[styles.eventRow, i > 0 && styles.rowDivider]} testID={`campaign-event-${row.id}`}>
                  <View style={styles.eventDate}>
                    <Text style={styles.eventMonth}>{formatBeaconDate(new Date(row.startsAt)).split(', ')[1]?.split(' ')[0]}</Text>
                    <Text style={styles.eventDay}>{new Date(row.startsAt).getDate()}</Text>
                  </View>
                  <View style={styles.eventCopy}>
                    <View style={styles.eventTitleRow}>
                      <Text style={styles.eventTitle} numberOfLines={1}>
                        {row.title}
                      </Text>
                      {row.kind === 'new' ? <Text style={styles.newBadge}>NEW</Text> : null}
                    </View>
                    <Text style={styles.eventMeta} numberOfLines={1}>
                      {row.drop ? formatPointWhen(row.drop) : `${formatBeaconDate(new Date(row.startsAt))} · ${formatBeaconTime(new Date(row.startsAt))} – ${formatBeaconTime(new Date(row.endsAt))}`}
                    </Text>
                    {row.where ? (
                      <Text style={styles.eventWhere} numberOfLines={1}>
                        {row.where}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => removeRow(row)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${row.title}`}
                  >
                    <Trash2 size={17} color={c.textMuted} strokeWidth={2.25} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.empty}>Add at least {MIN_CAMPAIGN_EVENTS} events: new ones, or Points you've already dropped.</Text>
          )}

          {form ? (
            <View style={[styles.card, styles.formCard]} testID="campaign-event-form">
              <TextInput
                style={styles.formTitle}
                placeholder="Event title"
                placeholderTextColor={c.textFaint}
                value={form.title}
                onChangeText={(v) => updateForm({ title: v })}
                testID="campaign-event-title"
              />
              <View style={styles.inlineRow}>
                <MapPin size={16} color={form.place ? c.accent : c.textMuted} strokeWidth={2.25} />
                <TextInput
                  style={styles.inlineInput}
                  placeholder="Search a place or venue"
                  placeholderTextColor={c.textFaint}
                  value={form.query}
                  onChangeText={(v) => updateForm({ query: v, place: form.place && v === form.place.label ? form.place : null })}
                  testID="campaign-event-place"
                />
              </View>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s.id}
                  style={styles.suggestion}
                  onPress={() => {
                    updateForm({ place: { label: s.label, latitude: s.latitude, longitude: s.longitude }, query: s.label });
                    setSuggestions([]);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={styles.suggestionLabel} numberOfLines={1}>
                    {s.label}
                  </Text>
                  <Text style={styles.suggestionSub} numberOfLines={1}>
                    {s.subtitle}
                  </Text>
                </TouchableOpacity>
              ))}
              {!form.place && lastNew?.place ? (
                <TouchableOpacity
                  style={styles.samePlace}
                  onPress={() => updateForm({ place: lastNew.place, query: lastNew.place?.label ?? '' })}
                  accessibilityRole="button"
                >
                  <Text style={styles.linkText}>Same place: {lastNew.place.label}</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.whenRow}>
                <Text style={styles.whenLabel}>Starts</Text>
                <View style={styles.chips}>
                  <WhenChip kind="date" date={form.start} minimumDate={new Date()} display={formatBeaconDate(form.start)} onCommit={(v) => commitFormStart('date', v)} testID="campaign-event-start-date" label="Start date" />
                  <WhenChip kind="time" date={form.start} display={formatBeaconTime(form.start)} onCommit={(v) => commitFormStart('time', v)} testID="campaign-event-start-time" label="Start time" />
                </View>
              </View>
              <View style={styles.whenRow}>
                <Text style={styles.whenLabel}>Ends</Text>
                <View style={styles.chips}>
                  <WhenChip kind="date" date={form.end} minimumDate={form.start} display={formatBeaconDate(form.end)} onCommit={(v) => commitFormEnd('date', v)} testID="campaign-event-end-date" label="End date" />
                  <WhenChip kind="time" date={form.end} display={formatBeaconTime(form.end)} onCommit={(v) => commitFormEnd('time', v)} testID="campaign-event-end-time" label="End time" />
                </View>
              </View>
              {formError ? <Text style={styles.error}>{formError}</Text> : null}
              <View style={styles.formActions}>
                <TouchableOpacity onPress={() => setForm(null)} accessibilityRole="button" style={styles.ghostBtn}>
                  <Text style={styles.ghostText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addFormEvent} accessibilityRole="button" style={styles.smallPrimary} testID="campaign-event-add">
                  <Text style={styles.smallPrimaryText}>Add event</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.addRow}>
              <TouchableOpacity
                style={styles.outlineBtn}
                onPress={() => {
                  setForm(blankForm(name.trim()));
                  setPickingExisting(false);
                }}
                accessibilityRole="button"
                testID="campaign-new-event"
              >
                <CalendarPlus size={16} color={c.accent} strokeWidth={2.25} />
                <Text style={styles.outlineText}>New event</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.outlineBtn, pickingExisting && styles.outlineBtnOn]}
                onPress={() => setPickingExisting((open) => !open)}
                accessibilityRole="button"
                accessibilityState={{ expanded: pickingExisting }}
                testID="campaign-add-existing"
              >
                <Plus size={16} color={c.accent} strokeWidth={2.25} />
                <Text style={styles.outlineText}>My Drops</Text>
              </TouchableOpacity>
            </View>
          )}
          {!form && lastNew ? (
            <TouchableOpacity
              style={styles.nextWeek}
              onPress={() => setNewEvents((list) => [...list, nextWeekEvent(lastNew, nextKey())])}
              accessibilityRole="button"
              testID="campaign-next-week"
            >
              <Repeat size={15} color={c.accent} strokeWidth={2.25} />
              <Text style={styles.linkText}>Same time next week</Text>
            </TouchableOpacity>
          ) : null}
          {pickingExisting && !form ? (
            <View style={styles.card} testID="campaign-existing-list">
              {eligible.length ? (
                eligible.map((d, i) => {
                  const other = campaignOfEvent(d.id, campaigns);
                  const elsewhere = other && other.id !== campaign?.id ? other : null;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.eventRow, i > 0 && styles.rowDivider]}
                      onPress={() => setSelectedIds((ids) => [...ids, d.id])}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${d.title}`}
                    >
                      <View style={styles.eventCopy}>
                        <Text style={styles.eventTitle} numberOfLines={1}>
                          {d.title}
                        </Text>
                        <Text style={styles.eventMeta} numberOfLines={1}>
                          {formatPointWhen(d)}
                        </Text>
                        {elsewhere ? <Text style={styles.eventWhere}>Moves it out of {elsewhere.name}</Text> : null}
                      </View>
                      <Plus size={18} color={c.accent} strokeWidth={2.5} />
                    </TouchableOpacity>
                  );
                })
              ) : (
                <Text style={styles.emptyInCard}>No upcoming drops to add. Drop one from the map, or add a new event here.</Text>
              )}
            </View>
          ) : null}
          {newEvents.length ? (
            <Text style={styles.note}>New events go on the map when you save. The announcement waits until you publish.</Text>
          ) : null}

          {/* ---- Announcement ---- */}
          <Text style={styles.section}>ANNOUNCEMENT</Text>
          <View style={styles.card}>
            {alreadySent ? (
              <View style={styles.inlineRow}>
                <Radio size={16} color={c.green} strokeWidth={2.25} />
                <Text style={styles.body}>
                  {campaign?.broadcastSentAt
                    ? `Announced ${formatBeaconDate(new Date(campaign.broadcastSentAt))} · ${formatBeaconTime(new Date(campaign.broadcastSentAt))}`
                    : phaseLabel('announced', campaign!)}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.pills}>
                  {[false, true].map((on) => (
                    <TouchableOpacity
                      key={String(on)}
                      style={[styles.pill, scheduled === on && styles.pillOn]}
                      onPress={() => {
                        setScheduled(on);
                        setError(null);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: scheduled === on }}
                      testID={on ? 'campaign-broadcast-schedule' : 'campaign-broadcast-now'}
                    >
                      <Text style={[styles.pillText, scheduled === on && styles.pillTextOn]}>
                        {on ? 'Schedule' : 'When I publish'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {scheduled ? (
                  <View style={styles.whenRow}>
                    <Text style={styles.whenLabel}>Send</Text>
                    <View style={styles.chips}>
                      <WhenChip
                        kind="date"
                        date={broadcastAt}
                        minimumDate={new Date()}
                        display={formatBeaconDate(broadcastAt)}
                        onCommit={(v) => {
                          const next = applyDateInput(broadcastAt, v);
                          if (next) setBroadcastAt(next);
                          setError(null);
                        }}
                        testID="campaign-broadcast-date"
                        label="Announcement date"
                      />
                      <WhenChip
                        kind="time"
                        date={broadcastAt}
                        display={formatBeaconTime(broadcastAt)}
                        onCommit={(v) => {
                          const next = applyTimeInput(broadcastAt, v);
                          if (next) setBroadcastAt(next);
                          setError(null);
                        }}
                        testID="campaign-broadcast-time"
                        label="Announcement time"
                      />
                    </View>
                  </View>
                ) : null}
              </>
            )}
          </View>

          {/* ---- Who gets notified ---- */}
          <Text style={styles.section}>NOTIFY</Text>
          <View style={styles.card}>
            <ToggleRow
              Icon={Hash}
              title="#tag followers nearby"
              body={tags.length ? `People who follow ${tags.slice(0, 3).join(', ')}` : 'Add #tags above to reach their followers.'}
              value={audience.tagFollowers}
              onChange={(v) => setAudienceField('tagFollowers', v)}
              testID="campaign-notify-tags"
            />
            <View style={styles.hairline} />
            <ToggleRow
              Icon={Users}
              title="My followers"
              body="Everyone who follows your profile."
              value={audience.myFollowers}
              onChange={(v) => setAudienceField('myFollowers', v)}
              testID="campaign-notify-followers"
            />
            <View style={styles.hairline} />
            <Text style={styles.subLabel}>Post in channels</Text>
            {postable.length ? (
              <View style={styles.pills}>
                {postable.map((ch) => {
                  const on = audience.channelIds.includes(ch.id);
                  return (
                    <TouchableOpacity
                      key={ch.id}
                      style={[styles.pill, on && styles.pillOn]}
                      onPress={() =>
                        setAudienceField(
                          'channelIds',
                          on ? audience.channelIds.filter((id) => id !== ch.id) : [...audience.channelIds, ch.id],
                        )
                      }
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      {on ? <Check size={13} color={c.accent} strokeWidth={3} /> : null}
                      <Text style={[styles.pillText, on && styles.pillTextOn]} numberOfLines={1}>
                        {ch.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.noteInCard}>Join a channel you can post in to announce there.</Text>
            )}
            <View style={styles.hairline} />
            <View style={styles.inlineRow}>
              <Bell size={16} color={c.textMuted} strokeWidth={2.25} />
              <Text style={styles.toggleTitle}>RSVP reminders</Text>
            </View>
            <View style={styles.pills}>
              {REMINDER_OPTIONS.map((o) => {
                const on = audience.rsvpReminderMinutes === o.minutes;
                return (
                  <TouchableOpacity
                    key={o.label}
                    style={[styles.pill, on && styles.pillOn]}
                    onPress={() => setAudienceField('rsvpReminderMinutes', o.minutes)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.pillText, on && styles.pillTextOn]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.noteInCard}>Sent to people going, before each event in the campaign.</Text>
          </View>
        </KeyboardAwareScrollView>

        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {error ? (
            <Text style={styles.error} testID="campaign-error">
              {error}
            </Text>
          ) : null}
          <View style={styles.footerRow}>
            {!alreadySent ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => void save(false)}
                disabled={saving}
                accessibilityRole="button"
                testID="campaign-save-draft"
              >
                <Text style={styles.secondaryText}>Save draft</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void save(true)}
              disabled={saving}
              accessibilityRole="button"
              testID="campaign-publish"
            >
              {saving ? <ActivityIndicator color={c.onAccent} /> : <Text style={styles.primaryText}>{publishLabel}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const ToggleRow: React.FC<{
  Icon: typeof Hash;
  title: string;
  body: string;
  value: boolean;
  onChange: (v: boolean) => void;
  testID: string;
}> = ({ Icon, title, body, value, onChange, testID }) => {
  const styles = useThemedStyles(createStyles);
  const { colors: c } = useTheme();
  return (
    <View style={styles.toggleRow}>
      <Icon size={16} color={value ? c.accent : c.textMuted} strokeWidth={2.25} />
      <View style={styles.toggleCopy}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.noteInCard}>{body}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: c.borderStrong, true: c.accentTrack }}
        thumbColor={value ? c.accent : c.textMuted}
        accessibilityLabel={title}
        testID={testID}
      />
    </View>
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
      paddingBottom: 10,
    },
    headerTitle: { color: c.text, fontSize: 14, fontWeight: '900', letterSpacing: 1.4 },
    content: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    formCard: { paddingVertical: 10, gap: 8, borderColor: c.accentBorder },
    hairline: { height: 1, backgroundColor: c.border, marginVertical: 2 },
    nameInput: { color: c.text, fontSize: 17, fontWeight: '700', paddingVertical: 10 },
    descInput: { color: c.textBody, fontSize: 14, minHeight: 44, paddingVertical: 10, textAlignVertical: 'top' },
    inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    inlineInput: { flex: 1, color: c.text, fontSize: 14, paddingVertical: 8 },
    note: { color: c.textMuted, fontSize: 12, lineHeight: 17, paddingHorizontal: 2 },
    noteInCard: { color: c.textMuted, fontSize: 12, lineHeight: 17 },
    section: { color: c.textMuted, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginTop: 12 },
    subLabel: { color: c.text, fontSize: 14, fontWeight: '700', paddingTop: 8 },
    empty: { color: c.textFaint, fontSize: 13, lineHeight: 18 },
    emptyInCard: { color: c.textFaint, fontSize: 13, lineHeight: 18, paddingVertical: 10 },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    rowDivider: { borderTopWidth: 1, borderTopColor: c.border },
    eventDate: {
      width: 44,
      paddingVertical: 4,
      borderRadius: 10,
      alignItems: 'center',
      backgroundColor: c.accentTint,
    },
    eventMonth: { color: c.accent, fontSize: 10, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
    eventDay: { color: c.text, fontSize: 17, fontWeight: '900' },
    eventCopy: { flex: 1, gap: 1 },
    eventTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    eventTitle: { color: c.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    newBadge: {
      color: c.accent,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.8,
      borderWidth: 1,
      borderColor: c.accentBorder,
      borderRadius: 6,
      paddingHorizontal: 5,
      paddingVertical: 1,
    },
    eventMeta: { color: c.textMuted, fontSize: 12, fontWeight: '600' },
    eventWhere: { color: c.textFaint, fontSize: 12 },
    formTitle: { color: c.text, fontSize: 15, fontWeight: '700', paddingVertical: 6 },
    suggestion: { paddingVertical: 8, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: c.border },
    suggestionLabel: { color: c.text, fontSize: 14, fontWeight: '600' },
    suggestionSub: { color: c.textFaint, fontSize: 12 },
    samePlace: { paddingVertical: 4 },
    linkText: { color: c.accent, fontSize: 13, fontWeight: '700' },
    whenRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
    whenLabel: { color: c.textMuted, fontSize: 14, fontWeight: '600', width: 52 },
    chips: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    formActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 4 },
    ghostBtn: { paddingHorizontal: 14, height: 38, justifyContent: 'center' },
    ghostText: { color: c.textMuted, fontSize: 14, fontWeight: '700' },
    smallPrimary: { paddingHorizontal: 18, height: 38, borderRadius: 19, backgroundColor: c.accent, justifyContent: 'center' },
    smallPrimaryText: { color: c.onAccent, fontSize: 14, fontWeight: '800' },
    addRow: { flexDirection: 'row', gap: 10 },
    outlineBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 42,
      borderRadius: 21,
      borderWidth: 1,
      borderColor: c.accentBorder,
    },
    outlineBtnOn: { backgroundColor: c.accentTint },
    outlineText: { color: c.accent, fontSize: 14, fontWeight: '800' },
    nextWeek: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
    pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 8 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      maxWidth: '100%',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 16,
      backgroundColor: c.base,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    pillOn: { backgroundColor: c.accentTint, borderColor: c.accent },
    pillText: { color: c.textMuted, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    pillTextOn: { color: c.text },
    body: { color: c.textBody, fontSize: 14, flex: 1 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
    toggleCopy: { flex: 1, gap: 2 },
    toggleTitle: { color: c.text, fontSize: 14, fontWeight: '700' },
    error: { color: c.amber, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    footer: { paddingHorizontal: 16, paddingTop: 10, gap: 8, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.sheet },
    footerRow: { flexDirection: 'row', gap: 10 },
    secondaryBtn: {
      flex: 1,
      height: 50,
      borderRadius: 25,
      borderWidth: 1,
      borderColor: c.accentBorder,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: { color: c.accent, fontSize: 15, fontWeight: '800' },
    primaryBtn: { flex: 1.4, height: 50, borderRadius: 25, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    primaryText: { color: c.onAccent, fontSize: 15, fontWeight: '900', letterSpacing: 0.6 },
  });
