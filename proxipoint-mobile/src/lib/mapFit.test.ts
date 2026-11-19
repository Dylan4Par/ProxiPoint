import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FIT_PADDING, fitView } from './mapFit';

const zoom = { min: 0.01, max: 3, single: 0.4 };
const view = { width: 412, height: 300 };

test('fits every point inside the room left after the padding', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1000, y: 200 }, { x: 400, y: 900 }];
  const f = fitView(pts, view, zoom)!;
  for (const p of pts) {
    const sx = f.screenX + f.z * (p.x - f.x);
    const sy = f.screenY + f.z * (p.y - f.y);
    assert.ok(sx >= FIT_PADDING.left - 1e-6 && sx <= view.width - FIT_PADDING.right + 1e-6, `x ${sx}`);
    assert.ok(sy >= FIT_PADDING.top - 1e-6 && sy <= view.height - FIT_PADDING.bottom + 1e-6, `y ${sy}`);
  }
});

test('one spot keeps a normal zoom; far-flung points stop at the furthest zoom', () => {
  assert.equal(fitView([{ x: 5, y: 5 }, { x: 5, y: 5 }], view, zoom)!.z, 0.4);
  assert.equal(fitView([{ x: 0, y: 0 }, { x: 1e7, y: 0 }], view, zoom)!.z, 0.01);
  assert.equal(fitView([{ x: 0, y: 0 }, { x: 1, y: 1 }], view, zoom)!.z, 3, 'never closer than the closest zoom');
  assert.equal(fitView([], view, zoom), null);
});
