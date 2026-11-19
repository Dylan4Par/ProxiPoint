import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NUDGE_X, NUDGE_Y, absorbIntoMarkers, clusterPins, nudgeOffMarkers } from './postPins';

const pin = (id: string, x: number, y: number) => ({ id, x, y });

test('pins whose bubbles touch merge into one group at their centre', () => {
  const groups = clusterPins([pin('a', 100, 100), pin('b', 110, 104), pin('c', 400, 400)], 1);
  assert.equal(groups.length, 2);
  const pair = groups.find((g) => g.members.length === 2)!;
  assert.equal(pair.key, 'a|b');
  assert.deepEqual([pair.x, pair.y], [105, 102]);
});

test('zooming in splits a group apart again', () => {
  const pins = [pin('a', 100, 100), pin('b', 130, 100)]; // 30 world units apart
  assert.equal(clusterPins(pins, 1).length, 1); // 30px < 46px bubble width
  assert.equal(clusterPins(pins, 2).length, 2); // 60px apart: clear
});

test('chains merge until nothing touches', () => {
  // b+c are closest (25px) and merge (centre 42.5), which still touches a (42.5px), so a joins.
  const groups = clusterPins([pin('a', 0, 0), pin('b', 30, 0), pin('c', 55, 0)], 1);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].members.length, 3);
  // Spread further and the merged pair is clear of c.
  assert.equal(clusterPins([pin('a', 0, 0), pin('b', 40, 0), pin('c', 80, 0)], 1).length, 2);
});

test('a bubble on top of a Point pin moves to its upper-right; clear ones stay put', () => {
  const [onPin, clear] = nudgeOffMarkers(
    clusterPins([pin('venue', 200, 200), pin('park', 600, 600)], 1),
    [{ x: 200, y: 200 }],
    1,
  );
  assert.deepEqual([onPin.dx, onPin.dy], [NUDGE_X, NUDGE_Y]);
  assert.deepEqual([clear.dx, clear.dy], [0, 0]);
});

test('nudge is measured from the bubble to the pin it hits', () => {
  // Bubble spot 10px left and 5px below the pin: lands at the same badge spot beside the pin.
  const [g] = nudgeOffMarkers(clusterPins([pin('p', 190, 205)], 1), [{ x: 200, y: 200 }], 1);
  assert.deepEqual([g.x + g.dx, g.y + g.dy], [200 + NUDGE_X, 200 + NUDGE_Y]);
});

test('a bubble well above a pin is left alone', () => {
  // Spot 80px above the pin: the bubble (34px tall, above its spot) doesn't reach the pin.
  const [g] = nudgeOffMarkers(clusterPins([pin('p', 200, 120)], 1), [{ x: 200, y: 200 }], 1);
  assert.deepEqual([g.dx, g.dy], [0, 0]);
});

test('bubbles on a Point cluster are absorbed into it; others stay', () => {
  const groups = clusterPins([pin('at-venue', 300, 300), pin('elsewhere', 700, 700)], 1);
  const { absorbed, rest } = absorbIntoMarkers(groups, [{ key: 'cl1', x: 300, y: 300 }], 1);
  assert.deepEqual(absorbed.cl1.map((p) => p.id), ['at-venue']);
  assert.deepEqual(rest.map((g) => g.key), ['elsewhere']);
});

test('a grouped bubble hands all its posts to the cluster, nearest cluster wins', () => {
  const groups = clusterPins([pin('a', 300, 300), pin('b', 306, 302)], 1);
  const { absorbed, rest } = absorbIntoMarkers(
    groups,
    [
      { key: 'far', x: 340, y: 300 },
      { key: 'near', x: 305, y: 305 },
    ],
    1,
  );
  assert.deepEqual(absorbed.near.map((p) => p.id).sort(), ['a', 'b']);
  assert.equal(absorbed.far, undefined);
  assert.equal(rest.length, 0);
});
