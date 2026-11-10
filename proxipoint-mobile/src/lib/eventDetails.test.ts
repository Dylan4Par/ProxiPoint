import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventFacts, formatPrice, priceLabel } from './eventDetails';

test('price chip', () => {
  assert.equal(priceLabel({ price_min: 30, price_max: 30 }), '$30');
  assert.equal(priceLabel({ price_min: 30, price_max: 55 }), 'From $30');
  assert.equal(priceLabel({ price_min: 12.5 }), 'From $12.50');
  assert.equal(priceLabel({ free: true }), 'Free');
  assert.equal(priceLabel({ price_min: 20, price_max: 20, currency: 'EUR' }), '20 EUR');
  assert.equal(priceLabel({}), null);
  assert.equal(formatPrice(5), '$5');
});

test('facts for a 21+ show with door rules', () => {
  const f = eventFacts({
    hook: ' Featuring Nolan Gasser, with The Mighty Mighty. Doors 6:30 PM. ',
    price_min: 30, price_max: 55, currency: 'USD', min_age: 21,
    notices: ['clear_bag', 'id_required', 'unknown'],
  });
  assert.deepEqual(f, {
    priceLabel: 'From $30',
    ageLabel: '21+',
    notices: ['Age 21+ only', 'Valid ID required at door', 'Clear bag policy'],
    hook: 'Featuring Nolan Gasser, with The Mighty Mighty. Doors 6:30 PM.',
    priceMin: 30,
    free: false,
    minAge: 21,
    allAges: false,
  });
});

test('numbers for Discover filters', () => {
  assert.equal(eventFacts({ free: true })?.priceMin, 0);
  assert.equal(eventFacts({ free: true })?.free, true);
  assert.equal(eventFacts({ price_min: 12.5 })?.priceMin, 12.5);
  assert.equal(eventFacts({ all_ages: true })?.allAges, true);
  assert.equal(eventFacts({ all_ages: true })?.priceMin, null, 'no price listed');
});

test('sold out comes first; all ages; nothing to show', () => {
  assert.deepEqual(eventFacts({ all_ages: true, notices: ['cashless', 'sold_out'] })?.notices, ['Sold out', 'Cashless venue']);
  assert.equal(eventFacts({ all_ages: true })?.ageLabel, 'All ages');
  assert.equal(eventFacts({ min_age: 16 }), null, 'only 18 and 21 are shown');
  assert.equal(eventFacts({}), null);
  assert.equal(eventFacts(null), null);
});
