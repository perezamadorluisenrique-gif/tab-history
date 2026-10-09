import test from 'node:test';
import assert from 'node:assert/strict';

import { activate, close, folderOf, parseMru, previousOf, reconcile, sameList, windowLabel } from '../src/mru.ts';

test('activate moves a tab to the front without duplicating it', () => {
  assert.deepEqual(activate(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(activate(['a', 'b'], 'x'), ['x', 'a', 'b']);
  assert.deepEqual(activate(['a'], 'a'), ['a']);
  assert.deepEqual(activate([], 'a'), ['a']);
});

test('activate does not change its input', () => {
  const list = ['a', 'b'];
  activate(list, 'b');
  assert.deepEqual(list, ['a', 'b']);
});

test('close removes a tab and ignores unknown ones', () => {
  assert.deepEqual(close(['a', 'b', 'c'], 'b'), ['a', 'c']);
  assert.deepEqual(close(['a'], 'z'), ['a']);
});

test('reconcile drops missing tabs, keeps order and appends unseen ones', () => {
  assert.deepEqual(reconcile(['c', 'gone', 'a'], ['a', 'b', 'c']), ['c', 'a', 'b']);
  assert.deepEqual(reconcile([], ['a', 'b']), ['a', 'b']);
  assert.deepEqual(reconcile(['a', 'b'], []), []);
});

test('reconcile removes duplicates on both sides', () => {
  assert.deepEqual(reconcile(['a', 'b', 'a'], ['b', 'a', 'a']), ['a', 'b']);
});

test('previousOf skips the current tab and tabs that are gone', () => {
  assert.equal(previousOf(['a', 'b', 'c'], ['a', 'b', 'c'], 'a'), 'b');
  assert.equal(previousOf(['a', 'x', 'c'], ['a', 'c'], 'a'), 'c');
  assert.equal(previousOf(['a', 'b'], ['a', 'b'], null), 'a');
  assert.equal(previousOf(['a'], ['a'], 'a'), null);
  assert.equal(previousOf([], [], null), null);
});

test('pressing previous twice toggles between two tabs', () => {
  const live = ['a', 'b', 'c'];
  let list = ['a', 'b', 'c']; // a is active
  let current = 'a';
  for (const expected of ['b', 'a', 'b']) {
    const target = previousOf(list, live, current);
    assert.equal(target, expected);
    list = activate(list, target as string);
    current = target as string;
  }
});

test('parseMru keeps only strings, each once, and survives garbage', () => {
  assert.deepEqual(parseMru(['a', 3, '', null, 'b', 'a']), ['a', 'b']);
  assert.deepEqual(parseMru(undefined), []);
  assert.deepEqual(parseMru({ a: 1 }), []);
  assert.equal(parseMru(Array.from({ length: 500 }, (_, i) => `id${i}`)).length, 200);
});

test('sameList compares in order', () => {
  assert.equal(sameList(['a', 'b'], ['a', 'b']), true);
  assert.equal(sameList(['a', 'b'], ['b', 'a']), false);
  assert.equal(sameList(['a'], ['a', 'b']), false);
});

test('windowLabel and folderOf', () => {
  assert.equal(windowLabel('main'), 'Main window');
  assert.equal(windowLabel('popout', 2), 'Window 2');
  assert.equal(windowLabel('left'), 'Left sidebar');
  assert.equal(folderOf('Projects/2026/Plan.md'), 'Projects/2026');
  assert.equal(folderOf('Plan.md'), '/');
  assert.equal(folderOf(null), '');
});
