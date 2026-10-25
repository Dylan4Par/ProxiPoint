import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addTag, myTagSuggestions, removeTag, selectedTags } from './tagInput';

test('chips add and remove through the "#A, #B" value', () => {
  assert.deepEqual(selectedTags('#Art, #art, Faith #'), ['Art', 'Faith']);
  assert.equal(addTag('', '#Faith'), '#Faith');
  assert.equal(addTag('#Faith', 'faith'), '#Faith', 'no case-insensitive repeats');
  assert.equal(addTag('#Faith', 'Happy Hour!'), '#Faith, #HappyHour');
  assert.equal(addTag('#A, #B', 'C', 2), '#A, #B', 'limit');
  assert.equal(removeTag('#Faith, #Art', '#art'), '#Faith');
});

test('your tags: most-used on your Drops first, then recent, then MY #TAGS', () => {
  const drops = [
    { tags: ['#Art'], createdAt: '2026-10-01T00:00:00Z' },
    { tags: ['#Volunteering', '#Art'], createdAt: '2026-10-10T00:00:00Z' },
    { tags: ['#HappyHour'], createdAt: '2026-10-20T00:00:00Z' },
  ];
  assert.deepEqual(myTagSuggestions(['#Faith', '#art'], drops), ['Art', 'HappyHour', 'Volunteering', 'Faith']);
  assert.deepEqual(myTagSuggestions(['#Faith', '#Art'], []), ['Faith', 'Art']);
});
