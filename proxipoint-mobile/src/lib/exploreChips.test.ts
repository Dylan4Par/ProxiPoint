import test from 'node:test';
import assert from 'node:assert/strict';
import { chipFilterTags, useDiscoveryStore } from '../stores/useDiscoveryStore';

const s = () => useDiscoveryStore.getState();
const on = () => chipFilterTags(s().tags, s().offTags);

test('Explore Map chips: selected = filtering; All turns them off; tapping toggles', () => {
  useDiscoveryStore.setState({ tags: ['All'], offTags: [] });
  s().addTag('#LiveMusic');
  s().addTag('#Trivia');
  assert.deepEqual(on(), ['#LiveMusic', '#Trivia'], 'added from the Filter menu: on');

  s().setAllChipsOff();
  assert.deepEqual(on(), [], 'All: nothing filtering');
  assert.deepEqual(s().tags, ['All', '#LiveMusic', '#Trivia'], 'the chips stay');

  s().toggleChipTag('#Trivia');
  assert.deepEqual(on(), ['#Trivia']);
  s().toggleChipTag('#Trivia');
  assert.deepEqual(on(), []);

  s().addTag('#LiveMusic');
  assert.deepEqual(on(), ['#LiveMusic'], 'adding an existing off chip turns it on');

  s().soloChipTag('#Yoga');
  assert.deepEqual(on(), ['#Yoga'], 'Show on map: just that #tag');

  s().removeTag('#Yoga');
  assert.deepEqual(on(), []);
  assert.ok(!s().tags.includes('#Yoga'));
});
