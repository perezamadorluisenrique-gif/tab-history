import test from 'node:test';
import assert from 'node:assert/strict';

import { afterClose, moveIndex, moveItem } from '../src/tabs.ts';

test('moveIndex left and right stop at the edges', () => {
  assert.equal(moveIndex(2, 4, { kind: 'left' }), 1);
  assert.equal(moveIndex(0, 4, { kind: 'left' }), null);
  assert.equal(moveIndex(2, 4, { kind: 'right' }), 3);
  assert.equal(moveIndex(3, 4, { kind: 'right' }), null);
});

test('moveIndex to a position clamps to the last tab', () => {
  assert.equal(moveIndex(0, 3, { kind: 'position', position: 2 }), 1);
  assert.equal(moveIndex(0, 3, { kind: 'position', position: 8 }), 2);
  assert.equal(moveIndex(1, 3, { kind: 'position', position: 2 }), null);
  assert.equal(moveIndex(2, 3, { kind: 'position', position: 1 }), 0);
});

test('moveIndex to last, and with a single tab', () => {
  assert.equal(moveIndex(0, 3, { kind: 'last' }), 2);
  assert.equal(moveIndex(2, 3, { kind: 'last' }), null);
  assert.equal(moveIndex(0, 1, { kind: 'last' }), null);
});

test('moveItem reorders without mutating', () => {
  const list = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(list, ['a', 'b', 'c', 'd']);
});

test('afterClose adjacent prefers the right neighbour, then the left', () => {
  assert.equal(afterClose(1, [1, 2, 3], 'adjacent'), 2);
  assert.equal(afterClose(2, [1, 2, 3], 'adjacent'), 1);
  assert.equal(afterClose(0, [1], 'adjacent'), null);
});

test('afterClose recent picks the latest active of the others', () => {
  assert.equal(afterClose(1, [5, 9, 7], 'recent'), 2);
  assert.equal(afterClose(2, [5, 9, 7], 'recent'), 1);
  assert.equal(afterClose(0, [9, 1, 2], 'recent'), 2);
});
