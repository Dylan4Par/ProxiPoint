import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  authErrorMessage,
  cleanHandle,
  handleProblem,
  isValidEmail,
  isValidPassword,
  passwordChecks,
  passwordStrength,
  suggestHandle,
  toggleInterest,
  STARTER_INTERESTS,
} from './authForm';

test('emails: loose shape check, trimmed and lower-cased', () => {
  assert.equal(isValidEmail(' Sam@Example.com '), true);
  assert.equal(isValidEmail('sam@example'), false);
  assert.equal(isValidEmail('sam example@x.com'), false);
  assert.equal(isValidEmail(''), false);
});

test('passwords: length, a letter, a number or symbol, not your email', () => {
  assert.equal(isValidPassword('short1'), false);
  assert.equal(isValidPassword('longenoughpassword'), false); // no number or symbol
  assert.equal(isValidPassword('trailhead-2026'), true);
  assert.equal(isValidPassword('samrivera2026', 'samrivera@example.com'), false);
  assert.deepEqual(
    passwordChecks('', 'sam@x.com').map((c) => c.ok),
    [false, false, false, true],
  );
});

test('password strength meter', () => {
  assert.equal(passwordStrength('trailhead1'), 'weak');
  assert.equal(passwordStrength('trailhead-26'), 'okay');
  assert.equal(passwordStrength('Trailhead-at-Dawn-26'), 'strong');
});

test('handles: cleaned, length, reserved', () => {
  assert.equal(cleanHandle('@Sam Rivera!'), 'samrivera');
  assert.equal(handleProblem('ab'), 'At least 3 characters');
  assert.equal(handleProblem('_sam'), 'Start with a letter or number');
  assert.equal(handleProblem('sam__r'), 'No double _ or -');
  assert.equal(handleProblem('Call-Sign'), 'That one’s reserved');
  assert.equal(handleProblem('ProxiPoint'), 'That one’s reserved');
  assert.equal(handleProblem('@LocalRadar'), 'That one’s reserved');
  assert.equal(handleProblem('sam_rivera'), null);
});

test('suggested handle from the name, else the email', () => {
  assert.equal(suggestHandle('Sam Rivera'), 'samrivera');
  assert.equal(suggestHandle('Jo', 'jo.martinez@example.com'), 'jomartinez');
  assert.equal(suggestHandle('', ''), '');
});

test('interests toggle and stop at the limit', () => {
  assert.deepEqual(toggleInterest([], '#Hiking', 2), ['#Hiking']);
  assert.deepEqual(toggleInterest(['#Hiking'], '#hiking', 2), []);
  assert.deepEqual(toggleInterest(['#A', '#B'], '#C', 2), ['#A', '#B']);
});

test('sign-in errors never say whether the email exists', () => {
  assert.equal(authErrorMessage('invalid_credentials'), 'That email and password don’t match.');
});

test('the interests step offers the requested tags first, with no repeats', () => {
  assert.deepEqual(STARTER_INTERESTS.slice(0, 13), [
    '#KidFriendly', '#Faith', '#Brewery', '#Crafts', '#Entertainment', '#Events', '#Fitness',
    '#BoardGames', '#HappyHour', '#Music', '#OpenHouse', '#TechMeetup', '#Trivia',
  ]);
  const keys = STARTER_INTERESTS.map((tag) => tag.toLowerCase());
  assert.equal(new Set(keys).size, keys.length);
});
