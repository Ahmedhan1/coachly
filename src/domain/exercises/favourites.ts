/** Favourite exercise ids as an immutable set. Every function returns a new set only when it changes. */

export function isFavourite(favourites: ReadonlySet<string>, id: string): boolean {
  return favourites.has(id);
}

export function addFavourite(favourites: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return favourites.has(id) ? favourites : new Set([...favourites, id]);
}

export function removeFavourite(favourites: ReadonlySet<string>, id: string): ReadonlySet<string> {
  if (!favourites.has(id)) return favourites;
  const next = new Set(favourites);
  next.delete(id);
  return next;
}

export function toggleFavourite(favourites: ReadonlySet<string>, id: string): ReadonlySet<string> {
  return favourites.has(id) ? removeFavourite(favourites, id) : addFavourite(favourites, id);
}

/** Drops ids that are not in the catalog any more (e.g. a deleted custom exercise). */
export function pruneFavourites(favourites: ReadonlySet<string>, catalogIds: Iterable<string>): ReadonlySet<string> {
  const known = new Set(catalogIds);
  return new Set([...favourites].filter((id) => known.has(id)));
}
