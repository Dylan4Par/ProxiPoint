import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  describeBeaconTiming,
  isBeaconVisibility,
  parseBeaconTags,
  primaryBeaconTag,
  GEOCODE_DEBOUNCE_MS,
  createBeaconDraft,
  formatBroadcastReach,
  durationToHours,
  toBeaconCreatePayload,
  resolveBeaconCreateUrl,
} from './beaconDraft';

test('visibility is the three-way model', () => {
  assert.equal(isBeaconVisibility('private'), true);
  assert.equal(isBeaconVisibility('tag_network'), true);
  assert.equal(isBeaconVisibility('public'), true);
  assert.equal(isBeaconVisibility('true'), false);
  assert.equal(isBeaconVisibility('friends'), false);
});

test('tags collapse into hashtags', () => {
  assert.deepEqual(parseBeaconTags('#TechMeetup, PostGIS  #TechMeetup'), ['#TechMeetup', '#PostGIS']);
  assert.equal(primaryBeaconTag(''), '#Beacon');
});

test('live now and schedule produce distinct status copy', () => {
  assert.deepEqual(
    describeBeaconTiming({ isLiveNow: true, duration: '2 hrs', scheduledStart: '18:00' }),
    { status: 'LIVE NOW', statusColor: '#10b981' },
  );
  assert.deepEqual(
    describeBeaconTiming({ isLiveNow: false, duration: '4 hrs', scheduledStart: '18:00' }),
    { status: 'Starts 18:00', statusColor: '#38bdf8' },
  );
});

test('createBeaconDraft keeps the selected tier radius', () => {
  const draft = createBeaconDraft({
    title: '  GIS Meetup  ',
    tags: '#TechMeetup',
    visibility: 'public',
    venue: 'Pearl St & Broadway',
    latitude: 40.0179,
    longitude: -105.2789,
    isLiveNow: true,
    duration: '2 hrs',
    scheduledStart: '18:00',
    tierLevel: 'neighborhood',
  });
  assert.equal(draft.title, 'GIS Meetup');
  assert.equal(draft.tierLevel, 'neighborhood');
  assert.equal(draft.radiusMeters, 1500);
  assert.equal(
    formatBroadcastReach('#TechMeetup', '1.5km'),
    '↳ Broadcasting to #TechMeetup trackers within a 1.5km radius.',
  );
  assert.match(formatBroadcastReach('', '300m'), /#Network/);
});

test('geocode autocomplete waits 300ms', () => {
  assert.equal(GEOCODE_DEBOUNCE_MS, 300);
});

test('create payload maps channels, radius, and duration hours', () => {
  const draft = createBeaconDraft({
    title: 'Boulder Tech & GIS Meetup',
    tags: '#TechMeetup, PostGIS',
    visibility: 'tag_network',
    venue: 'Pearl St Mall',
    latitude: 40.0179,
    longitude: -105.2789,
    isLiveNow: true,
    duration: '2 hrs',
    scheduledStart: '18:00',
    tierLevel: 'neighborhood',
  });
  assert.equal(durationToHours('1 hr'), 1);
  assert.equal(durationToHours('4 hrs'), 4);
  assert.equal(durationToHours('All Day'), 24);
  assert.deepEqual(toBeaconCreatePayload(draft), {
    title: 'Boulder Tech & GIS Meetup',
    venue: 'Pearl St Mall',
    channels: ['#TechMeetup', '#PostGIS'],
    latitude: 40.0179,
    longitude: -105.2789,
    radius_meters: 1500,
    visibility: 'tag_network',
    duration_hours: 2,
  });
  assert.equal(resolveBeaconCreateUrl({}), 'http://127.0.0.1:8090/api/v1/beacons');
  assert.equal(
    resolveBeaconCreateUrl({ apiUrl: 'http://10.0.2.2:8080/api/v1/telemetry/ping' }),
    'http://10.0.2.2:8080/api/v1/beacons',
  );
  assert.equal(
    resolveBeaconCreateUrl({ beaconUrl: 'https://events.example/api/v1/beacons', apiUrl: 'http://ignored' }),
    'https://events.example/api/v1/beacons',
  );
});
