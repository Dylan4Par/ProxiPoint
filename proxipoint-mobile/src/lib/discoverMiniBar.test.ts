import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shortPlace } from './discoverMiniBar';

test('mini bar shows the city', () => {
  assert.equal(shortPlace('Boulder, CO'), 'Boulder');
  assert.equal(shortPlace('Erie'), 'Erie');
  assert.equal(shortPlace(''), 'Here');
});
