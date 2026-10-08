import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capEntries,
  parseSaved,
  renameInSaved,
  sanitizeEntries,
  sanitizeTab,
  snapshot,
  type HistoryEntry,
} from '../src/history.ts';

const entry = (file: string | null): HistoryEntry => ({
  title: file ?? 'Graph',
  state: file ? { type: 'markdown', state: { file } } : { type: 'graph', state: {} },
});
const all = () => true;

test('capEntries keeps the newest', () => {
  assert.deepEqual(capEntries([1, 2, 3, 4], 2), [3, 4]);
  assert.deepEqual(capEntries([1, 2], 5), [1, 2]);
  assert.deepEqual(capEntries([1, 2], 0), []);
});

test('sanitizeEntries drops malformed entries and missing files, keeps views without a file', () => {
  const list = [entry('a.md'), entry('gone.md'), entry(null), { nope: true }, null];
  const kept = sanitizeEntries(list, (p) => p !== 'gone.md', 10);
  assert.deepEqual(kept.map((e) => e.title), ['a.md', 'Graph']);
});

test('sanitizeEntries keeps the nearest entries, which come last in both lists', () => {
  const list = [entry('1.md'), entry('2.md'), entry('3.md')];
  assert.deepEqual(sanitizeEntries(list, all, 2).map((e) => e.title), ['2.md', '3.md']);
  const tab = sanitizeTab({ back: list, forward: list }, all, 2);
  assert.deepEqual(tab.forward.map((e) => e.title), ['2.md', '3.md']);
});

test('sanitizeEntries copes with non-arrays', () => {
  assert.deepEqual(sanitizeEntries(undefined, all, 5), []);
  assert.deepEqual(sanitizeEntries('x', all, 5), []);
});

test('sanitizeTab tolerates garbage', () => {
  assert.deepEqual(sanitizeTab(null, all, 5), { back: [], forward: [] });
  const tab = sanitizeTab({ back: [entry('a.md')], forward: 3 }, all, 5);
  assert.equal(tab.back.length, 1);
  assert.deepEqual(tab.forward, []);
});

test('parseSaved ignores unknown versions and malformed tabs', () => {
  assert.deepEqual(parseSaved(null), { version: 1, tabs: {} });
  assert.deepEqual(parseSaved({ version: 2, tabs: { x: { back: [], forward: [] } } }).tabs, {});
  const ok = parseSaved({
    version: 1,
    tabs: { a: { back: [entry('a.md'), 7], forward: [] }, b: { back: 'x' }, c: null },
  });
  assert.deepEqual(Object.keys(ok.tabs), ['a']);
  assert.equal(ok.tabs.a.back.length, 1);
});

test('snapshot skips empty tabs, so a closed tab is forgotten', () => {
  const saved = snapshot(
    [
      { id: 'a', history: { back: [entry('a.md')], forward: [] } },
      { id: 'b', history: { back: [], forward: [] } },
    ],
    all,
    50,
  );
  assert.deepEqual(Object.keys(saved.tabs), ['a']);
});

test('snapshot applies the cap and drops deleted files', () => {
  const saved = snapshot(
    [{ id: 'a', history: { back: [entry('1.md'), entry('gone.md'), entry('2.md'), entry('3.md')], forward: [] } }],
    (p) => p !== 'gone.md',
    2,
  );
  assert.deepEqual(saved.tabs.a.back.map((e) => e.title), ['2.md', '3.md']);
});

test('renameInSaved follows a renamed note', () => {
  const saved = snapshot([{ id: 'a', history: { back: [entry('old.md')], forward: [entry('old.md')] } }], all, 5);
  renameInSaved(saved, 'old.md', 'new.md');
  assert.equal(saved.tabs.a.back[0].state.state?.file, 'new.md');
  assert.equal(saved.tabs.a.forward[0].state.state?.file, 'new.md');
});
