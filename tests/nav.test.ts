import test from 'node:test';
import assert from 'node:assert/strict';

import { blocksActivation, entryTitle, jumpDelta, menuEntries, navLabel } from '../src/nav.ts';
import type { HistoryEntry } from '../src/history.ts';

const entry = (file: string, title?: string): HistoryEntry => ({ title, icon: 'lucide-file', state: { type: 'markdown', state: { file } } });

test('entryTitle prefers the title, then the note name, then Untitled', () => {
  assert.equal(entryTitle(entry('a/b/Note.md', 'Shown')), 'Shown');
  assert.equal(entryTitle(entry('a/b/Note.md')), 'Note');
  assert.equal(entryTitle(entry('a/b/Pic.png')), 'Pic.png');
  assert.equal(entryTitle({ state: { type: 'graph' } }), 'Untitled');
  assert.equal(entryTitle({ title: '  ', state: {} }), 'Untitled');
});

test('navLabel names the nearest entry (the last) and counts the rest', () => {
  const list = [entry('1.md'), entry('2.md'), entry('3.md'), entry('4.md')];
  assert.equal(navLabel('back', list, 'Navigate back'), 'Back to 4 (3 more)');
  assert.equal(navLabel('forward', list.slice(-1), 'Navigate forward'), 'Forward to 4');
  assert.equal(navLabel('back', [], 'Navigate back'), 'Navigate back');
});

test('menuEntries lists nearest first with the steps to take', () => {
  const list = [entry('1.md'), entry('2.md'), entry('3.md')];
  assert.deepEqual(
    menuEntries(list).map((e) => [e.title, e.steps]),
    [['3', 1], ['2', 2], ['1', 3]],
  );
  assert.deepEqual(menuEntries(list, 2).map((e) => e.steps), [1, 2]);
  assert.deepEqual(menuEntries([]), []);
  assert.equal(menuEntries([{ state: {} }])[0].icon, 'file');
});

test('jumpDelta goes negative for back', () => {
  assert.equal(jumpDelta('back', 3), -3);
  assert.equal(jumpDelta('forward', 2), 2);
});

test('blocksActivation only refuses sidebar leaves while locked and a main leaf is active', () => {
  assert.equal(blocksActivation(true, true, true), true);
  assert.equal(blocksActivation(false, true, true), false);
  assert.equal(blocksActivation(true, false, true), false);
  assert.equal(blocksActivation(true, true, false), false);
});
