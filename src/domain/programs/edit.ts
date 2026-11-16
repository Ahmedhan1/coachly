import { err, ok, type Result } from '../nutrition/result';
import type { ClientId, ExerciseId, ProgramDay, ProgramItem } from '../models';
import { normalizeSupersets } from './supersets';
import { DEFAULT_ITEM, PROGRAM_LIMITS, type LocalIdFactory, type ProgramBody, type ProgramItemPatch } from './types';

export type ProgramEditError = 'too_many_days' | 'too_many_items' | 'not_found';

const mapDay = (body: ProgramBody, dayId: string, fn: (day: ProgramDay) => ProgramDay): ProgramBody => ({
  ...body,
  days: body.days.map((d) => (d.id === dayId ? fn(d) : d)),
});

const withItems = (day: ProgramDay, items: ProgramItem[]): ProgramDay => ({ ...day, items: normalizeSupersets(items) });

export function addDay(body: ProgramBody, name: string, newId: LocalIdFactory): Result<{ body: ProgramBody; dayId: string }, ProgramEditError> {
  if (body.days.length >= PROGRAM_LIMITS.maxDays) return err('too_many_days');
  const day: ProgramDay = { id: newId(), name: name.trim(), items: [] };
  return ok({ body: { ...body, days: [...body.days, day] }, dayId: day.id });
}

export function renameDay(body: ProgramBody, dayId: string, name: string): ProgramBody {
  return mapDay(body, dayId, (d) => ({ ...d, name: name.trim() }));
}

/** Removes a day; returns it with its index so the UI can undo. */
export function removeDay(body: ProgramBody, dayId: string): { body: ProgramBody; removed: ProgramDay | null; index: number } {
  const index = body.days.findIndex((d) => d.id === dayId);
  if (index < 0) return { body, removed: null, index: -1 };
  return { body: { ...body, days: body.days.filter((d) => d.id !== dayId) }, removed: body.days[index] ?? null, index };
}

export function restoreDay(body: ProgramBody, day: ProgramDay, index: number): ProgramBody {
  if (body.days.some((d) => d.id === day.id)) return body;
  const days = [...body.days];
  days.splice(Math.max(0, Math.min(index, days.length)), 0, day);
  return { ...body, days };
}

/** Deep copy of a day with fresh ids for the day and every item (superset labels are kept). */
export function cloneDay(day: ProgramDay, newId: LocalIdFactory, name: string = day.name): ProgramDay {
  return { id: newId(), name, items: day.items.map((it) => ({ ...it, id: newId() })) };
}

/** Inserts a copy of the day right after it. */
export function duplicateDay(
  body: ProgramBody,
  dayId: string,
  newId: LocalIdFactory,
  name?: string,
): Result<{ body: ProgramBody; dayId: string }, ProgramEditError> {
  const index = body.days.findIndex((d) => d.id === dayId);
  const day = body.days[index];
  if (!day) return err('not_found');
  if (body.days.length >= PROGRAM_LIMITS.maxDays) return err('too_many_days');
  const copy = cloneDay(day, newId, name ?? day.name);
  const days = [...body.days];
  days.splice(index + 1, 0, copy);
  return ok({ body: { ...body, days }, dayId: copy.id });
}

/**
 * "Copy week": appends a copy of the first `weekLength` days (default: all days) after the existing ones,
 * named by `rename(originalName, copyIndex)`. Fails when the program would exceed the day limit.
 */
export function copyWeek(
  body: ProgramBody,
  newId: LocalIdFactory,
  rename: (name: string, position: number) => string = (n) => n,
  weekLength: number = body.days.length,
): Result<ProgramBody, ProgramEditError> {
  const week = body.days.slice(0, Math.max(0, weekLength));
  if (week.length === 0) return ok(body);
  if (body.days.length + week.length > PROGRAM_LIMITS.maxDays) return err('too_many_days');
  const copies = week.map((d, i) => cloneDay(d, newId, rename(d.name, i)));
  return ok({ ...body, days: [...body.days, ...copies] });
}

export function addItem(
  body: ProgramBody,
  dayId: string,
  exerciseId: ExerciseId,
  newId: LocalIdFactory,
): Result<{ body: ProgramBody; itemId: string }, ProgramEditError> {
  const day = body.days.find((d) => d.id === dayId);
  if (!day) return err('not_found');
  if (day.items.length >= PROGRAM_LIMITS.maxItemsPerDay) return err('too_many_items');
  const item: ProgramItem = { id: newId(), exerciseId, supersetGroup: null, ...DEFAULT_ITEM };
  return ok({ body: mapDay(body, dayId, (d) => withItems(d, [...d.items, item])), itemId: item.id });
}

export function updateItem(body: ProgramBody, dayId: string, itemId: string, patch: ProgramItemPatch): ProgramBody {
  return mapDay(body, dayId, (d) => ({ ...d, items: d.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }));
}

/** Removes an item; returns it with its index (and old superset label) so the UI can undo. */
export function removeItem(
  body: ProgramBody,
  dayId: string,
  itemId: string,
): { body: ProgramBody; removed: ProgramItem | null; index: number } {
  const day = body.days.find((d) => d.id === dayId);
  const index = day ? day.items.findIndex((it) => it.id === itemId) : -1;
  const removed = day && index >= 0 ? (day.items[index] ?? null) : null;
  if (!removed) return { body, removed: null, index: -1 };
  return { body: mapDay(body, dayId, (d) => withItems(d, d.items.filter((it) => it.id !== itemId))), removed, index };
}

