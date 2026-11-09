import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tileFileName } from './tileFileName';

test('tile file names: stable, file-safe, different per tile', () => {
  const base = 'https://tiles.stadiamaps.com/tiles/outdoors/16/13530/24727@2x.png?api_key=k';
  assert.equal(tileFileName(base), tileFileName(base));
  assert.match(tileFileName(base), /^[0-9a-f]{16}\.png$/);
  const names = new Set<string>();
  for (let x = 13500; x < 13600; x += 1) {
    for (let y = 24700; y < 24800; y += 1) names.add(tileFileName(base.replace('13530/24727', `${x}/${y}`)));
  }
  assert.equal(names.size, 10000, 'no two of 10,000 neighbouring tiles share a name');
  assert.notEqual(tileFileName(base), tileFileName(base.replace('outdoors', 'alidade_smooth_dark')));
});
