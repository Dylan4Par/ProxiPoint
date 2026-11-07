import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attendeeSummary, endedSummary, liveDroppedPoints, recentEndedPoints, type DroppedPoint } from './droppedPoint';

const now = new Date(2026, 9, 23, 12, 0);

function point(id: string, startsAt: Date, endsAt: Date, extra: Partial<DroppedPoint> = {}): DroppedPoint {
  return {
    id,
    title: id,
    description: '',
    tags: [],
    visibility: 'public',
    venue: 'Somewhere',
    latitude: 40,
    longitude: -105,
    isLiveNow: false,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    coverPhotoUri: null,
    requiresApproval: false,
    maxAttendance: null,
    locationPrivacy: null,
    beaconRadius: null,
    invites: [],
    synced: true,
    createdAt: startsAt.toISOString(),
    ...extra,
  };
}

const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0);

test('recent events are only ended ones, most recently ended first', () => {
  const drops = [
    point('old', at(10, 18), at(10, 20)),
    point('live', at(23, 11), at(23, 13)),
    point('upcoming', at(24, 18), at(24, 20)),
    point('yesterday', at(22, 18), at(22, 20)),
    point('lastWeek', at(16, 18), at(16, 20)),
    point('justEnded', at(23, 9), at(23, 11)),
  ];
  assert.deepEqual(
    recentEndedPoints(drops, now).map((d) => d.id),
    ['justEnded', 'yesterday', 'lastWeek'],
  );
  assert.equal(recentEndedPoints(drops, now, 10).length, 4);
  assert.deepEqual(recentEndedPoints([], now), []);
});

test('ended summary adds the going count once RSVPs are known', () => {
  const ended = point('a', at(17, 18), at(17, 20));
  assert.equal(endedSummary(ended), 'Ended Sat, Oct 17');
  const withRsvps = {
    ...ended,
    rsvps: [
      { id: '1', label: '@a', status: 'going' as const },
      { id: '2', label: '@b', status: 'going' as const },
      { id: '3', label: '@c', status: 'pending' as const },
    ],
  };
  assert.equal(endedSummary(withRsvps), 'Ended Sat, Oct 17 · 2 went');
});

test('live events are the ones happening now, ending soonest first', () => {
  const drops = [
    point('later', at(23, 10), at(23, 15)),
    point('soon', at(23, 11), at(23, 13)),
    point('ended', at(23, 9), at(23, 11)),
    point('upcoming', at(23, 14), at(23, 16)),
  ];
  assert.deepEqual(
    liveDroppedPoints(drops, now).map((d) => d.id),
    ['soon', 'later'],
  );
});

test('attendee summary counts going, cap and waiting', () => {
  const live = point('a', at(23, 11), at(23, 13));
  assert.equal(attendeeSummary(live), 'No RSVPs yet');
  assert.equal(attendeeSummary({ ...live, rsvps: [] }), 'No RSVPs yet');
  const rsvps = [
    { id: '1', label: '@a', status: 'going' as const },
    { id: '2', label: '@b', status: 'going' as const },
    { id: '3', label: '@c', status: 'pending' as const },
  ];
  assert.equal(attendeeSummary({ ...live, rsvps }), '2 going · 1 waiting');
  assert.equal(attendeeSummary({ ...live, rsvps: rsvps.slice(0, 2), maxAttendance: 20 }), '2 / 20 going');
});

test('recent places: newest first, one per spot', async () => {
  const { recentDropPlaces } = await import('./droppedPoint');
  const p = (id: string, venue: string, lat: number, day: number) => ({
    id,
    venue,
    latitude: lat,
    longitude: -105,
    createdAt: new Date(2026, 9, day).toISOString(),
  });
  const places = recentDropPlaces([
    p('a', 'Erie Town Hall', 40.05, 1),
    p('b', 'Coal Creek Trail (selected on map)', 40.1, 5),
    p('c', 'Erie Town Hall', 40.05, 3),
    p('d', 'Dropped pin', 40.10001, 4), // ~1 m from b
    p('e', 'Library', 40.2, 2),
  ]);
  assert.deepEqual(places.map((x) => x.label), ['Coal Creek Trail', 'Erie Town Hall', 'Library']);
  assert.equal(places[0].latitude, 40.1);
});
