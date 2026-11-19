import assert from 'node:assert/strict';
import { test } from 'node:test';
import { containsOffensive } from './profanity';

test('catches curse words, dodges and slurs', () => {
  for (const bad of ['fuck', 'Fucking spot', 'f*ck this', 'sh1t', 'fuuuuck', 'f u c k', 's.h.i.t', 'BITCHES', '#FuckMondays', 'dumbass corner', 'wtf']) {
    assert.equal(containsOffensive(bad), true, bad);
  }
});

test('leaves ordinary names alone', () => {
  for (const ok of [
    'Coal Creek Trail', 'Scunthorpe', 'Class reunion', 'Shiitake stand', 'Dickens Opera House', 'Cocktail bar',
    'Peacock Lane', 'Spicy Pickle', 'Hancock Park', 'Assembly Hall', 'Pier 34', 'Grasshopper Field', 'test1',
    'Damn Good Tacos', 'Bass Pro', 'Essex', 'Sussex', 'Cumberland', 'Matsushita', 'Titanic exhibit',
  ]) {
    assert.equal(containsOffensive(ok), false, ok);
  }
});
