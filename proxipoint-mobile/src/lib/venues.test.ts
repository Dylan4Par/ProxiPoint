import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  claimBlocker,
  claimFormProblem,
  claimMethod,
  inferVenueKind,
  splitVenueEvents,
  venueInfo,
  venueKey,
  websiteDomain,
  type VenueKind,
} from './venues';

// Same cases as ingest's internal/venuekind/testdata/cases.json: keep the two in step.
const CASES: Array<[string, VenueKind]> = [
  ["Red Rocks Amphitheatre", "amphitheater"],
  ["Ball Arena", "arena"],
  ["Twenty Ninth Street Mall", "outdoor_mall"],
  ["Outlets at Castle Rock", "outdoor_mall"],
  ["Boulder Farmers Market", "market"],
  ["Avery Brewing Co.", "brewery"],
  ["Bootstrap Brewing", "brewery"],
  ["Settembre Cellars", "winery"],
  ["Erie Community Library", "library"],
  ["Erie Community Pantry", "community_center"],
  ["Erie Community Park", "park"],
  ["Coal Creek Trail", "trail"],
  ["Mesa Trailhead", "trail"],
  ["Central Park Plaza", "plaza"],
  ["Pearl Street Commons", "plaza"],
  ["Meadow Park Courts", "park"],
  ["Chautauqua Park", "park"],
  ["Museum of Boulder", "museum"],
  ["Dairy Arts Center", "gallery"],
  ["Boulder Theater", "theater"],
  ["eTown Hall", "music_venue"],
  ["The Rusty Anchor Bar", "bar"],
  ["Dark Horse Tavern", "bar"],
  ["Meeple Caf\u00e9", "cafe"],
  ["Laughing Goat Coffee", "cafe"],
  ["Smoke & Spoke BBQ", "restaurant"],
  ["Pizzeria Locale", "restaurant"],
  ["St. Aidan's Church", "church"],
  ["CU Boulder Campus", "school"],
  ["Movement Climbing", "gym"],
  ["Hotel Boulderado", "hotel"],
  ["Boulder Book Store", "shop"],
  ["The Brickhouse", "venue"],
  ["Briggs St & Main St", "venue"],
];

test('venue kinds from names match the server', () => {
  for (const [name, kind] of CASES) assert.equal(inferVenueKind(name), kind, name);
});

test('venue info: places keep their kind; parks are public spaces; blocks are not claimable', () => {
  assert.deepEqual(venueInfo({ name: 'Meadow Park Courts', kind: 'park' }), { kind: 'park', label: 'Park', publicSpace: true, claimable: true });
  assert.equal(venueInfo({ name: 'Erie Community Pantry', kind: 'venue' }).label, 'Community center');
  assert.equal(venueInfo({ name: 'Briggs St & Main St', kind: 'intersection' }).claimable, false);
  assert.equal(venueInfo({ name: 'Whatever', kind: 'venue', venueKind: 'amphitheater' }).label, 'Amphitheater');
  assert.equal(venueInfo({ name: 'Chautauqua Park', kind: 'venue', publicSpace: false }).publicSpace, false);
});

test('upcoming soonest first; past = ended in the last 30 days, newest first', () => {
  const now = Date.parse('2026-11-02T20:00:00Z');
  const at = (h: number) => new Date(now + h * 3600000).toISOString();
  const nodes = [
    { id: 'later', startsAt: at(48), endsAt: at(50) },
    { id: 'now', startsAt: at(-1), endsAt: at(1) },
    { id: 'yesterday', startsAt: at(-24), endsAt: at(-22) },
    { id: 'last-week', startsAt: at(-24 * 7), endsAt: at(-24 * 7 + 2) },
    { id: 'old', startsAt: at(-24 * 40), endsAt: at(-24 * 40 + 2) },
  ];
  const { upcoming, past } = splitVenueEvents(nodes, now);
  assert.deepEqual(upcoming.map((n) => n.id), ['now', 'later']);
  assert.deepEqual(past.map((n) => n.id), ['yesterday', 'last-week']);
});

test('claims: business domain email vs personal email', () => {
  assert.equal(websiteDomain('https://www.etown.org/events'), 'etown.org');
  assert.deepEqual(claimMethod('manager@etown.org', 'https://etown.org'), { method: 'email_domain', domainMatches: true });
  assert.deepEqual(claimMethod('sam@events.etown.org', 'etown.org'), { method: 'email_domain', domainMatches: true });
  assert.deepEqual(claimMethod('sam@gmail.com', 'https://etown.org'), { method: 'manual', domainMatches: false });
  assert.deepEqual(claimMethod('sam@otherbiz.com', 'https://etown.org'), { method: 'manual', domainMatches: false });
  assert.deepEqual(claimMethod('manager@eriepantry.org', null), { method: 'email_domain', domainMatches: false });

  const form = { role: 'owner' as const, fullName: 'Sam Smith', workEmail: 'manager@eriepantry.org', businessPhone: '', proofNote: '' };
  assert.equal(claimFormProblem(form), null);
  assert.match(claimFormProblem({ ...form, role: null }) ?? '', /role/);
  assert.match(claimFormProblem({ ...form, workEmail: 'sam@gmail.com' }) ?? '', /personal email/);
  assert.equal(claimFormProblem({ ...form, workEmail: 'sam@gmail.com', businessPhone: '(303) 555-0100' }), null);
});

test('claim guardrails: 48-hour accounts, one claim in review at a time', () => {
  const now = Date.parse('2026-11-02T20:00:00Z');
  const key = venueKey({ name: 'Erie Community Pantry' });
  assert.match(claimBlocker({ accountCreatedAt: new Date(now - 3600000).toISOString(), myPendingVenueKeys: [], venueKey: key, now }) ?? '', /48 hours/);
  assert.equal(claimBlocker({ accountCreatedAt: new Date(now - 72 * 3600000).toISOString(), myPendingVenueKeys: [], venueKey: key, now }), null);
  assert.match(claimBlocker({ myPendingVenueKeys: ['name:other'], venueKey: key, now }) ?? '', /already have a claim/);
  assert.equal(claimBlocker({ myPendingVenueKeys: ['name:other'], venueKey: key, businessOperator: true, now }), null);
  assert.equal(venueKey({ name: 'eTown Hall', venueId: 'abc' }), 'id:abc');
});
