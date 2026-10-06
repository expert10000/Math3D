import React, { useState } from "react";
import { normalizeWorkbookDocumentContent, type WorkbookBlock, type WorkbookDocumentContent } from "@math3d/workbook";

const TableEditor = ({ content, onChange, readOnly }: { content: Extract<WorkbookDocumentContent, { kind: "table" }>; onChange: (content: WorkbookDocumentContent) => void; readOnly: boolean }) => {
  const [caption, setCaption] = useState(content.caption), [columns, setColumns] = useState(content.columns.join("\t")), [rows, setRows] = useState(content.rows.map(row => row.join("\t")).join("\n")), [error, setError] = useState("");
  return <fieldset disabled={readOnly} style={{ minWidth: 0 }}><legend>Table content</legend>
    <label style={{ display: "block" }}>Caption<input aria-label="Table caption" value={caption} maxLength={512} onChange={event => setCaption(event.target.value)} style={{ width: "100%", boxSizing: "border-box" }} /></label>
    <label style={{ display: "block" }}>Column names, separated by tabs<textarea aria-label="Table columns" value={columns} onChange={event => setColumns(event.target.value)} rows={2} style={{ width: "100%", boxSizing: "border-box" }} /></label>
    <label style={{ display: "block" }}>Rows, one per line; paste tab-separated cells<textarea aria-label="Table rows" value={rows} onChange={event => setRows(event.target.value)} rows={4} style={{ width: "100%", boxSizing: "border-box" }} /></label>
    <button type="button" data-testid="workbook-table-apply" onClick={() => {
      try { onChange(normalizeWorkbookDocumentContent({ schemaVersion: 1, kind: "table", caption, columns: columns.split("\t"), rows: rows ? rows.split(/\r?\n/).map(row => row.split("\t")) : [] })); setError(""); }
      catch (failure) { setError((failure as Error).message); }
    }}>Apply table</button><small> Up to 12 columns and 100 rows. Cells are literal content.</small>
    {error && <p role="alert">{error}</p>}
  </fieldset>;
};

export const WorkbookContentEditor = ({ block, onChange, readOnly }: { block: WorkbookBlock; onChange: (patch: Partial<WorkbookBlock>) => void; readOnly: boolean }) => {
  const content = block.documentContent;
  return <div data-testid="workbook-content-editor" style={{ display: "grid", gap: 5 }}>
    {block.type === "text" && !content && <button type="button" disabled={readOnly} onClick={() => onChange({ documentContent: { schemaVersion: 1, kind: "table", caption: "Measurements", columns: ["Parameter", "Value"], rows: [["", ""]] } })}>Add table to this block</button>}
    {block.type === "visualize" && !content && <button type="button" disabled={readOnly} onClick={() => onChange({ documentContent: { schemaVersion: 1, kind: "figure", caption: block.title || "Captured view", alt: block.title || "Captured mathematical view" } })}>Add figure caption and description</button>}
    {content?.kind === "table" && <TableEditor key={JSON.stringify(content)} content={content} readOnly={readOnly} onChange={documentContent => onChange({ documentContent })} />}
    {content?.kind === "figure" && <fieldset disabled={readOnly} style={{ minWidth: 0 }}><legend>Figure description</legend>
      <label style={{ display: "block" }}>Caption<input aria-label="Figure caption" value={content.caption} maxLength={512} onChange={event => onChange({ documentContent: { ...content, caption: event.target.value } })} style={{ width: "100%", boxSizing: "border-box" }} /></label>
      <label style={{ display: "block" }}>Accessible description<input aria-label="Figure description" value={content.alt} maxLength={512} onChange={event => onChange({ documentContent: { ...content, alt: event.target.value } })} style={{ width: "100%", boxSizing: "border-box" }} /></label>
      <small>Uses the existing captured Snapshot A. Capture or replace it in Block view.</small>
    </fieldset>}
    {content && <button type="button" disabled={readOnly} onClick={() => onChange({ documentContent: undefined })}>Remove document content</button>}
  </div>;
};
