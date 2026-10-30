import assert from 'node:assert/strict';
import { test } from 'node:test';
import { displayEventUrl, normalizeEventUrl } from './eventLink';

test('links: https added, junk refused, empty is fine', () => {
  assert.equal(normalizeEventUrl(''), '');
  assert.equal(normalizeEventUrl('  '), '');
  assert.equal(normalizeEventUrl('rustyanchor.com/events'), 'https://rustyanchor.com/events');
  assert.equal(normalizeEventUrl('HTTP://Tickets.Example.com/a?b=1'), 'http://tickets.example.com/a?b=1');
  assert.equal(normalizeEventUrl('javascript:alert(1)'), null);
  assert.equal(normalizeEventUrl('not a link'), null);
  assert.equal(normalizeEventUrl('localhost'), null);
  assert.equal(normalizeEventUrl('ftp://files.example.com'), null);
});

test('display drops the scheme, www and a trailing slash', () => {
  assert.equal(displayEventUrl('https://www.rustyanchor.com/'), 'rustyanchor.com');
  assert.equal(displayEventUrl('https://tickets.example.com/fall-show'), 'tickets.example.com/fall-show');
});
