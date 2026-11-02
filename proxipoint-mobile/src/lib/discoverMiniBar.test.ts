import assert from 'node:assert/strict';
import { test } from 'node:test';
import { miniBarContext, shortPlace, shortWhen } from './discoverMiniBar';

test('mini bar context', () => {
  assert.equal(miniBarContext('Boulder, CO', '15 mi', 'Next 3 days'), 'Boulder • 15 mi • 3 days');
  assert.equal(miniBarContext('Erie, CO', null, 'Tomorrow'), 'Erie • Any distance • Tomorrow');
  assert.equal(shortPlace(''), 'Here');
  assert.equal(shortWhen('Nov 4 – Nov 6'), 'Nov 4 – Nov 6');
});
