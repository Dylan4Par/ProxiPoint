import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTagKey, resolveTagAnchor } from './tagIcons';

test('primary channels map to distinct leading badges', () => {
  assert.equal(resolveTagAnchor('#LiveMusic').icon, 'note');
  assert.equal(resolveTagAnchor('#Music').icon, 'note');
  assert.equal(resolveTagAnchor('#Music').accent, '#22d3ee');

  assert.equal(resolveTagAnchor('#TechMeetup').icon, 'terminal');
  assert.equal(resolveTagAnchor('#PostGIS').icon, 'terminal');
  assert.equal(resolveTagAnchor('#TechMeetup').accent, '#38bdf8');

  assert.equal(resolveTagAnchor('#FoodAndDrink').icon, 'flame');
  assert.equal(resolveTagAnchor('#FarmersMarket').icon, 'utensils');
  assert.equal(resolveTagAnchor('#FoodAndDrink').accent, '#f59e0b');
  assert.equal(resolveTagAnchor('#FarmersMarket').accent, '#f59e0b');

  assert.equal(resolveTagAnchor('#Fitness').icon, 'runner');
  assert.equal(resolveTagAnchor('#Outdoor').icon, 'compass');
  assert.equal(resolveTagAnchor('#Fitness').accent, '#34d399');
  assert.equal(resolveTagAnchor('#Outdoor').accent, '#34d399');
});

test('nearby seed aliases stay in the same color families', () => {
  assert.equal(resolveTagAnchor('#FoodTrucks').icon, 'flame');
  assert.equal(resolveTagAnchor('#Pickleball').icon, 'runner');
});

test('unknown tags fall back to the slate beacon', () => {
  const anchor = resolveTagAnchor('#ArtWalk');
  assert.equal(anchor.icon, 'beacon');
  assert.equal(anchor.accent, '#94a3b8');
  assert.equal(anchor.border, '#1e293b');
  assert.equal(anchor.surface, 'rgba(148, 163, 184, 0.12)');
});

test('tag keys ignore the hash, case, and separators', () => {
  assert.equal(normalizeTagKey('  #Live_Music '), 'livemusic');
  assert.equal(resolveTagAnchor('tech-meetup').icon, 'terminal');
  assert.equal(resolveTagAnchor('Food And Drink').icon, 'flame');
});
