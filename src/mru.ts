// Pure logic: no `obsidian` import, so tests/ can run it under plain Node.
// The recent-tabs list holds leaf ids, most recently active first.

/** Ids kept on disk. Plenty for any real workspace. */
export const MAX_MRU = 200;

/** Reads the list from disk: only non-empty strings, each id once, first occurrence wins. */
export function parseMru(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const id of raw) {
    if (typeof id === 'string' && id !== '') seen.add(id);
    if (seen.size >= MAX_MRU) break;
  }
  return [...seen];
}

/** `id` becomes the most recent one; any earlier place for it is dropped. */
export function activate(list: readonly string[], id: string): string[] {
  const rest = list.filter((x) => x !== id);
  rest.unshift(id);
  return rest.slice(0, MAX_MRU);
}

/** A closed tab leaves the list. */
export function close(list: readonly string[], id: string): string[] {
  return list.filter((x) => x !== id);
}

/**
 * The list for the tabs that are open now. Ids with no open tab are dropped (a
 * saved list may name tabs that no longer exist), open tabs the list has never
 * seen go after the known ones in the order given, and nothing appears twice.
 */
export function reconcile(list: readonly string[], live: readonly string[]): string[] {
  const open = new Set(live);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of list) {
    if (open.has(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  for (const id of live) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** The tab "previous tab" jumps to: the most recent one that is open and is not the current one. */
export function previousOf(list: readonly string[], live: readonly string[], current: string | null): string | null {
  return reconcile(list, live).find((id) => id !== current) ?? null;
}

export function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

export type WindowKind = 'main' | 'popout' | 'left' | 'right';

/** Where a tab lives, for the marker in the list. `n` counts popout windows from 1. */
export function windowLabel(kind: WindowKind, n = 1): string {
  if (kind === 'popout') return `Window ${n}`;
  if (kind === 'left') return 'Left sidebar';
  if (kind === 'right') return 'Right sidebar';
  return 'Main window';
}

/** The folder of a note path, "/" for the vault root, empty for tabs without a file. */
export function folderOf(path: string | null): string {
  if (!path) return '';
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '/' : path.slice(0, slash);
}
