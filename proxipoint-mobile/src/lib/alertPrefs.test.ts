import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_ALERT_PREFS, alertRadiusOptions, formatHour, inQuietHours, radiusLabel, readAlertPrefs } from './alertPrefs';

test('quiet hours cross midnight', () => {
  const at = (h: number) => new Date(2026, 9, 27, h, 30);
  const p = DEFAULT_ALERT_PREFS; // 10 PM – 8 AM
  assert.equal(inQuietHours(p, at(23)), true);
  assert.equal(inQuietHours(p, at(3)), true);
  assert.equal(inQuietHours(p, at(8)), false);
  assert.equal(inQuietHours(p, at(15)), false);
  assert.equal(inQuietHours({ ...p, quietOn: false }, at(23)), false);
  assert.equal(inQuietHours({ quietOn: true, quietStart: 13, quietEnd: 15 }, at(14)), true);
});

test('labels and saved values', () => {
  assert.equal(formatHour(22), '10:00 PM');
  assert.equal(formatHour(0), '12:00 AM');
  assert.equal(formatHour(12), '12:00 PM');
  assert.equal(radiusLabel(DEFAULT_ALERT_PREFS.radiusMeters, 'imperial'), '5 miles');
  assert.equal(radiusLabel(DEFAULT_ALERT_PREFS.radiusMeters, 'metric'), '10 km');
  assert.equal(alertRadiusOptions('imperial')[0].label, '1 mile');
  assert.deepEqual(readAlertPrefs(null), DEFAULT_ALERT_PREFS);
  assert.equal(readAlertPrefs({ venues: 'all', quietStart: 99 }).venues, 'all');
  assert.equal(readAlertPrefs({ quietStart: 99 }).quietStart, 22);
});
