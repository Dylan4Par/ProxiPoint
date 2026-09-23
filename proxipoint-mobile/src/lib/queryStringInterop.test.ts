import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);

test('expo-router can stringify route params through query-string', () => {
  const imported = importStar(require('query-string') as Record<string, unknown>);
  const stringify = imported.stringify;
  assert.equal(typeof stringify, 'function');
  assert.equal(
    stringify({ focusLat: '37.7', focusLon: '-122.4', focusId: 'delta' }, { sort: false }),
    'focusLat=37.7&focusLon=-122.4&focusId=delta',
  );
  assert.equal(
    stringify(
      { focusId: undefined, focusLat: undefined, focusLon: undefined, focusNonce: undefined },
      { sort: false },
    ),
    '',
  );
});

function importStar(mod: Record<string, unknown>) {
  if (mod && mod.__esModule) return mod;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(mod)) {
    if (key !== 'default') result[key] = mod[key];
  }
  result.default = mod;
  return result;
}
