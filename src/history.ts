// Pure logic: no `obsidian` import, so tests/ can run it under plain Node.

/** One entry of a tab's back or forward list, as Obsidian serializes it. */
export interface HistoryEntry {
  title?: string;
  icon?: string;
  state: { type?: string; state?: { file?: string } & Record<string, unknown> } & Record<string, unknown>;
  eState?: unknown;
}

export interface TabHistory {
  back: HistoryEntry[];
  forward: HistoryEntry[];
}

export const SCHEMA_VERSION = 1;

export interface SavedHistory {
  version: number;
  tabs: Record<string, TabHistory>;
}

export function emptySaved(): SavedHistory {
  return { version: SCHEMA_VERSION, tabs: {} };
}

function isEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const state = (value as { state?: unknown }).state;
  return typeof state === 'object' && state !== null;
}

/** The file an entry points to, or null for views without one (graph, search...). */
export function entryFile(entry: HistoryEntry): string | null {
  const file = entry.state.state?.file;
  return typeof file === 'string' ? file : null;
}

/** Keeps the newest `max` entries (lists run oldest first). */
export function capEntries<T>(entries: T[], max: number): T[] {
  const limit = Math.max(0, Math.floor(max));
  return limit >= entries.length ? entries.slice() : entries.slice(entries.length - limit);
}

/**
 * Cleans a list read from disk or from a tab: drops malformed entries and those
 * whose file is gone, then applies the cap. Both lists run farthest first and end
 * with the nearest entry (Obsidian pops from the end), so both keep their tail.
 */
export function sanitizeEntries(
  entries: unknown,
  exists: (path: string) => boolean,
  max: number,
): HistoryEntry[] {
  if (!Array.isArray(entries)) return [];
  const clean = entries.filter((e): e is HistoryEntry => {
    if (!isEntry(e)) return false;
    const file = entryFile(e);
    return file === null || exists(file);
  });
  return capEntries(clean, max);
}

export function sanitizeTab(raw: unknown, exists: (path: string) => boolean, max: number): TabHistory {
  const source = (typeof raw === 'object' && raw !== null ? raw : {}) as { back?: unknown; forward?: unknown };
  return {
    back: sanitizeEntries(source.back, exists, max),
    forward: sanitizeEntries(source.forward, exists, max),
  };
}

/** Reads `data.json`'s history block. Anything unknown or newer than we understand is ignored. */
export function parseSaved(raw: unknown): SavedHistory {
  if (typeof raw !== 'object' || raw === null) return emptySaved();
  const { version, tabs } = raw as { version?: unknown; tabs?: unknown };
  if (version !== SCHEMA_VERSION || typeof tabs !== 'object' || tabs === null) return emptySaved();
  const result = emptySaved();
  for (const [id, tab] of Object.entries(tabs)) {
    if (typeof tab !== 'object' || tab === null) continue;
    const { back, forward } = tab as { back?: unknown; forward?: unknown };
    if (!Array.isArray(back) || !Array.isArray(forward)) continue;
    result.tabs[id] = { back: back.filter(isEntry), forward: forward.filter(isEntry) };
  }
  return result;
}

export function isEmptyTab(tab: TabHistory): boolean {
  return tab.back.length === 0 && tab.forward.length === 0;
}

/**
 * Builds what to save from the live tabs. Empty tabs are not stored, and tabs
 * that no longer exist drop out, so closing a tab forgets its history.
 */
export function snapshot(
  live: { id: string; history: TabHistory }[],
  exists: (path: string) => boolean,
  max: number,
): SavedHistory {
  const saved = emptySaved();
  for (const { id, history } of live) {
    const tab = sanitizeTab(history, exists, max);
    if (!isEmptyTab(tab)) saved.tabs[id] = tab;
  }
  return saved;
}

export function sameSaved(a: SavedHistory, b: SavedHistory): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Follows a rename so saved entries keep pointing at the right note. */
export function renameInSaved(saved: SavedHistory, from: string, to: string): void {
  for (const tab of Object.values(saved.tabs)) {
    for (const entry of [...tab.back, ...tab.forward]) {
      const inner = entry.state.state;
      if (inner && inner.file === from) inner.file = to;
    }
  }
}
