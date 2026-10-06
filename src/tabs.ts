// Pure logic for moving and closing tabs, in terms of indexes only.

export type MoveTarget =
  | { kind: 'left' }
  | { kind: 'right' }
  | { kind: 'position'; position: number } // 1-based
  | { kind: 'last' };

/** Where a tab at `index` ends up among `length` tabs, or null when it would not move. */
export function moveIndex(index: number, length: number, target: MoveTarget): number | null {
  if (length < 2 || index < 0 || index >= length) return null;
  let next: number;
  switch (target.kind) {
    case 'left':
      next = index - 1;
      break;
    case 'right':
      next = index + 1;
      break;
    case 'position':
      next = Math.min(Math.max(target.position, 1), length) - 1;
      break;
    case 'last':
      next = length - 1;
      break;
  }
  if (next < 0 || next >= length || next === index) return null;
  return next;
}

/** Moves one item and returns a new array. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const copy = items.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

export type AfterClose = 'adjacent' | 'recent';

/**
 * Which tab to focus once the tab at `index` closes. Returns an index into the
 * list as it was before closing, or null when it was the only tab.
 * `adjacent` prefers the tab to the right and falls back to the left, as
 * browsers do. `recent` takes the most recently active of the others.
 */
export function afterClose(index: number, activeTimes: number[], mode: AfterClose): number | null {
  const length = activeTimes.length;
  if (length < 2 || index < 0 || index >= length) return null;
  if (mode === 'recent') {
    let best = -1;
    for (let i = 0; i < length; i++) {
      if (i === index) continue;
      if (best === -1 || activeTimes[i] > activeTimes[best]) best = i;
    }
    return best;
  }
  return index + 1 < length ? index + 1 : index - 1;
}
