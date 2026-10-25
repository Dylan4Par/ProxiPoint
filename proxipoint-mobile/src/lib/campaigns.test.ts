import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import {
  DEFAULT_AUDIENCE,
  announcementText,
  audienceSummary,
  campaignDateRange,
  campaignShareMessage,
  campaignEvents,
  campaignOfEvent,
  campaignPhase,
  deleteCampaign,
  getCampaigns,
  phaseLabel,
  resetCampaignsForTest,
  saveCampaign,
  statusAfterSave,
  takeDueBroadcasts,
  toCampaignPayload,
  nextWeekEvent,
  validateCampaign,
  validateNewEvent,
  type CampaignInput,
} from './campaigns';

const now = new Date(2026, 9, 24, 9, 0); // Sat Oct 24, 9:00 AM
const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString();
const ev = (id: string, day: number, hour: number, hours = 2) => ({
  id,
  startsAt: at(day, hour),
  endsAt: new Date(new Date(at(day, hour)).getTime() + hours * 3_600_000).toISOString(),
});
const week1 = ev('a', 27, 18);
const week2 = ev('b', 29, 18); // Thu Oct 29 (later than a)
const past = ev('p', 20, 18);

const input = (over: Partial<CampaignInput> = {}): CampaignInput => ({
  name: 'Fall Run Club',
  description: 'Easy 5k loops',
  tags: ['#RunClub'],
  eventIds: ['a', 'b'],
  broadcastAt: null,
  audience: { ...DEFAULT_AUDIENCE },
  ...over,
});

beforeEach(() => resetCampaignsForTest());

test('events come back in start order and the range reads nicely', () => {
  const events = campaignEvents({ eventIds: ['b', 'a', 'gone'] }, [week2, past, week1]);
  assert.deepEqual(events.map((e) => e.id), ['a', 'b']);
  assert.equal(campaignDateRange(events), 'Oct 27 – Oct 29');
  assert.equal(campaignDateRange([week1]), 'Oct 27');
  assert.equal(campaignDateRange([]), 'No Drops yet');
});

