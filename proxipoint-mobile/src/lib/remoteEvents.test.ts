import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCALRADAR_HANDLE } from './aggregated';
import { isRemoteNodeId, mergeRemoteNodes, parseEventsResponse, photoFields, remoteEventToNode, timingStatus, type ApiEvent } from './remoteEvents';

const scraped: ApiEvent = {
  id: '6f1c0e1e-0000-4000-8000-000000000001',
  title: 'eTown Presents Nolan Gasser & The Mighty Mighty',
  description: 'Why You Like It!',
  starts_at: '2026-11-05T02:00:00Z',
  ends_at: '2026-11-05T04:00:00Z',
  status: 'scheduled',
  source: 'external',
  host_handle: 'localradar',
  url: 'https://events.humanitix.com/nolan-gasser',
  tags: ['#LiveMusic', '#NotOnTheList'],
  venue: { id: 'v1', name: 'eTown Hall', handle: 'etownhall', claim_status: 'ghost', address: '1535 Spruce St' },
  location: { latitude: 40.0192, longitude: -105.2767, precision: 'exact' },
  distance_m: 21000,
};

test('response parsing keeps good events and drops malformed and cancelled ones', () => {
  const body = {
    events: [
      scraped,
      { ...scraped, id: 'c', status: 'cancelled' },
      { ...scraped, id: 'no-title', title: '  ' },
      { ...scraped, id: 'bad-date', starts_at: 'soon' },
      { ...scraped, id: 'no-point', location: { precision: 'exact' } },
      null,
    ],
  };
  assert.deepEqual(parseEventsResponse(body).map((e) => e.id), [scraped.id]);
  assert.deepEqual(parseEventsResponse({ error: 'nope' }), []);
  assert.deepEqual(parseEventsResponse(null), []);
});

test('an aggregated event becomes a LocalRadar node at its venue', () => {
  const now = new Date('2026-11-01T16:00:00Z');
  const node = remoteEventToNode(scraped, now);
  assert.equal(node.id, `ev:${scraped.id}`);
  assert.ok(isRemoteNodeId(node.id));
  assert.equal(node.source, 'external');
  assert.equal(node.host, LOCALRADAR_HANDLE, 'listed by @LocalRadar, never by the venue');
  assert.equal(node.venue, 'eTown Hall');
  assert.equal(node.venueHandle, '@etownhall');
  assert.deepEqual(node.tags, ['#LiveMusic'], 'only tags from the curated list');
  assert.equal(node.tag, '#LiveMusic');
  assert.equal(node.url, scraped.url);
  assert.equal(node.latitude, 40.0192);
  assert.equal(node.startsAt, '2026-11-05T02:00:00.000Z');
  assert.equal(node.locationPrivacy, null);
  assert.equal(node.isRsvpd, false);
  assert.equal(node.attendeeCount, 0);
});

test('a user event with a hidden spot shows the area, not a venue', () => {
  const node = remoteEventToNode({
    ...scraped,
    source: 'user',
    host_handle: 'nightowl',
    tags: [],
    venue: undefined,
    location: { latitude: 40.03, longitude: -105.25, precision: 'neighborhood', region_name: 'Whittier' },
  });
  assert.equal(node.source, 'user');
  assert.equal(node.host, '@nightowl');
  assert.equal(node.venue, '');
  assert.equal(node.venueHandle, undefined);
  assert.equal(node.tag, '');
  assert.deepEqual(node.locationPrivacy, { level: 'neighborhood', regionName: 'Whittier' });
});

test('timing labels', () => {
  const now = new Date(2026, 10, 1, 12, 0);
  const at = (h: number, m = 0) => new Date(2026, 10, 1, h, m);
  assert.equal(timingStatus(at(11), at(13), now).status, 'LIVE NOW');
  assert.equal(timingStatus(at(12, 20), at(14), now).status, 'Starts in 20m');
  assert.equal(timingStatus(at(14), at(16), now).status, 'Starts in 2h');
  assert.match(timingStatus(at(19), at(21), now).status, /^Today /);
  assert.match(timingStatus(new Date(2026, 10, 2, 19), new Date(2026, 10, 2, 21), now).status, /^Tomorrow /);
  assert.match(timingStatus(new Date(2026, 10, 5, 19), new Date(2026, 10, 5, 21), now).status, /^Thu /);
});

test('a refresh replaces remote nodes, keeps local ones and what you did', () => {
  const local = { ...remoteEventToNode(scraped), id: 'seed-1' };
  const a = remoteEventToNode(scraped);
  const gone = { ...remoteEventToNode({ ...scraped, id: 'gone' }) };
  const current = { [local.id]: local, [a.id]: { ...a, isRsvpd: true, imHere: true, attendeeCount: 1 }, [gone.id]: gone };

  const fresh = remoteEventToNode({ ...scraped, title: 'Renamed' });
  const next = mergeRemoteNodes(current, [fresh]);
  assert.deepEqual(Object.keys(next).sort(), [a.id, 'seed-1'].sort());
  assert.equal(next[a.id].title, 'Renamed');
  assert.equal(next[a.id].isRsvpd, true, 'your RSVP survives a refresh');
  assert.equal(next[a.id].imHere, true);
  assert.equal(next[a.id].attendeeCount, 1);
  assert.equal(next['seed-1'], local);
});

test('a stock photo comes with its credit, and is dropped if incomplete', () => {
  const withPhoto = remoteEventToNode({
    ...scraped,
    cover_photo: {
      provider: 'pexels',
      url: 'https://images.pexels.com/photos/1/m.jpeg',
      large_url: 'https://images.pexels.com/photos/1/l.jpeg',
      page_url: 'https://www.pexels.com/photo/1/',
      photographer: ' Ann Lee ',
      photographer_url: 'https://www.pexels.com/@ann',
    },
  });
  assert.equal(withPhoto.coverPhotoUri, 'https://images.pexels.com/photos/1/m.jpeg');
  assert.equal(withPhoto.coverPhotoLargeUri, 'https://images.pexels.com/photos/1/l.jpeg');
  assert.deepEqual(withPhoto.photoCredit, {
    provider: 'Pexels',
    photographer: 'Ann Lee',
    photographerUrl: 'https://www.pexels.com/@ann',
    pageUrl: 'https://www.pexels.com/photo/1/',
  });

  // No large size: the card size is used everywhere.
  const small = photoFields({ provider: 'pexels', url: 'https://images.pexels.com/a.jpeg', page_url: 'https://www.pexels.com/photo/a/', photographer: 'Bo' });
  assert.equal(small.coverPhotoLargeUri, 'https://images.pexels.com/a.jpeg');
  assert.equal(small.photoCredit?.photographerUrl, null);

  // A photo we can't credit isn't shown.
  for (const bad of [
    { provider: 'pexels', url: 'https://images.pexels.com/a.jpeg', page_url: 'https://www.pexels.com/photo/a/', photographer: '' },
    { provider: 'pexels', url: 'http://insecure.example/a.jpeg', page_url: 'https://www.pexels.com/photo/a/', photographer: 'Bo' },
    { provider: 'pexels', url: 'https://images.pexels.com/a.jpeg', page_url: '', photographer: 'Bo' },
  ]) {
    assert.deepEqual(photoFields(bad), { coverPhotoUri: null, coverPhotoLargeUri: null, photoCredit: null });
  }
  assert.equal(remoteEventToNode(scraped).coverPhotoUri, null);
});
