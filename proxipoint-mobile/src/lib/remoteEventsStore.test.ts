import assert from 'node:assert/strict';
import { test } from 'node:test';
import { remoteEventToNode, type ApiEvent } from './remoteEvents';
import { useDiscoveryStore } from '../stores/useDiscoveryStore';

const base: ApiEvent = {
  id: 'a',
  title: 'eTown Presents Rapidgrass',
  starts_at: '2026-12-12T02:00:00Z',
  ends_at: '2026-12-12T04:00:00Z',
  status: 'scheduled',
  source: 'external',
  host_handle: 'localradar',
  tags: [],
  venue: { id: 'v', name: 'eTown Hall', handle: 'etownhall', claim_status: 'ghost' },
  location: { latitude: 40.0192, longitude: -105.2767, precision: 'exact' },
};

test('backend events join the samples, get distances, and a refresh replaces them', () => {
  const store = useDiscoveryStore;
  const before = Object.keys(store.getState().nodes).length;

  store.getState().setRemoteEvents([remoteEventToNode(base), remoteEventToNode({ ...base, id: 'b' })], '2026-11-01T16:00:00Z');
  let s = store.getState();
  assert.equal(Object.keys(s.nodes).length, before + 2);
  assert.deepEqual(s.remoteEvents, { status: 'ok', count: 2, loadedAt: '2026-11-01T16:00:00Z', error: null });
  const a = s.nodes['ev:a'];
  // eTown Hall is roughly 21 km from the default location near Erie.
  assert.ok(a.distanceMeters > 15000 && a.distanceMeters < 30000, `distance ${a.distanceMeters}`);
  assert.equal(a.etaMode, 'drive');
  assert.notEqual(a.eta, '');

  s.toggleRsvp('ev:a');
  store.getState().setSelectedEventId('ev:b');
  store.getState().setRemoteEvents([remoteEventToNode({ ...base, title: 'Renamed' })], '2026-11-01T16:10:00Z');
  s = store.getState();
  assert.equal(Object.keys(s.nodes).length, before + 1, 'event b is gone after the refresh');
  assert.equal(s.nodes['ev:a'].title, 'Renamed');
  assert.equal(s.nodes['ev:a'].isRsvpd, true, 'RSVP kept');
  assert.notEqual(s.selectedEventId, 'ev:b', 'selection moves off an event that disappeared');
  assert.ok(s.nodes[s.selectedEventId], 'and lands on one that exists');

  store.getState().setRemoteEventsStatus('error', 'events: HTTP 500');
  assert.equal(store.getState().remoteEvents.status, 'error');
  assert.equal(store.getState().remoteEvents.count, 1, 'last good load is still counted');
  assert.ok(store.getState().nodes['ev:a'], 'and still shown');
});
