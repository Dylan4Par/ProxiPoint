/**
 * Campaigns: a named group of Points (a weekly run club series, a festival weekend, a trivia
 * season) with one announcement that goes out at a scheduled time, plus RSVP reminders.
 *
 * Database (overwatchcore-ingest migration 009_event_campaigns):
 *   event_campaigns   campaign_id, organizer_id, campaign_name, scheduled_broadcast_time, …
 *   campaign_events   campaign_id ↔ event_id (an event is in at most one campaign)
 *   campaign_channels campaign_id ↔ channel_id (channels to announce in)
 * Server side later: POST /v1/campaigns, PATCH /v1/campaigns/:id, DELETE …; a worker sends the
 * announcement at scheduled_broadcast_time and the RSVP reminders. Until then campaigns live in
 * memory on the phone (like My Drops).
 */
import { formatPointWhen, pointStatus, publicWhere, shareUrl, type DroppedPoint } from './droppedPoint';

export type CampaignStatus = 'draft' | 'scheduled' | 'sent' | 'cancelled';

export interface CampaignAudience {
  /** People nearby who follow any of the campaign's #tags. */
  tagFollowers: boolean;
  /** People who follow you (the organizer). */
  myFollowers: boolean;
  /** Channels to post the announcement in (ids). */
  channelIds: string[];
  /** Remind people who RSVP'd this many minutes before each event; null = no reminders. */
  rsvpReminderMinutes: number | null;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  /** "#RunClub" style, no duplicates. */
  tags: string[];
  /** The Points in this campaign, in order. */
  eventIds: string[];
  status: CampaignStatus;
  /** When the announcement goes out; null = as soon as it's published. ISO string. */
  broadcastAt: string | null;
  /** When it actually went out. ISO string. */
  broadcastSentAt: string | null;
  audience: CampaignAudience;
  createdAt: string;
  updatedAt: string;
}

export const CAMPAIGN_NAME_MAX = 80;
export const CAMPAIGN_DESCRIPTION_MAX = 500;
/** A campaign groups events, so publishing needs at least this many. */
export const MIN_CAMPAIGN_EVENTS = 2;
export const MAX_CAMPAIGN_EVENTS = 30;

export const REMINDER_OPTIONS: { minutes: number | null; label: string }[] = [
  { minutes: null, label: 'Off' },
  { minutes: 60, label: '1 hour before' },
  { minutes: 24 * 60, label: '1 day before' },
];

