import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleProblem } from './authForm';
import { attributionLine, countsForAnalytics, isAggregated, venueHandleFor } from './aggregated';

test('aggregated events are flagged and left out of analytics', () => {
  assert.equal(isAggregated({ source: 'external' }), true);
  assert.equal(isAggregated({ source: 'user' }), false);
  assert.equal(isAggregated({}), false);
  assert.equal(countsForAnalytics({ source: 'external' }), false);
  assert.equal(countsForAnalytics({ source: 'user' }), true);
});

test('venue handles come from the name and pass the handle rules', () => {
  const cases: Array<[string, string]> = [
    ['The Rusty Anchor', '@therustyanchor'],
    ['Boulder Creek Pavilion (east lawn)', '@bouldercreekpavilion'],
    ['Meeple Café', '@meeplecafe'],
    ['Code & Coffee', '@codeandcoffee'],
    ['Avery Brewing', '@averybrewing'],
  ];
  for (const [name, handle] of cases) {
    assert.equal(venueHandleFor(name), handle);
    assert.equal(handleProblem(handle), null, handle);
  }
});

test('attribution never says the venue posted it', () => {
  assert.equal(attributionLine('Avery Brewing'), 'Listed by @LocalRadar · at Avery Brewing (unclaimed)');
  assert.equal(attributionLine('Avery Brewing', true), 'Listed by @LocalRadar · at Avery Brewing');
  assert.equal(attributionLine(null), 'Listed by @LocalRadar');
});
