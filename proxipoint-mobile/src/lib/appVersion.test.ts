import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appVersionLabel } from './appVersion';

test('version footer', () => {
  assert.equal(appVersionLabel('1.0.0', 42), 'ProxiPoint v1.0.0 (Build 42)');
  assert.equal(appVersionLabel('1.2.3', '7'), 'ProxiPoint v1.2.3 (Build 7)');
  assert.equal(appVersionLabel('1.0.0', null), 'ProxiPoint v1.0.0');
  assert.equal(appVersionLabel(undefined, undefined), 'ProxiPoint version unknown');
});
