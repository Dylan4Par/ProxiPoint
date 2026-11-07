import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cityChannelId, planAutoChannels, tagWords } from './autoChannels';
import type { Channel } from './channels';

const NOW = new Date('2026-10-18T18:00:00Z').getTime();
const later = (minutes: number) => new Date(NOW + minutes * 60000).toISOString();

const existing: Channel[] = [
  {
    id: 'frontrange-live',
    name: 'Front Range Live Music',
    handle: 'c/frontrangelive',
    description: '',
    tags: ['#LiveMusic', '#Jazz'],
    memberCount: 1240,
    joined: true,
  },
];

const nodes = [
  { id: 'a', tags: ['#LiveMusic'], endsAt: later(60) }, // covered by an existing channel
  { id: 'b', tags: ['#VinylNight', '#Records'], endsAt: later(60) },
  { id: 'c', tags: ['#BoardGames'], endsAt: later(60) },
  { id: 'd', tags: ['#BoardGames'], endsAt: later(120) },
  { id: 'e', tags: ['#Kayaking'], endsAt: later(-5) }, // ended: ignored
];

test('tagWords splits camel case and underscores', () => {
  assert.equal(tagWords('#LiveMusic'), 'Live Music');
  assert.equal(tagWords('#BBQNight'), 'BBQ Night');
  assert.equal(tagWords('#open_mic'), 'open mic');
});

test('plans a city channel plus one per uncovered main #tag, busiest first', () => {
  const planned = planAutoChannels(existing, nodes, 'Erie', NOW);
  assert.deepEqual(
    planned.map((c) => [c.id, c.name, c.handle]),
    [
      ['auto-erie-local', 'Erie Local', 'c/erielocal'],
      ['auto-erie-boardgames', 'Erie Board Games', 'c/erieboardgames'],
      ['auto-erie-vinylnight', 'Erie Vinyl Night', 'c/erievinylnight'],
    ],
  );
  assert.ok(planned.every((c) => c.auto && c.owner === null && c.memberCount === 0 && !c.joined));
  assert.deepEqual(planned[1].tags, ['#BoardGames']);
});

test('nothing is planned twice, and a city name is required', () => {
  const first = planAutoChannels(existing, nodes, 'Erie', NOW);
  assert.deepEqual(planAutoChannels([...existing, ...first], nodes, 'Erie', NOW), []);
  assert.deepEqual(planAutoChannels(existing, nodes, '  ', NOW), []);
  assert.equal(cityChannelId('Fort Collins'), 'auto-fortcollins-local');
});
