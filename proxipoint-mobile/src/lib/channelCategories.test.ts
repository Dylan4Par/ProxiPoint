import test from 'node:test';
import assert from 'node:assert/strict';
import { channelInCategory } from './channelCategories';

test('All matches every channel, even one with no tags', () => {
  assert.equal(channelInCategory(['#TownHall'], 'all'), true);
  assert.equal(channelInCategory(undefined, 'all'), true);
});

test('a channel matches each category one of its tags is in', () => {
  const foodAndMusic = ['#FoodTrucks', '#LiveMusic'];
  assert.equal(channelInCategory(foodAndMusic, 'food'), true);
  assert.equal(channelInCategory(foodAndMusic, 'arts'), true);
  assert.equal(channelInCategory(foodAndMusic, 'tech'), false);
});

test('tags match without the # and regardless of case', () => {
  assert.equal(channelInCategory(['pickleball'], 'sports'), true);
  assert.equal(channelInCategory(['#TECHMEETUP'], 'tech'), true);
});

test('a channel with no matching tags only shows under All', () => {
  assert.equal(channelInCategory(['#TownHall', '#Community'], 'sports'), false);
  assert.equal(channelInCategory([], 'food'), false);
});