export const DEFAULT_AUDIENCE: CampaignAudience = {
  tagFollowers: true,
  myFollowers: true,
  channelIds: [],
  rsvpReminderMinutes: 60,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const shortDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
function shortTime(d: Date): string {
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const suffix = h >= 12 ? 'PM' : 'AM';
  h %= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

type Timed = Pick<DroppedPoint, 'id' | 'startsAt' | 'endsAt'>;

/** The campaign's Points that still exist, in start order. */
export function campaignEvents<T extends Timed>(campaign: Pick<Campaign, 'eventIds'>, points: T[]): T[] {
  const ids = new Set(campaign.eventIds);
  return points
    .filter((p) => ids.has(p.id))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

/** "Oct 30", "Oct 30 – Nov 20", or "No events yet". */
export function campaignDateRange(events: Timed[]): string {
  if (events.length === 0) return 'No events yet';
  const first = new Date(Math.min(...events.map((e) => new Date(e.startsAt).getTime())));
  const last = new Date(Math.max(...events.map((e) => new Date(e.startsAt).getTime())));
  return first.toDateString() === last.toDateString() ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
}

export type CampaignPhase = 'draft' | 'scheduled' | 'announced' | 'live' | 'ended' | 'cancelled';

/** What to show on the campaign: its stored status plus where its events are in time. */
export function campaignPhase(campaign: Pick<Campaign, 'status'>, events: Timed[], now = new Date()): CampaignPhase {
  if (campaign.status === 'cancelled') return 'cancelled';
  if (campaign.status === 'draft') return 'draft';
  if (campaign.status === 'scheduled') return 'scheduled';
  const t = now.getTime();
  if (events.length && events.every((e) => new Date(e.endsAt).getTime() <= t)) return 'ended';
  if (events.some((e) => new Date(e.startsAt).getTime() <= t && new Date(e.endsAt).getTime() > t)) return 'live';
  return 'announced';
}

/** "Draft", "Announces Fri, Oct 30 · 9:00 AM", "Announced", "Live now", "Ended", "Cancelled". */
export function phaseLabel(phase: CampaignPhase, campaign: Pick<Campaign, 'broadcastAt'>): string {
  switch (phase) {
    case 'draft':
      return 'Draft';
    case 'scheduled': {
      const at = campaign.broadcastAt ? new Date(campaign.broadcastAt) : null;
      return at ? `Announces ${WEEKDAYS[at.getDay()]}, ${shortDate(at)} · ${shortTime(at)}` : 'Announcing';
    }
    case 'announced':
      return 'Announced';
    case 'live':
      return 'Live now';
    case 'ended':
      return 'Ended';
    case 'cancelled':
      return 'Cancelled';
  }
}

/** "#RunClub followers · 2 channels · My followers · Reminders 1 hour before". */
export function audienceSummary(campaign: Pick<Campaign, 'audience' | 'tags'>): string {
  const a = campaign.audience;
  const parts: string[] = [];
  if (a.tagFollowers && campaign.tags.length) parts.push(`${campaign.tags[0]}${campaign.tags.length > 1 ? ' +' + (campaign.tags.length - 1) : ''} followers`);
  if (a.channelIds.length) parts.push(a.channelIds.length === 1 ? '1 channel' : `${a.channelIds.length} channels`);
  if (a.myFollowers) parts.push('My followers');
  const reminder = REMINDER_OPTIONS.find((o) => o.minutes === a.rsvpReminderMinutes);
  if (a.rsvpReminderMinutes != null) parts.push(`RSVP reminders ${reminder ? reminder.label : `${a.rsvpReminderMinutes} min before`}`);
  return parts.length ? parts.join(' · ') : 'Nobody is notified';
}

export interface CampaignInput {
  name: string;
  description: string;
  tags: string[];
  eventIds: string[];
  broadcastAt: string | null;
  audience: CampaignAudience;
}

/**
 * Problems that stop a save, or null. Drafts only need a name; publishing also needs the events,
 * someone to notify, and an announcement time that's still useful.
 */
export function validateCampaign(
  input: CampaignInput,
  events: Timed[],
  mode: 'draft' | 'publish',
  now = new Date(),
): string | null {
  const name = input.name.trim();
  if (!name) return 'Give the series a name.';
  if (name.length > CAMPAIGN_NAME_MAX) return `Keep the name under ${CAMPAIGN_NAME_MAX} characters.`;
  if (input.description.length > CAMPAIGN_DESCRIPTION_MAX) {
    return `Keep the description under ${CAMPAIGN_DESCRIPTION_MAX} characters.`;
  }
  if (input.eventIds.length > MAX_CAMPAIGN_EVENTS) return `A series can have up to ${MAX_CAMPAIGN_EVENTS} events.`;
  if (mode === 'draft') return null;

  if (events.length < MIN_CAMPAIGN_EVENTS) return `Add at least ${MIN_CAMPAIGN_EVENTS} events to publish.`;
  const t = now.getTime();
  if (events.every((e) => new Date(e.endsAt).getTime() <= t)) return 'All of these events have ended. Add an upcoming one.';
  const a = input.audience;
  if (!a.tagFollowers && !a.myFollowers && a.channelIds.length === 0 && a.rsvpReminderMinutes == null) {
    return 'Pick who to notify: #tag followers, your followers, a channel, or RSVP reminders.';
  }
  if (a.tagFollowers && input.tags.length === 0) return 'Add a #tag, or turn off notifying #tag followers.';
  if (input.broadcastAt) {
    const at = new Date(input.broadcastAt).getTime();
    if (!Number.isFinite(at)) return 'Pick a valid announcement time.';
    if (at < t - 60_000) return 'The announcement time has passed. Pick a later time, or announce on publish.';
    const firstStart = Math.min(...events.map((e) => new Date(e.startsAt).getTime()));
    if (at >= firstStart) return 'Announce before the first event starts.';
  }
  return null;
}

/** What the server gets (column names match migration 009). */
export function toCampaignPayload(input: CampaignInput, publish: boolean) {
  return {
    campaign_name: input.name.trim(),
    description: input.description.trim() || null,
    tags: input.tags,
    event_ids: input.eventIds,
    scheduled_broadcast_time: input.broadcastAt,
    publish,
    notify_tag_followers: input.audience.tagFollowers,
    notify_host_followers: input.audience.myFollowers,
    channel_ids: input.audience.channelIds,
    rsvp_reminder_minutes: input.audience.rsvpReminderMinutes,
  };
}

/** The status a save leaves the campaign in. Publishing with no time (or a time now) sends right away. */
export function statusAfterSave(input: Pick<CampaignInput, 'broadcastAt'>, publish: boolean, now = new Date()): CampaignStatus {
  if (!publish) return 'draft';
  if (!input.broadcastAt) return 'sent';
  return new Date(input.broadcastAt).getTime() <= now.getTime() ? 'sent' : 'scheduled';
}

/** The announcement posted to each chosen channel. */
export function announcementText(campaign: Pick<Campaign, 'name' | 'description'>, events: Timed[]): string {
  const lines = [`📣 ${campaign.name} · ${events.length} events, ${campaignDateRange(events)}`];
  if (campaign.description.trim()) lines.push(campaign.description.trim());
  return lines.join('\n');
}

// ---- Store (in memory until the server has campaigns) -------------------------------------------

let campaigns: Campaign[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function getCampaigns(): Campaign[] {
  return campaigns;
}

/** Called whenever campaigns change; returns an unsubscribe. (React: hooks/useCampaigns.) */
export function subscribeCampaigns(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Which campaign a Point is in (an event belongs to at most one). */
export function campaignOfEvent(eventId: string, list: Campaign[] = campaigns): Campaign | null {
  return list.find((c) => c.eventIds.includes(eventId)) ?? null;
}

/** Saves a new campaign or updates one. Events are taken out of any other campaign they were in. */
export function saveCampaign(input: CampaignInput, publish: boolean, id?: string, now = new Date()): Campaign {
  const iso = now.toISOString();
  const existing = id ? campaigns.find((c) => c.id === id) : undefined;
  const status = statusAfterSave(input, publish, now);
  const saved: Campaign = {
    id: existing?.id ?? `cmp-${now.getTime()}-${Math.random().toString(36).slice(2, 7)}`,
    name: input.name.trim(),
    description: input.description.trim(),
    tags: input.tags,
    eventIds: [...new Set(input.eventIds)],
    status: existing?.status === 'sent' && publish ? 'sent' : status,
    broadcastAt: input.broadcastAt,
    broadcastSentAt: existing?.broadcastSentAt ?? (status === 'sent' ? iso : null),
    audience: { ...input.audience, channelIds: [...new Set(input.audience.channelIds)] },
    createdAt: existing?.createdAt ?? iso,
    updatedAt: iso,
  };
  const taken = new Set(saved.eventIds);
  campaigns = [
    saved,
    ...campaigns
      .filter((c) => c.id !== saved.id)
      .map((c) => (c.eventIds.some((e) => taken.has(e)) ? { ...c, eventIds: c.eventIds.filter((e) => !taken.has(e)) } : c)),
  ];
  emit();
  return saved;
}

export function deleteCampaign(id: string): void {
  campaigns = campaigns.filter((c) => c.id !== id);
  emit();
}

/** Scheduled campaigns whose time has come: marked sent and returned (so their announcements go out). */
export function takeDueBroadcasts(now = new Date()): Campaign[] {
  const due = campaigns.filter(
    (c) => c.status === 'scheduled' && c.broadcastAt && new Date(c.broadcastAt).getTime() <= now.getTime(),
  );
  if (!due.length) return [];
  const iso = now.toISOString();
  const ids = new Set(due.map((c) => c.id));
  campaigns = campaigns.map((c) => (ids.has(c.id) ? { ...c, status: 'sent', broadcastSentAt: iso, updatedAt: iso } : c));
  emit();
  return campaigns.filter((c) => ids.has(c.id));
}

/** For tests. */
export function resetCampaignsForTest(): void {
  campaigns = [];
  emit();
}

// ---- New events made inside the campaign builder -------------------------------------------------

/** An event typed into the builder; it becomes a real Point when the campaign is saved. */
export interface NewCampaignEvent {
  key: string;
  title: string;
  place: { label: string; latitude: number; longitude: number } | null;
  /** ISO strings. */
  startsAt: string;
  endsAt: string;
}

/** Problems with one new event, or null. */
export function validateNewEvent(e: NewCampaignEvent, now = new Date()): string | null {
  if (!e.title.trim()) return 'Give the event a title.';
  if (!e.place) return 'Pick a place for the event.';
  const start = new Date(e.startsAt).getTime();
  const end = new Date(e.endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Pick a valid date and time.';
  if (end <= start) return 'The event has to end after it starts.';
  if (start < now.getTime() - 60_000) return 'That start time has passed. Pick a later one.';
  return null;
}

/** A new event one week after `previous` (same place, title and times), for "+ Next week". */
export function nextWeekEvent(previous: NewCampaignEvent, key: string): NewCampaignEvent {
  // 7 calendar days, so a 6 PM event stays at 6 PM across a daylight-saving change.
  const plusWeek = (iso: string) => {
    const d = new Date(iso);
    d.setDate(d.getDate() + 7);
    return d.toISOString();
  };
  return { key, title: previous.title, place: previous.place, startsAt: plusWeek(previous.startsAt), endsAt: plusWeek(previous.endsAt) };
}

// ---- Sharing ------------------------------------------------------------------------------------

/** Events listed in a shared campaign before "+N more". */
export const CAMPAIGN_SHARE_MAX_EVENTS = 5;

/**
 * Text for the share sheet: name, dates, description, each upcoming event with its link (where
 * others see it: privacy areas stay private), and the #tags. Ended events are left out unless
 * they all have ended.
 */
export function campaignShareMessage(
  campaign: Pick<Campaign, 'name' | 'description' | 'tags'>,
  events: DroppedPoint[],
  now = new Date(),
): string {
  const upcoming = events.filter((e) => pointStatus(e, now) !== 'past');
  const listed = upcoming.length ? upcoming : events;
  const lines = [campaign.name, `${events.length} ${events.length === 1 ? 'event' : 'events'} · ${campaignDateRange(events)}`];
  if (campaign.description.trim()) lines.push(campaign.description.trim());
  if (listed.length) lines.push('');
  for (const e of listed.slice(0, CAMPAIGN_SHARE_MAX_EVENTS)) {
    lines.push(`• ${e.title}: ${formatPointWhen(e, now)} · ${publicWhere(e)}`, `  ${shareUrl(e)}`);
  }
  if (listed.length > CAMPAIGN_SHARE_MAX_EVENTS) lines.push(`+ ${listed.length - CAMPAIGN_SHARE_MAX_EVENTS} more on ProxiPoint`);
  if (campaign.tags.length) lines.push('', campaign.tags.join(' '));
  return lines.join('\n');
}
