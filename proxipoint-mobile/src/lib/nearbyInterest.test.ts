import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  MIN_SHOWN,
  countInterested,
  hereCountNow,
  hereLabel,
  interestCell,
  interestLine,
  roundedCount,
  samplePeople,
  topInterest,
  type InterestMember,
} from './nearbyInterest';

const ERIE = { latitude: 40.0617, longitude: -105.0383 };

test('people count from a ~1 km cell, never their spot', () => {
  const cell = interestCell(40.06171, -105.03829);
  assert.deepEqual(cell, { latitude: 40.065, longitude: -105.035 });
  // Two people a few hundred meters apart in the same cell look identical.
  assert.deepEqual(interestCell(40.0601, -105.0399), cell);
});

test('counts only the #tag, within the radius', () => {
  const members: InterestMember[] = [
    { ...interestCell(40.06, -105.04), tags: ['#Pickleball'] },
    { ...interestCell(40.06, -105.04), tags: ['pickleball', '#Hiking'] },
    { ...interestCell(40.5, -105.04), tags: ['#Pickleball'] }, // ~49 km away
    { ...interestCell(40.06, -105.04), tags: ['#Hiking'] },
  ];
  assert.equal(countInterested(members, '#Pickleball', ERIE), 2);
  assert.equal(countInterested(members, 'PICKLEBALL', ERIE, 100000), 3);
  assert.deepEqual(topInterest(members, ['#Hiking', '#Pickleball', '#Jazz'], ERIE), { tag: '#Hiking', count: 2 });
});

test('small numbers are never shown; others are rounded down', () => {
  assert.equal(roundedCount(MIN_SHOWN - 1), null);
  assert.equal(roundedCount(0), null);
  assert.deepEqual([10, 14, 23, 49, 57, 99, 140, 1234].map(roundedCount), ['10+', '10+', '20+', '45+', '50+', '90+', '100+', '1,200+']);
  assert.equal(interestLine(23, 'Pickleball', 5000), '20+ people into #Pickleball within 5 km');
  assert.equal(interestLine(3, '#Pickleball'), null);
});

test('the sample crowd is fixed and includes a tag too small to show', () => {
  const a = samplePeople(ERIE);
  const b = samplePeople(ERIE);
  assert.deepEqual(a, b);
  assert.ok(countInterested(a, '#LiveMusic', ERIE, 10000) >= MIN_SHOWN);
  assert.equal(roundedCount(countInterested(a, '#TechMeetup', ERIE, 5000)), null);
});

test('"I\'m here" only counts while the Point is live, and never names anyone', () => {
  assert.equal(hereCountNow(4, true, true), 5);
  assert.equal(hereCountNow(4, true, false), 0); // ended: switched off for everyone
  assert.equal(hereLabel(hereCountNow(0, true, true)), '1 person here now');
  assert.equal(hereLabel(7), '7 here now');
  assert.equal(hereLabel(0), null);
});
