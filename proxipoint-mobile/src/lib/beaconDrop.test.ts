import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MAX_BEACON_CHANNELS,
  assignedTags,
  eventMatchesMapFilter,
  presentAssignedTag,
  toggleChannel,
} from './beaconDrop';

test('channels toggle in selection order up to three', () => {
  let selected: string[] = [];
  selected = toggleChannel(selected, '#LiveMusic').selected;
  selected = toggleChannel(selected, '#FoodTrucks').selected;
  selected = toggleChannel(selected, '#ArtWalk').selected;
  assert.deepEqual(selected, ['#LiveMusic', '#FoodTrucks', '#ArtWalk']);

  const blocked = toggleChannel(selected, '#Dancing');
  assert.equal(blocked.rejected, true);
  assert.deepEqual(blocked.selected, selected);

  const removed = toggleChannel(selected, '#FoodTrucks');
  assert.equal(removed.rejected, false);
  assert.deepEqual(removed.selected, ['#LiveMusic', '#ArtWalk']);
  assert.equal(MAX_BEACON_CHANNELS, 3);
});

test('All is not a beacon channel', () => {
  const result = toggleChannel(['#LiveMusic'], 'All');
  assert.equal(result.rejected, true);
  assert.deepEqual(result.selected, ['#LiveMusic']);
});

test('All filter presents only the first assigned tag', () => {
  const tags = ['#LiveMusic', '#FoodTrucks', '#ArtWalk'];
  assert.equal(presentAssignedTag(tags, 'All'), '#LiveMusic');
  assert.equal(presentAssignedTag(tags, 'All').includes(' '), false);
});

test('a specific map filter presents that channel when the beacon has it', () => {
  const tags = ['#LiveMusic', '#FoodTrucks', '#ArtWalk'];
  assert.equal(presentAssignedTag(tags, '#ArtWalk'), '#ArtWalk');
  assert.equal(eventMatchesMapFilter(tags, '#FoodTrucks'), true);
  assert.equal(eventMatchesMapFilter(tags, '#Pickleball'), false);
  assert.equal(eventMatchesMapFilter(tags, 'All'), true);
});

test('assigned tags fall back to the primary tag and drop extras past three', () => {
  assert.deepEqual(assignedTags(undefined, '#TechMeetup'), ['#TechMeetup']);
  assert.deepEqual(
    assignedTags(['#LiveMusic', '#LiveMusic', '#FoodTrucks', '#ArtWalk', '#Dancing']),
    ['#LiveMusic', '#FoodTrucks', '#ArtWalk'],
  );
});
