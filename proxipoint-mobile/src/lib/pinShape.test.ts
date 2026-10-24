import assert from 'node:assert/strict';
import { test } from 'node:test';
import { teardropPath } from './pinShape';

test('teardrop: tip, tangent points on the circle, big arc over the top', () => {
  const path = teardropPath(12, 12, 10, 29);
  assert.equal(path, 'M12 29L20.09 17.88A10 10 0 1 0 3.91 17.88Z');
  // Tangent points sit on the circle.
  const [x, y] = [20.09, 17.88];
  assert.ok(Math.abs(Math.hypot(x - 12, y - 12) - 10) < 0.02);
});

test('teardrop with no room for a tip falls back to a circle', () => {
  assert.match(teardropPath(12, 12, 10, 20), /^M2 12A10 10 0 1 0 22 12A10 10 0 1 0 2 12Z$/);
});
