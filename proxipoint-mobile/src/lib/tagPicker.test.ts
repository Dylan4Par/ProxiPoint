import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addTag, myTagSuggestions, removeTag, selectedTags } from './tagInput';

test('chips add and remove through the "#A, #B" value', () => {
  assert.deepEqual(selectedTags('#Jazz, #jazz, Yoga #'), ['Jazz', 'Yoga']);
  assert.equal(addTag('', '#Yoga'), '#Yoga');
  assert.equal(addTag('#Yoga', 'yoga'), '#Yoga', 'no case-insensitive repeats');
  assert.equal(addTag('#Yoga', 'Happy Hour!'), '#Yoga, #HappyHour', 'spelled the list’s way');
  assert.equal(addTag('#Jazz, #Yoga', 'Hiking', 2), '#Jazz, #Yoga', 'limit');
  assert.equal(removeTag('#Yoga, #Jazz', '#jazz'), '#Yoga');
});

test('only tags on the list can be added; old spellings map onto it', () => {
  assert.equal(addTag('#Yoga', '#MadeUpTag'), '#Yoga');
  assert.equal(addTag('', '#TacoTuesday'), '#Tacos');
});

test('your tags: most-used on your Drops first, then recent, then MY #TAGS (listed tags only)', () => {
  const drops = [
    { tags: ['#ArtWalk'], createdAt: '2026-10-01T00:00:00Z' },
    { tags: ['#Volunteering', '#ArtWalk'], createdAt: '2026-10-10T00:00:00Z' },
    { tags: ['#HappyHour'], createdAt: '2026-10-20T00:00:00Z' },
  ];
  assert.deepEqual(myTagSuggestions(['#Yoga', '#artwalk', '#NotATag'], drops), ['ArtWalk', 'HappyHour', 'Volunteer', 'Yoga']);
  assert.deepEqual(myTagSuggestions(['#Yoga', '#Jazz'], []), ['Yoga', 'Jazz']);
});
