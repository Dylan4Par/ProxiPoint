import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directionsUrl, eventDetailsText, eventSourceUrl, placeSourceUrl } from './eventDetail';

test('directions open Google Maps for the pin', () => {
  assert.equal(
    directionsUrl(40.017458, -105.283779, 'walk'),
    'https://www.google.com/maps/dir/?api=1&destination=40.017458,-105.283779&travelmode=walking',
  );
  assert.equal(
    directionsUrl(40.02, -105.2, 'drive'),
    'https://www.google.com/maps/dir/?api=1&destination=40.020000,-105.200000&travelmode=driving',
  );
  assert.equal(directionsUrl(Number.NaN, -105), '');
});

test('a missing source falls back to a Google Maps search for the venue', () => {
  assert.equal(
    placeSourceUrl('The Rusty Anchor', 40.017458, -105.283779),
    'https://www.google.com/maps/search/?api=1&query=The%20Rusty%20Anchor%4040.017458%2C-105.283779',
  );
  assert.equal(
    eventSourceUrl({
      title: 'Live set',
      venue: 'The Rusty Anchor',
      latitude: 40.017458,
      longitude: -105.283779,
      sourceUrl: 'https://www.google.com/maps/search/?api=1&query=The+Rusty+Anchor+Boulder',
    }),
    'https://www.google.com/maps/search/?api=1&query=The+Rusty+Anchor+Boulder',
  );
});

test('event details use the written copy or a summary of the drop', () => {
  assert.equal(
    eventDetailsText({
      title: 'Live set',
      venue: 'The Rusty Anchor',
      latitude: 40,
      longitude: -105,
      details: 'Doors are open.',
    }),
    'Doors are open.',
  );
  assert.equal(
    eventDetailsText({
      title: 'Porch set',
      venue: 'Pearl Street',
      latitude: 40,
      longitude: -105,
      hostName: 'Ranger-F0A5ACCF',
      status: 'LIVE NOW',
      regionName: 'Downtown Boulder',
      visibility: 'public',
      tags: ['#LiveMusic'],
    }),
    'Porch set at Pearl Street. Hosted by Ranger-F0A5ACCF. LIVE NOW. Downtown Boulder. This drop is public. Channels: #LiveMusic.',
  );
});
