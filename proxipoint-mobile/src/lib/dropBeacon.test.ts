import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBeaconDraft } from './beaconDraft';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

test('dropping a beacon stores visibility, duration, and survives a feed sync', () => {
  const id = useDiscoveryStore.getState().dropBeacon({
    title: 'GIS Meetup',
    description: 'Bring a laptop.',
    tags: 'TechMeetup, PostGIS',
    visibility: 'tag_network',
    venue: 'Downtown Tech Lab',
    latitude: 40.071,
    longitude: -105.032,
    isLiveNow: false,
    duration: '4 hrs',
    scheduledStart: '18:00',
  });

  const dropped = useDiscoveryStore.getState().nodes[id];
  assert.ok(dropped);
  assert.equal(dropped?.visibility, 'tag_network');
  assert.equal(dropped?.description, 'Bring a laptop.');
  assert.equal(dropped?.duration, '4 hrs');
  assert.equal(dropped?.origin, 'local');
  assert.equal(dropped?.status, 'Starts 18:00');
  assert.equal(dropped?.tag, '#TechMeetup');
  assert.equal(dropped?.isRsvpd, true);
  assert.ok(useDiscoveryStore.getState().tags.includes('#TechMeetup'));
  assert.ok(useDiscoveryStore.getState().tags.includes('#PostGIS'));
  assert.equal(dropped?.tierLevel, 'micro');
  assert.equal(dropped?.radiusMeters, 300);
  assert.deepEqual(dropped?.radii, [300]);
  assert.equal(useDiscoveryStore.getState().selectedNodeId, id);
  assert.deepEqual(useDiscoveryStore.getState().previewGeofence, {
    latitude: 40.071,
    longitude: -105.032,
    radiusMeters: 300,
  });

  useDiscoveryStore.getState().syncProximityNodes(
    [
      {
        id: 'node-remote',
        distance_meters: 120,
        latitude: 40.062,
        longitude: -105.039,
        status: 'online',
        title: 'Remote Node',
      },
    ],
    '2026-10-09T00:00:00Z',
  );

  assert.equal(useDiscoveryStore.getState().nodes[id]?.title, 'GIS Meetup');
  assert.ok(useDiscoveryStore.getState().nodes['node-remote']);
});

test('a persisted beacon keeps the server id and flies to its perimeter', () => {
  const draft = createBeaconDraft({
    title: 'Boulder Tech & GIS Meetup',
    tags: 'TechMeetup PostGIS',
    visibility: 'tag_network',
    venue: 'Pearl St Mall',
    latitude: 40.0179,
    longitude: -105.2789,
    isLiveNow: true,
    duration: '2 hrs',
    scheduledStart: '18:00',
    tierLevel: 'neighborhood',
    radiusMeters: 1500,
  });
  const id = useDiscoveryStore.getState().adoptPersistedBeacon(
    {
      id: 'server-beacon-1',
      title: draft.title,
      venue: draft.venue,
      channels: ['#TechMeetup', '#PostGIS'],
      latitude: draft.latitude,
      longitude: draft.longitude,
      radius_meters: 1500,
      visibility: 'tag_network',
      duration_hours: 2,
    },
    draft,
  );

  assert.equal(id, 'server-beacon-1');
  const saved = useDiscoveryStore.getState().nodes[id];
  assert.equal(saved?.origin, 'local');
  assert.equal(saved?.radiusMeters, 1500);
  assert.deepEqual(saved?.radii, [1500]);
  assert.equal(saved?.tag, '#TechMeetup');
  assert.deepEqual(useDiscoveryStore.getState().previewGeofence, {
    latitude: 40.0179,
    longitude: -105.2789,
    radiusMeters: 1500,
  });
  assert.equal(useDiscoveryStore.getState().selectedNodeId, id);
});