test('drafts need only a name; publishing needs events, an audience and a sensible time', () => {
  assert.equal(validateCampaign(input({ name: '  ' }), [], 'draft', now), 'Give the series a name.');
  assert.equal(validateCampaign(input({ eventIds: [] }), [], 'draft', now), null);
  assert.match(validateCampaign(input(), [week1], 'publish', now) ?? '', /at least 2 Drops/);
  assert.equal(validateCampaign(input(), [week1, week2], 'publish', now), null);
  assert.match(validateCampaign(input(), [past, { ...past, id: 'p2' }], 'publish', now) ?? '', /ended/);
  const nobody = { tagFollowers: false, myFollowers: false, channelIds: [], rsvpReminderMinutes: null };
  assert.match(validateCampaign(input({ audience: nobody }), [week1, week2], 'publish', now) ?? '', /who to notify/);
  assert.match(validateCampaign(input({ tags: [] }), [week1, week2], 'publish', now) ?? '', /Add a #tag/);
  // Announcement time: in the future and before the first event.
  assert.equal(validateCampaign(input({ broadcastAt: at(26, 9) }), [week1, week2], 'publish', now), null);
  assert.match(validateCampaign(input({ broadcastAt: at(23, 9) }), [week1, week2], 'publish', now) ?? '', /passed/);
  assert.match(validateCampaign(input({ broadcastAt: at(28, 9) }), [week1, week2], 'publish', now) ?? '', /before the first Drop/);
});

test('publishing with no time sends now; with a future time it waits', () => {
  assert.equal(statusAfterSave({ broadcastAt: null }, false, now), 'draft');
  assert.equal(statusAfterSave({ broadcastAt: null }, true, now), 'sent');
  assert.equal(statusAfterSave({ broadcastAt: at(26, 9) }, true, now), 'scheduled');
});

test('phase follows status first, then where the events are', () => {
  const events = [week1, week2];
  assert.equal(campaignPhase({ status: 'draft' }, events, now), 'draft');
  assert.equal(campaignPhase({ status: 'scheduled' }, events, now), 'scheduled');
  assert.equal(campaignPhase({ status: 'sent' }, events, now), 'announced');
  assert.equal(campaignPhase({ status: 'sent' }, events, new Date(2026, 9, 27, 19)), 'live');
  assert.equal(campaignPhase({ status: 'sent' }, events, new Date(2026, 9, 30)), 'ended');
  assert.equal(phaseLabel('scheduled', { broadcastAt: at(26, 9) }), 'Announces Mon, Oct 26 · 9:00 AM');
});

test('saving keeps an event in one campaign only; scheduled ones go out when due', () => {
  const first = saveCampaign(input(), true, undefined, now);
  assert.equal(first.status, 'sent');
  assert.ok(first.broadcastSentAt);
  const second = saveCampaign(input({ name: 'Trivia', eventIds: ['b', 'c'], broadcastAt: at(26, 9) }), true, undefined, now);
  assert.equal(second.status, 'scheduled');
  assert.deepEqual(getCampaigns().find((c) => c.id === first.id)?.eventIds, ['a']);
  assert.equal(campaignOfEvent('b')?.id, second.id);

  assert.deepEqual(takeDueBroadcasts(new Date(2026, 9, 25)), []);
  const due = takeDueBroadcasts(new Date(2026, 9, 26, 9, 1));
  assert.deepEqual(due.map((c) => c.id), [second.id]);
  assert.equal(getCampaigns().find((c) => c.id === second.id)?.status, 'sent');

  // Editing keeps the id and creation time.
  const edited = saveCampaign(input({ name: 'Trivia Season' , eventIds: ['b', 'c'] }), true, second.id, now);
  assert.equal(edited.id, second.id);
  assert.equal(edited.createdAt, second.createdAt);
  deleteCampaign(first.id);
  assert.equal(getCampaigns().length, 1);
});

test('payload uses the migration 009 column names', () => {
  const p = toCampaignPayload(input({ broadcastAt: at(26, 9), audience: { ...DEFAULT_AUDIENCE, channelIds: ['dink-crew'] } }), true);
  assert.equal(p.campaign_name, 'Fall Run Club');
  assert.equal(p.scheduled_broadcast_time, at(26, 9));
  assert.deepEqual(p.channel_ids, ['dink-crew']);
  assert.equal(p.rsvp_reminder_minutes, 60);
  assert.equal(p.notify_tag_followers, true);
  assert.deepEqual(p.event_ids, ['a', 'b']);
});

test('audience and announcement text', () => {
  assert.equal(
    audienceSummary({ tags: ['#RunClub', '#5k'], audience: { ...DEFAULT_AUDIENCE, channelIds: ['x', 'y'] } }),
    '#RunClub +1 followers · 2 channels · My followers · RSVP reminders 1 hour before',
  );
  assert.equal(
    audienceSummary({ tags: [], audience: { tagFollowers: false, myFollowers: false, channelIds: [], rsvpReminderMinutes: null } }),
    'Nobody is notified',
  );
  assert.equal(
    announcementText({ name: 'Fall Run Club', description: 'Easy 5k loops' }, [week1, week2]),
    '📣 Fall Run Club · 2 events, Oct 27 – Oct 29\nEasy 5k loops',
  );
});

test('new events need a title, place and a future window; next week copies the rest', () => {
  const base = {
    key: 'k1',
    title: 'Tuesday loop',
    place: { label: 'Coal Creek Trail', latitude: 40.05, longitude: -105.05 },
    startsAt: at(27, 18),
    endsAt: at(27, 19),
  };
  assert.equal(validateNewEvent(base, now), null);
  assert.match(validateNewEvent({ ...base, title: ' ' }, now) ?? '', /title/);
  assert.match(validateNewEvent({ ...base, place: null }, now) ?? '', /place/);
  assert.match(validateNewEvent({ ...base, endsAt: at(27, 17) }, now) ?? '', /end after/);
  assert.match(validateNewEvent({ ...base, startsAt: at(20, 18), endsAt: at(20, 19) }, now) ?? '', /passed/);
  const next = nextWeekEvent(base, 'k2');
  // Crosses the Nov 1 clock change and stays at 6 PM local.
  assert.equal(next.startsAt, new Date(2026, 10, 3, 18).toISOString());
  assert.equal(new Date(next.startsAt).getHours(), 18);
  assert.equal(next.place?.label, 'Coal Creek Trail');
  assert.equal(next.key, 'k2');
});

test('share text lists upcoming events with links, then the #tags', () => {
  const point = (id: string, title: string, day: number, extra: Record<string, unknown> = {}) => ({
    ...ev(id, day, 18),
    title,
    description: '',
    tags: [],
    visibility: 'public' as const,
    venue: 'Erie Town Hall',
    latitude: 40,
    longitude: -105,
    isLiveNow: false,
    coverPhotoUri: null,
    requiresApproval: false,
    maxAttendance: null,
    locationPrivacy: null,
    beaconRadius: null,
    invites: [],
    synced: true,
    createdAt: now.toISOString(),
    ...extra,
  });
  const text = campaignShareMessage(
    { name: 'Dylan for 2026', description: 'Meet the candidate', tags: ['#VoteForDylan'] },
    [
      point('old', 'Kickoff', 20),
      point('a', 'Town hall', 25),
      point('b', 'Coffee chat', 26, { locationPrivacy: { level: 'neighborhood', regionName: 'Old Town' } }),
    ],
    now,
  );
  const lines = text.split('\n');
  assert.equal(lines[0], 'Dylan for 2026');
  assert.equal(lines[1], '3 events · Oct 20 – Oct 26');
  assert.equal(lines[2], 'Meet the candidate');
  assert.ok(!text.includes('Kickoff'), 'ended events are left out');
  assert.match(text, /• Town hall: Sun, Oct 25 · 6:00 PM – 8:00 PM · Erie Town Hall\n  https:\/\/proxipoint\.app\/p\/a/);
  assert.match(text, /Coffee chat: .* · Somewhere in Old Town/, 'privacy areas stay private');
  assert.equal(lines[lines.length - 1], '#VoteForDylan');
});
