import { useState } from "react";
import { createWorkbookAlgebraObjectCell, inspectWorkbookAlgebraObjectCell,
  recomputeWorkbookAlgebraObjectCell, type WorkbookAlgebraObjectCell } from "@math3d/workbook";
import type { Math3DProject } from "@math3d/core";

type Props = { cell?: WorkbookAlgebraObjectCell; project: Math3DProject | null;
  readOnly: boolean; onChange: (cell: WorkbookAlgebraObjectCell) => void };

export function WorkbookAlgebraObjectCell({ cell, project, readOnly, onChange }: Props) {
  const [selected, setSelected] = useState(cell?.source.objectId ?? "");
  const [error, setError] = useState("");
  const options = project?.algebraObjects?.filter((entry) => !entry.archived) ?? [];
  const inspection = cell ? inspectWorkbookAlgebraObjectCell(project, cell) : null;
  const latest = cell?.runs.at(-1);
  const compute = () => {
    if (!project || !selected || readOnly) return;
    setError("");
    try {
      const id = options.find((entry) => entry.id === selected)?.id;
      if (!id) throw new TypeError("Choose a saved Project algebra object.");
      const next = cell?.source.projectId === project.identity.id && cell.source.objectId === id
        ? recomputeWorkbookAlgebraObjectCell(project, cell)
        : createWorkbookAlgebraObjectCell(project, id);
      onChange(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Algebra object computation failed."); }
  };
  return <section data-testid="workbook-algebra-object-cell" style={{ display: "grid", gap: 7,
    border: "1px solid #b9d6ea", borderRadius: 7, padding: 9, background: "#f8fbff", fontSize: 11 }}>
    <strong>Typed Project algebra object</strong>
    <div>The output pins one exact object definition and revision. Recompute reads the latest fresh Project revision and keeps prior runs.</div>
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <label>Saved object <select aria-label="Workbook algebra object" value={selected}
        disabled={readOnly || !project} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Choose object</option>
        {options.map((entry) => { const current = entry.revisions.at(-1)!;
          return <option key={entry.id} value={entry.id}>{current.label} · {current.definition.kind} @r{current.revision}</option>; })}
      </select></label>
      <button type="button" data-testid="workbook-algebra-object-compute" disabled={readOnly || !project || !selected}
        onClick={compute}>{cell?.source.objectId === selected ? "Recompute latest revision" : "Compute selected object"}</button>
    </div>
    {!project && <div role="status">Open and save the linked Project to inspect or recompute this cell.</div>}
    {error && <div role="alert">{error}</div>}
    <strong data-testid="workbook-algebra-object-freshness">{inspection?.status ?? "unbound"}</strong>
    {inspection && <div>{inspection.reason}</div>}
    {latest && <div data-testid="workbook-algebra-object-output" style={{ display: "grid", gap: 4 }}>
      <div><strong>{latest.output.objectKind}</strong> · {latest.output.record.label} · revision {latest.output.ref.revision}</div>
      <div>Project {latest.source.projectId} · object {latest.output.ref.objectId}</div>
      <div>Definition hash {latest.source.contentHash} · output hash {latest.outputHash}</div>
      <pre style={{ margin: 0, padding: 7, background: "white", border: "1px solid #cbd5e1",
        whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 200, overflow: "auto" }}>
        {JSON.stringify(latest.output.record.definition, null, 2)}</pre>
    </div>}
    {(cell?.runs.length ?? 0) > 1 && <details><summary>Earlier revisions ({cell!.runs.length - 1})</summary>
      {cell!.runs.slice(0, -1).map((run) => <div key={`${run.source.objectId}@${run.source.revision}`}>
        {run.output.record.label} @r{run.source.revision} · {run.source.contentHash}
      </div>)}</details>}
  </section>;
}
