import { getUnifiedSelectionKey, type UnifiedSelection, type UnifiedSelectionWorkspace } from "./unifiedSelection";

export type SelectionHistoryEntry = {
  readonly id: string;
  readonly key: string;
  readonly workspace: UnifiedSelectionWorkspace;
  readonly label: string;
  readonly breadcrumb: string;
  readonly selection: UnifiedSelection;
  readonly capturedAt: number;
  readonly bookmarkedAt?: number;
};

export type SelectionHistoryOptions = {
  readonly breadcrumb?: string | null;
  readonly now?: number;
  readonly limit?: number;
  readonly idPrefix?: string;
};

const DEFAULT_HISTORY_LIMIT = 12;

const entryId = (key: string, capturedAt: number, idPrefix = "selection"): string =>
  `${idPrefix}:${encodeURIComponent(key)}:${capturedAt}`;

export function createSelectionHistoryEntry(
  selection: UnifiedSelection | null | undefined,
  options: SelectionHistoryOptions = {}
): SelectionHistoryEntry | null {
  if (!selection) return null;
  const key = getUnifiedSelectionKey(selection);
  if (!key) return null;
  const capturedAt = options.now ?? Date.now();
  return {
    id: entryId(key, capturedAt, options.idPrefix),
    key,
    workspace: selection.workspace,
    label: selection.label,
    breadcrumb: options.breadcrumb?.trim() || selection.label,
    selection,
    capturedAt,
  };
}

export function addSelectionHistoryEntry(
  history: readonly SelectionHistoryEntry[],
  selection: UnifiedSelection | null | undefined,
  options: SelectionHistoryOptions = {}
): SelectionHistoryEntry[] {
  const entry = createSelectionHistoryEntry(selection, options);
  if (!entry) return [...history];
  const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_HISTORY_LIMIT));
  return [entry, ...history.filter((item) => item.key !== entry.key)].slice(0, limit);
}

export function bookmarkSelectionEntry(
  bookmarks: readonly SelectionHistoryEntry[],
  selection: UnifiedSelection | SelectionHistoryEntry | null | undefined,
  options: SelectionHistoryOptions = {}
): SelectionHistoryEntry[] {
  const base = selection && "selection" in selection ? selection : createSelectionHistoryEntry(selection, options);
  if (!base) return [...bookmarks];
  const bookmarkedAt = options.now ?? Date.now();
  const entry: SelectionHistoryEntry = {
    ...base,
    id: base.id || entryId(base.key, bookmarkedAt, options.idPrefix ?? "bookmark"),
    capturedAt: base.capturedAt || bookmarkedAt,
    bookmarkedAt,
    breadcrumb: options.breadcrumb?.trim() || base.breadcrumb,
  };
  return [entry, ...bookmarks.filter((item) => item.key !== entry.key)];
}

export function removeSelectionBookmark(
  bookmarks: readonly SelectionHistoryEntry[],
  key: string
): SelectionHistoryEntry[] {
  return bookmarks.filter((item) => item.key !== key);
}

export function findRestorableSelectionEntry(
  entries: readonly SelectionHistoryEntry[],
  key: string | null | undefined
): SelectionHistoryEntry | null {
  if (!key) return null;
  return entries.find((entry) => entry.key === key || entry.id === key) ?? null;
}

export function getRedoSelectionEntry(
  history: readonly SelectionHistoryEntry[],
  currentKey?: string | null
): SelectionHistoryEntry | null {
  return history.find((entry) => entry.key !== currentKey) ?? history[0] ?? null;
}
