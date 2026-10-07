import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DRAWER_COLLAPSED,
  DRAWER_PEEK,
  expandedDrawerHeight,
  resolveDrawerSnap,
} from './drawerSnap';

const WINDOW = 800;

test('drawer stops are collapsed 74, peek 215, and 48% expanded', () => {
  assert.equal(DRAWER_COLLAPSED, 74);
  assert.equal(DRAWER_PEEK, 215);
  assert.equal(expandedDrawerHeight(WINDOW), 384);
  assert.equal(expandedDrawerHeight(1000), 480);
});

test('a slow release settles on the nearest stop', () => {
  assert.equal(resolveDrawerSnap(200, 0, WINDOW), 'peek');
  assert.equal(resolveDrawerSnap(120, 0, WINDOW), 'collapsed');
  assert.equal(resolveDrawerSnap(320, 0, WINDOW), 'expanded');
});

test('a downward flick steps toward a shorter sheet', () => {
  assert.equal(resolveDrawerSnap(360, 1, WINDOW), 'peek');
  assert.equal(resolveDrawerSnap(180, 0.8, WINDOW), 'collapsed');
});

test('an upward flick steps toward a taller sheet', () => {
  assert.equal(resolveDrawerSnap(100, -0.8, WINDOW), 'peek');
  assert.equal(resolveDrawerSnap(250, -1, WINDOW), 'expanded');
});
