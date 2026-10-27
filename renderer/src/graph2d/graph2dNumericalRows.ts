/** Shared bounded filtering and ordering for numerical result tables. */
export function graph2DNumericalRows<T>(items: readonly T[], options: Readonly<{
  query: string;
  descending: boolean;
  include: (item: T) => boolean;
  searchText: (item: T) => string;
  getX: (item: T) => number;
  getId: (item: T) => string;
}>): T[] {
  const query = options.query.trim().toLowerCase().slice(0, 128);
  return items.filter(item => options.include(item) &&
    (!query || options.searchText(item).toLowerCase().includes(query)))
    .sort((a, b) => (options.descending ? -1 : 1) * (options.getX(a) - options.getX(b)) ||
      options.getId(a).localeCompare(options.getId(b)));
}
