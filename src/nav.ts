// Pure logic for the back/forward arrows: tooltips and the history menu.
import { entryFile, type HistoryEntry } from './history.ts';

export type NavKind = 'back' | 'forward';

/** Most entries a history menu lists. */
export const MENU_LIMIT = 30;

/** What to show for an entry: its title, else the note's name, else "Untitled". */
export function entryTitle(entry: HistoryEntry): string {
  if (typeof entry.title === 'string' && entry.title.trim() !== '') return entry.title;
  const file = entryFile(entry);
  if (file) {
    const name = file.split('/').pop() ?? file;
    return name.replace(/\.md$/i, '');
  }
  return 'Untitled';
}

/**
 * The tooltip of an arrow. Both lists end with the nearest entry, so that is the
 * target; `base` (the app's own label) is kept when there is nowhere to go.
 */
export function navLabel(kind: NavKind, entries: HistoryEntry[], base: string): string {
  if (entries.length === 0) return base;
  const target = entryTitle(entries[entries.length - 1]);
  const more = entries.length - 1;
  const head = `${kind === 'back' ? 'Back' : 'Forward'} to ${target}`;
  return more > 0 ? `${head} (${more} more)` : head;
}

export interface MenuEntry {
  title: string;
  icon: string;
  /** How many steps away it is, 1 for the nearest. */
  steps: number;
}

/** The entries of a menu, nearest first, at most `limit`. */
export function menuEntries(entries: HistoryEntry[], limit = MENU_LIMIT): MenuEntry[] {
  const result: MenuEntry[] = [];
  for (let i = entries.length - 1; i >= 0 && result.length < limit; i--) {
    const icon = entries[i].icon;
    result.push({
      title: entryTitle(entries[i]),
      icon: typeof icon === 'string' && icon !== '' ? icon : 'file',
      steps: entries.length - i,
    });
  }
  return result;
}

/** The argument of `history.go()` to jump `steps` entries in a direction. */
export function jumpDelta(kind: NavKind, steps: number): number {
  return kind === 'back' ? -steps : steps;
}

/**
 * Focus lock: should activating `leaf` be refused? Only a sidebar leaf is
 * refused, and only while a main-area leaf is there to keep the focus.
 */
export function blocksActivation(locked: boolean, targetInSidebar: boolean, activeInMain: boolean): boolean {
  return locked && targetInSidebar && activeInMain;
}
