/** Shared bounded filtering and ordering for numerical result tables. */
export function graph2DNumericalRows<T extends Readonly<{ x: number }>>(items: readonly T[], options: Readonly<{
  query: string;
  descending: boolean;
  include: (item: T) => boolean;
  searchText: (item: T) => string;
}>): T[] {
  const query = options.query.trim().toLowerCase().slice(0, 128);
  return items.filter(item => options.include(item) &&
    (!query || options.searchText(item).toLowerCase().includes(query)))
    .sort((a, b) => options.descending ? b.x - a.x : a.x - b.x);
}
