import React, { useEffect, useState } from "react";
import type { Workbook } from "@math3d/workbook";
export type PublicationKind = "markdown" | "html" | "pdf" | "portable";
export const WorkbookPublication = ({ workbook, onExport }: { workbook: Workbook; onExport: (kind: PublicationKind, blockIds: string[]) => Promise<void> }) => {
  const blocks = workbook.stages.flatMap(stage => stage.blocks), [selected, setSelected] = useState<string[]>(blocks.map(block => block.id)), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  useEffect(() => { setSelected(workbook.stages.flatMap(stage => stage.blocks).map(block => block.id)); setMessage(""); }, [workbook.id]);
  return <details data-testid="workbook-publication" style={{ fontSize: 11 }}><summary>Publish selected report blocks</summary>
    <p>Choose report content. Exact citations, source freshness and qualifications accompany every format. Portable reports include verified source and artifact bytes plus the ordinary saved Project.</p>
    {blocks.map(block => <label key={block.id} style={{ display: "block" }}><input type="checkbox" checked={selected.includes(block.id)} onChange={event => setSelected(current => event.target.checked ? [...current, block.id] : current.filter(id => id !== block.id))} />{block.title}</label>)}
    {(["markdown", "html", "pdf", "portable"] as const).map(kind => <button key={kind} disabled={busy || !selected.some(id => blocks.some(block => block.id === id))} onClick={async () => {
      setBusy(true); setMessage(""); try { await onExport(kind, selected); setMessage("Report prepared with a linked-source manifest."); } catch (error) { setMessage(`Publication failed: ${(error as Error).message}`); } finally { setBusy(false); }
    }}>{({ markdown: "Export selected Markdown", html: "Export selected HTML", pdf: "Print selected / PDF", portable: "Export portable report" })[kind]}</button>)}
    {message && <p role="status">{message}</p>}
  </details>;
};
