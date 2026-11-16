import type { ProgramItem } from '../models';

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Makes superset groups consistent after any edit: a group is a contiguous run of items with the same label;
 * a run of one item is not a superset (label cleared); runs are relabelled A, B, C… in order.
 */
export function normalizeSupersets(items: readonly ProgramItem[]): ProgramItem[] {
  const out: ProgramItem[] = [];
  let next = 0;
  let i = 0;
  while (i < items.length) {
    const first = items[i] as ProgramItem;
    let end = i + 1;
    if (first.supersetGroup !== null) {
      while (end < items.length && (items[end] as ProgramItem).supersetGroup === first.supersetGroup) end++;
    }
    const run = items.slice(i, end);
    if (run.length >= 2) {
      const label = LABELS[next % LABELS.length] ?? 'A';
      next++;
      for (const item of run) out.push(item.supersetGroup === label ? item : { ...item, supersetGroup: label });
    } else {
      out.push(first.supersetGroup === null ? first : { ...first, supersetGroup: null });
    }
    i = end;
  }
  return out;
}

/**
 * Groups the given items into one superset. They are moved next to the first selected item (keeping their
 * relative order), and any group they belonged to is left. Fewer than two known ids: unchanged.
 */
export function linkSuperset(items: readonly ProgramItem[], ids: readonly string[]): ProgramItem[] {
  const wanted = new Set(ids);
  const selected = items.filter((it) => wanted.has(it.id));
  if (selected.length < 2) return [...items];
  const firstIndex = items.findIndex((it) => wanted.has(it.id));
  const label = '__new';
  const rest = items.filter((it) => !wanted.has(it.id));
  const before = rest.filter((it) => items.indexOf(it) < firstIndex);
  const after = rest.filter((it) => items.indexOf(it) > firstIndex);
  const grouped = selected.map((it) => ({ ...it, supersetGroup: label }));
  // Items that were in the same old group as a neighbour keep their own label; normalise fixes the run.
  return normalizeSupersets([...before, ...grouped, ...after]);
}

/** Takes one item out of its superset (the rest of the group stays linked when ≥ 2 remain). */
export function unlinkFromSuperset(items: readonly ProgramItem[], id: string): ProgramItem[] {
  const index = items.findIndex((it) => it.id === id);
  const item = items[index];
  if (!item || item.supersetGroup === null) return [...items];
  // Move it after its group so the remaining members stay contiguous.
  let end = index + 1;
  while (end < items.length && (items[end] as ProgramItem).supersetGroup === item.supersetGroup) end++;
  const without = items.filter((it) => it.id !== id);
  without.splice(end - 1, 0, { ...item, supersetGroup: null });
  return normalizeSupersets(without);
}

/** Breaks the whole group the item belongs to. */
export function ungroupSuperset(items: readonly ProgramItem[], id: string): ProgramItem[] {
  const label = items.find((it) => it.id === id)?.supersetGroup ?? null;
  if (label === null) return [...items];
  return normalizeSupersets(items.map((it) => (it.supersetGroup === label ? { ...it, supersetGroup: null } : it)));
}

export type DayBlock =
  | { kind: 'single'; item: ProgramItem }
  | { kind: 'superset'; label: string; items: ProgramItem[]; tags: string[] };

/** How the builder and session mode lay a day out: single items and superset blocks with A1/A2 tags. */
export function dayBlocks(items: readonly ProgramItem[]): DayBlock[] {
  const normalized = normalizeSupersets(items);
  const blocks: DayBlock[] = [];
  for (const item of normalized) {
    const last = blocks[blocks.length - 1];
    if (item.supersetGroup !== null && last?.kind === 'superset' && last.label === item.supersetGroup) {
      last.items.push(item);
      last.tags.push(`${item.supersetGroup}${last.items.length}`);
    } else if (item.supersetGroup !== null) {
      blocks.push({ kind: 'superset', label: item.supersetGroup, items: [item], tags: [`${item.supersetGroup}1`] });
    } else {
      blocks.push({ kind: 'single', item });
    }
  }
  return blocks;
}

/** itemId → "A1" / "A2"… for every item in a superset. */
export function supersetTags(items: readonly ProgramItem[]): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const block of dayBlocks(items)) {
    if (block.kind === 'superset') block.items.forEach((it, i) => map.set(it.id, block.tags[i] ?? ''));
  }
  return map;
}