export function restoreItem(body: ProgramBody, dayId: string, item: ProgramItem, index: number): ProgramBody {
  return mapDay(body, dayId, (d) => {
    if (d.items.some((it) => it.id === item.id)) return d;
    const items = [...d.items];
    items.splice(Math.max(0, Math.min(index, items.length)), 0, item);
    return withItems(d, items);
  });
}

/** Moves an element of `list` from index `from` to index `to`. */
export function arrayMove<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length || from === to) return out;
  const [moved] = out.splice(from, 1);
  out.splice(to, 0, moved as T);
  return out;
}

/**
 * Drag-reorder inside a day: moves `activeId` to the position of `overId`. A superset member dragged out of
 * its run leaves the group; an item dropped between two members of a group joins that group.
 */
export function reorderItems(body: ProgramBody, dayId: string, activeId: string, overId: string): ProgramBody {
  return mapDay(body, dayId, (d) => {
    const from = d.items.findIndex((it) => it.id === activeId);
    const to = d.items.findIndex((it) => it.id === overId);
    if (from < 0 || to < 0 || from === to) return d;
    const moved = arrayMove(d.items, from, to);
    const item = moved[to] as ProgramItem;
    const prev = moved[to - 1];
    const next = moved[to + 1];
    const enclosing = prev && next && prev.supersetGroup !== null && prev.supersetGroup === next.supersetGroup ? prev.supersetGroup : null;
    if (enclosing !== null) {
      // Dropped inside another superset: it joins that group instead of splitting it.
      moved[to] = { ...item, supersetGroup: enclosing };
    } else if (item.supersetGroup !== null) {
      const stillInRun = prev?.supersetGroup === item.supersetGroup || next?.supersetGroup === item.supersetGroup;
      if (!stillInRun) moved[to] = { ...item, supersetGroup: null };
    }
    return withItems(d, moved);
  });
}

/**
 * Moves an item one step up (-1) or down (+1): the keyboard / button fallback for drag. A standalone item
 * hops over a whole superset; a superset member swaps inside its group, and at the group's edge it leaves it.
 */
export function moveItem(body: ProgramBody, dayId: string, itemId: string, delta: -1 | 1): ProgramBody {
  return mapDay(body, dayId, (d) => {
    const items = normalizeSupersets(d.items);
    const index = items.findIndex((it) => it.id === itemId);
    const item = items[index];
    if (!item) return d;
    const neighbour = items[index + delta];
    if (item.supersetGroup !== null) {
      if (neighbour?.supersetGroup === item.supersetGroup) return withItems(d, arrayMove(items, index, index + delta));
      return withItems(d, items.map((it) => (it.id === itemId ? { ...it, supersetGroup: null } : it)));
    }
    if (!neighbour) return d;
    let target = index + delta;
    if (neighbour.supersetGroup !== null) {
      while (items[target + delta]?.supersetGroup === neighbour.supersetGroup) target += delta;
    }
    return withItems(d, arrayMove(items, index, target));
  });
}

export function reorderDays(body: ProgramBody, activeId: string, overId: string): ProgramBody {
  const from = body.days.findIndex((d) => d.id === activeId);
  const to = body.days.findIndex((d) => d.id === overId);
  return { ...body, days: arrayMove(body.days, from, to) };
}

/** Same items with fresh ids for every day and item (used when copying a whole program). */
export function cloneDays(days: readonly ProgramDay[], newId: LocalIdFactory): ProgramDay[] {
  return days.map((d) => cloneDay(d, newId));
}

/** Copy of a program for another client (or the same one): fresh nested ids, assigned, never a template. */
export function copyProgramToClient(body: ProgramBody, clientId: ClientId, newId: LocalIdFactory, name: string = body.name): ProgramBody {
  return { name, clientId, isTemplate: false, days: cloneDays(body.days, newId), notes: body.notes };
}

/** The trainer's own reusable template from any program: unassigned, fresh ids. */
export function saveAsTemplate(body: ProgramBody, newId: LocalIdFactory, name: string = body.name): ProgramBody {
  return { name, clientId: null, isTemplate: true, days: cloneDays(body.days, newId), notes: body.notes };
}

/** A working copy of a program or template ("duplicate" in the list). Keeps the assignment and template flag. */
export function duplicateProgram(body: ProgramBody, newId: LocalIdFactory, name: string): ProgramBody {
  return { ...body, name, days: cloneDays(body.days, newId) };
}

export function totalSets(day: ProgramDay): number {
  return day.items.reduce((n, it) => n + it.sets, 0);
}

/**
 * Rough session length in minutes: each set ≈ `workSec` of work plus its rest; inside a superset the rest is
 * taken once per round (after the last member). Rounded up to 5 minutes.
 */
export function estimateDayMinutes(day: ProgramDay, workSec = 40): number {
  const items = normalizeSupersets(day.items);
  let seconds = 0;
  items.forEach((it, i) => {
    const next = items[i + 1];
    const restsHere = it.supersetGroup === null || next?.supersetGroup !== it.supersetGroup;
    seconds += it.sets * (workSec + (restsHere ? it.restSec : 0));
  });
  return seconds === 0 ? 0 : Math.ceil(seconds / 300) * 5;
}
