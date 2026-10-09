import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  APPEARANCE_STORAGE_KEY,
  appearancePalette,
  readAppearanceMode,
  writeAppearanceMode,
} from './appearance';

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000;
}

test('night stays the default tactical palette', () => {
  const colors = appearancePalette('night');
  assert.equal(colors.map, '#0a1120');
  assert.equal(colors.screen, '#070b13');
  assert.equal(colors.statusBar, 'light-content');
  assert.ok(luminance(colors.screen) < 40);
  assert.ok(luminance(colors.text) > 200);
});

test('day uses light surfaces and dark text', () => {
  const colors = appearancePalette('day');
  assert.equal(colors.statusBar, 'dark-content');
  assert.ok(luminance(colors.screen) > 200);
  assert.ok(luminance(colors.map) > 180);
  assert.ok(luminance(colors.text) < 40);
  assert.notEqual(colors.map, appearancePalette('night').map);
});

test('appearance mode persists and falls back to night', () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value);
    },
  };

  assert.equal(readAppearanceMode(storage), 'night');
  writeAppearanceMode('day', storage);
  assert.equal(saved.get(APPEARANCE_STORAGE_KEY), 'day');
  assert.equal(readAppearanceMode(storage), 'day');
  saved.set(APPEARANCE_STORAGE_KEY, 'blue');
  assert.equal(readAppearanceMode(storage), 'night');
});
