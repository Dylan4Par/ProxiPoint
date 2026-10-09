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
