import assert from 'node:assert/strict';
import { test } from 'node:test';
import { useDiscoveryStore } from './useDiscoveryStore';

const initialNodes = useDiscoveryStore.getState().nodes;

function resetStore() {
  useDiscoveryStore.setState({
    nodes: initialNodes,
    selectedNodeId: 'downtown-1',
    selectedEventId: 'downtown-1',
    drawerSnap: 'peek',
    focusToken: 0,
    dropSheetOpen: false,
    tags: ['All', '#LiveMusic', '#TechMeetup', '#FoodTrucks', '#Pickleball', '#ArtWalk'],
  });
}

test('downtown seed pins share one coordinate', () => {
  const nodes = ['downtown-1', 'downtown-2', 'downtown-3'].map((id) => initialNodes[id]);
  assert.equal(nodes.length, 3);
  assert.ok(nodes.every((node) => node.latitude === nodes[0].latitude));
  assert.ok(nodes.every((node) => node.longitude === nodes[0].longitude));
  assert.ok(nodes.every((node) => node.x === nodes[0].x && node.y === nodes[0].y));
});

test('tapping a pin opens the sheet to single-card peek', () => {
  resetStore();
  useDiscoveryStore.setState({ drawerSnap: 'expanded' });
  useDiscoveryStore.getState().selectNodeFromPin('event-2');
  const state = useDiscoveryStore.getState();
  assert.equal(state.selectedNodeId, 'event-2');
  assert.equal(state.drawerSnap, 'peek');
  assert.equal(state.focusToken, 0);
});

test('tapping a card selects it and requests a camera center', () => {
  resetStore();
  useDiscoveryStore.setState({ drawerSnap: 'collapsed' });
  useDiscoveryStore.getState().selectNodeFromCard('event-3');
  const state = useDiscoveryStore.getState();
  assert.equal(state.selectedNodeId, 'event-3');
  assert.equal(state.drawerSnap, 'collapsed');
  assert.equal(state.focusToken, 1);
});

test('dropping a beacon adds a live node and peeks its card', () => {
  resetStore();
  useDiscoveryStore.setState({ dropSheetOpen: true, drawerSnap: 'collapsed' });
  const id = useDiscoveryStore.getState().dropBeacon({
    title: 'Night Market',
    tag: 'Pickup',
    venue: 'Civic Center',
    latitude: 40.063,
    longitude: -105.038,
  });
  const state = useDiscoveryStore.getState();
  const node = state.nodes[id];
  assert.equal(state.dropSheetOpen, false);
  assert.equal(state.drawerSnap, 'peek');
  assert.equal(state.selectedNodeId, id);
  assert.equal(state.focusToken, 1);
  assert.equal(node.title, 'Night Market');
  assert.equal(node.tag, '#Pickup');
  assert.equal(node.venue, 'Civic Center');
  assert.equal(node.status, 'LIVE NOW');
  assert.equal(node.isRsvpd, true);
  assert.ok(state.tags.includes('#Pickup'));
  assert.ok(node.distanceMeters >= 0);
});
