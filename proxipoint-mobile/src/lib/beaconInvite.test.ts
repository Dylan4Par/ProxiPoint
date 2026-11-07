import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LINKED_FACEBOOK_ACCOUNTS,
  addEmailInvite,
  addPhoneInvite,
  addProxiPointInvite,
  inviteSummary,
  removeInvite,
  toggleFacebookInvite,
} from './beaconInvite';

test('a linked Facebook account can be invited and removed', () => {
  const account = LINKED_FACEBOOK_ACCOUNTS[0];
  const added = toggleFacebookInvite([], account.id);
  assert.equal(added.error, '');
  assert.deepEqual(added.invites, [{ kind: 'facebook', id: account.id, label: account.label }]);

  const removed = toggleFacebookInvite(added.invites, account.id);
  assert.deepEqual(removed.invites, []);
  assert.equal(toggleFacebookInvite([], 'fb-missing').error.length > 0, true);
});

test('a ProxiPoint handle is normalized and not invited twice', () => {
  const added = addProxiPointInvite([], ' @Ranger-7 ');
  assert.equal(added.error, '');
  assert.equal(added.invites[0].label, '@ranger-7');

  const duplicate = addProxiPointInvite(added.invites, 'ranger-7');
  assert.equal(duplicate.invites.length, 1);
  assert.equal(duplicate.error.length > 0, true);
  assert.equal(addProxiPointInvite([], 'a').error.length > 0, true);
});

test('a phone number needs at least 10 digits', () => {
  const added = addPhoneInvite([], '(303) 555-0148');
  assert.equal(added.error, '');
  assert.equal(added.invites[0].kind, 'phone');
  assert.equal(added.invites[0].id, '3035550148');
  assert.equal(added.invites[0].label, '(303) 555-0148');

  assert.equal(addPhoneInvite([], '555-0148').error.length > 0, true);
  assert.equal(addPhoneInvite(added.invites, '303.555.0148').error.length > 0, true);
  assert.deepEqual(removeInvite(added.invites, added.invites[0].id), []);
});

test('the invite summary names one guest and counts the rest', () => {
  assert.equal(inviteSummary([]), '');
  assert.equal(inviteSummary([{ kind: 'facebook', id: 'fb-1', label: 'Maya Chen' }]), 'Invited Maya Chen');
  assert.equal(
    inviteSummary([
      { kind: 'facebook', id: 'fb-1', label: 'Maya Chen' },
      { kind: 'phone', id: '3035550148', label: '3035550148' },
    ]),
    'Invited 2',
  );
});

test('an email invite is checked, lower-cased and not added twice', () => {
  const added = addEmailInvite([], '  Sam@Example.com ');
  assert.deepEqual(added.invites, [{ kind: 'email', id: 'sam@example.com', label: 'sam@example.com' }]);
  assert.equal(addEmailInvite(added.invites, 'SAM@example.com').error, 'That email is already invited.');
  for (const bad of ['sam', 'sam@', 'sam@example', 'sam @example.com', '@example.com']) {
    assert.ok(addEmailInvite([], bad).error, bad);
  }
});
