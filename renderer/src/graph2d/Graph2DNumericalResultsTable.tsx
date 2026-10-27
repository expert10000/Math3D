import { useEffect, useMemo, useState, type ReactNode } from "react";
import { graph2DNumericalRows } from "./graph2dNumericalRows";

export type Graph2DResultFilter<T> = Readonly<{ id: string; label: string; include: (item: T) => boolean }>;
export type Graph2DResultColumn<T> = Readonly<{ id: string; label: string; render: (item: T) => ReactNode }>;

type Props<T> = Readonly<{
  resultKey: string;
  tableLabel: string;
  controlsLabel: string;
  searchLabel: string;
  sortLabel: string;
  items: readonly T[];
  filters: readonly Graph2DResultFilter<T>[];
  columns: readonly Graph2DResultColumn<T>[];
  getId: (item: T) => string;
  getX: (item: T) => number;
  getKind: (item: T) => string;
  getSearchText: (item: T) => string;
  formatX?: (item: T) => ReactNode;
  xLabel?: string;
  onFocus?: (item: T) => void;
  canFocus?: (item: T) => boolean;
  focusLabel?: (item: T) => string;
  isActive?: (item: T) => boolean;
  canSave?: (item: T) => boolean;
  onSaveOne?: (item: T) => void;
  saveLabel?: (item: T) => string;
  selectedIds?: readonly string[];
  onSelectedIdsChange?: (ids: readonly string[]) => void;
  onSaveSelected?: (items: readonly T[]) => void;
  canSaveSelected?: (items: readonly T[]) => boolean;
  exportCsv?: () => void;
  exportJson?: () => void;
  extraActions?: ReactNode;
  emptyText: string;
  pageSize?: number;
}>;

/** Common bounded result browser. Each analysis supplies its own provenance and save rules. */
export function Graph2DNumericalResultsTable<T>({ resultKey, tableLabel, controlsLabel, searchLabel,
  sortLabel, items, filters, columns, getId, getX, getKind, getSearchText, formatX, xLabel = "x",
  onFocus, canFocus, focusLabel, isActive, canSave, onSaveOne, saveLabel, selectedIds, onSelectedIdsChange,
  onSaveSelected, canSaveSelected, exportCsv, exportJson, extraActions, emptyText, pageSize = 50 }: Props<T>) {
  const [filter, setFilter] = useState("all"), [query, setQuery] = useState(""),
    [descending, setDescending] = useState(false), [page, setPage] = useState(0);
  useEffect(() => { setFilter("all"); setQuery(""); setDescending(false); setPage(0); }, [resultKey]);
  useEffect(() => { setPage(0); }, [filter, query, descending]);
  const rows = useMemo(() => graph2DNumericalRows(items, { query, descending,
    include: filters.find(entry => entry.id === filter)?.include ?? (() => true),
    searchText: getSearchText, getX, getId }),
  [items, filters, filter, query, descending, getSearchText, getX, getId]);
  const safePageSize = Math.max(1, Math.min(100, Math.floor(pageSize)));
  const pages = Math.max(1, Math.ceil(rows.length / safePageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = rows.slice(currentPage * safePageSize, (currentPage + 1) * safePageSize);
  const selected = items.filter(item => selectedIds?.includes(getId(item)) && canSave?.(item));
  const hasSelection = selectedIds !== undefined && !!onSelectedIdsChange;
  return <div className="graph2d-numerical-results" data-result-key={resultKey}>
    <div className="graph2d-critical-controls">
      <div role="group" aria-label={controlsLabel}>
        {filters.map(entry => <button key={entry.id} type="button" aria-pressed={filter === entry.id}
          onClick={() => setFilter(entry.id)}>{entry.label}</button>)}
      </div>
      <label>{searchLabel} <input aria-label={searchLabel} value={query}
        onChange={event => setQuery(event.target.value)} /></label>
    </div>
    <div className="graph2d-critical-table-wrap"><table aria-label={tableLabel}>
      <thead><tr>{hasSelection && <th scope="col">Select</th>}<th scope="col">Kind</th>
        <th scope="col"><button type="button" aria-label={sortLabel}
          onClick={() => setDescending(value => !value)}>{xLabel} {descending ? "↓" : "↑"}</button></th>
        {columns.map(column => <th key={column.id} scope="col">{column.label}</th>)}
        {onSaveOne && <th scope="col">Save</th>}</tr></thead>
      <tbody>{visible.map(item => {
        const id = getId(item), saveable = canSave?.(item) ?? false;
        return <tr key={id} data-result-row-id={id}
          className={isActive?.(item) ? "graph2d-critical-active" : undefined}>
          {hasSelection && <td><input type="checkbox" aria-label={`Select ${getKind(item)} at ${xLabel} ${getX(item).toPrecision(7)} for saving`}
            checked={selectedIds?.includes(id) ?? false} disabled={!saveable}
            onChange={event => onSelectedIdsChange?.(event.target.checked ? [...(selectedIds ?? []), id] :
              (selectedIds ?? []).filter(current => current !== id))} /></td>}
          <td>{onFocus ? <button type="button" aria-label={focusLabel?.(item) ?? `Select ${getKind(item)} at ${xLabel} ${getX(item).toPrecision(7)}`}
            disabled={canFocus ? !canFocus(item) : false} onClick={() => onFocus(item)}>{getKind(item)}</button> : getKind(item)}</td>
          <td>{formatX ? formatX(item) : getX(item).toPrecision(7)}</td>
          {columns.map(column => <td key={column.id}>{column.render(item)}</td>)}
          {onSaveOne && <td><button type="button" aria-label={saveLabel?.(item) ??
            `Save ${getKind(item)} at ${xLabel} ${getX(item).toPrecision(7)} as construction`}
            disabled={!saveable} onClick={() => onSaveOne(item)}>Save</button></td>}
        </tr>;
      })}</tbody>
    </table>{!rows.length && <p>{items.length ? "No matching results." : emptyText}</p>}</div>
    {rows.length > safePageSize && <div className="graph2d-result-pages" role="group" aria-label="Result pages">
      <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
      <span>Rows {currentPage * safePageSize + 1}–{Math.min(rows.length, (currentPage + 1) * safePageSize)} of {rows.length}</span>
      <button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button>
    </div>}
    {(onSaveSelected || exportCsv || exportJson || extraActions) && <div className="graph2d-critical-actions">
      {onSaveSelected && <button type="button" disabled={!selected.length || !(canSaveSelected?.(selected) ?? true)}
        onClick={() => onSaveSelected(selected)}>Save selected ({selected.length})</button>}
      {extraActions}
      {exportCsv && <button type="button" title="Download CSV" onClick={exportCsv}>Export results</button>}
      {exportJson && <button type="button" onClick={exportJson}>Export numerical JSON</button>}
    </div>}
  </div>;
}
