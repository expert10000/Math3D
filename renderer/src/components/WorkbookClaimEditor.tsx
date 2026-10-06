import React, { useState } from "react";
import { PROJECT_NOTE_RESULT_VALUE_FIELDS, structuralHash, type Math3DProject } from "@math3d/core";
import { assessWorkbookClaim, createNotebookReference, normalizeWorkbookClaim, workbookClaimSnapshot,
  type NotebookArtifactReader, type Workbook, type WorkbookBlock, type WorkbookClaim } from "@math3d/workbook";
import { WorkbookProvenance } from "./WorkbookProvenance";

export const WorkbookClaimEditor = ({ workbook, block, project, projectLive, reader, readOnly, onChange }: {
  workbook: Workbook; block: WorkbookBlock; project: Math3DProject | null; projectLive: boolean; reader?: NotebookArtifactReader;
  readOnly: boolean; onChange: (claim: WorkbookClaim | undefined) => void;
}) => {
  const claim = block.claim;
  const [selection, setSelection] = useState(""), [index, setIndex] = useState(""), [field, setField] = useState<typeof PROJECT_NOTE_RESULT_VALUE_FIELDS[number]>("mean.avg");
  const [min, setMin] = useState("-0.01"), [max, setMax] = useState("0.01"), [error, setError] = useState("");
  const verdict = claim ? assessWorkbookClaim(claim, workbook, project) : null;
  const snapshots = workbook.stages.flatMap(stage => stage.blocks).filter(item => item.type === "visualize").flatMap(item => (["A", "B"] as const).filter(slot => workbookClaimSnapshot(workbook, item.id, slot)).map(slot => ({ value: `s:${JSON.stringify([item.id, slot])}`, label: `${item.title} · Snapshot ${slot}` })));
  const options = [...(projectLive ? project?.workspace.results.map(result => ({ value: `r:${result.resultId}`, label: `${result.provenance.operation.type} · ${result.status} · r${result.provenance.source.revision}` })) ?? [] : []), ...snapshots];
  const save = (value: WorkbookClaim) => { try { onChange(normalizeWorkbookClaim(value)); setError(""); } catch (cause) { setError((cause as Error).message); } };
  return <div data-testid="workbook-evidence-claim" style={{ display: "grid", gap: 6, padding: 8, border: "1px solid #cbd5e1", borderRadius: 8, minWidth: 0 }}>
    <strong>Evidence claim{verdict ? ` · ${verdict.status}` : ""}</strong>
    {!claim ? <button type="button" disabled={readOnly} onClick={() => save({ schemaVersion: 1, text: "", evidence: [] })}>Write evidence claim</button> : <>
      <textarea aria-label="Evidence claim text" value={claim.text} maxLength={4096} rows={3} readOnly={readOnly} onChange={event => save({ schemaVersion: 1, text: event.target.value, evidence: claim.evidence })} style={{ width: "100%", boxSizing: "border-box" }} />
      <p data-testid="workbook-claim-status" style={{ margin: 0 }}>{verdict?.status}: {verdict?.reason}</p>
      {claim.evidence.map((item, evidenceIndex) => <div key={evidenceIndex} style={{ overflowWrap: "anywhere" }}>
        <span>Citation {evidenceIndex + 1}: {item.kind === "result" ? `${item.reference.targetId} · r${item.reference.source.revision}` : `Snapshot ${item.slot} · ${item.blockId}`}</span>
        <button type="button" disabled={readOnly} onClick={() => save({ schemaVersion: 1, text: claim.text, evidence: claim.evidence.filter((_, i) => i !== evidenceIndex) })}>Remove citation {evidenceIndex + 1}</button>
        {item.kind === "result" && <WorkbookProvenance project={project} reference={item.reference} reader={reader} />}
      </div>)}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, minWidth: 0 }}>
        <select aria-label="Claim evidence" value={selection} onChange={event => setSelection(event.target.value)} style={{ width: "100%" }}><option value="">Choose saved result or snapshot</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
        <button type="button" disabled={!selection || claim.evidence.length >= 8} onClick={() => {
          try {
            const evidence = selection.startsWith("r:") && project && projectLive ? { kind: "result" as const, reference: createNotebookReference(project, "result", selection.slice(2)) as Extract<ReturnType<typeof createNotebookReference>, { kind: "result" }> } : (() => {
              const [blockId, slot] = JSON.parse(selection.slice(2)) as [string, "A" | "B"];
              const snapshot = workbookClaimSnapshot(workbook, blockId, slot); if (!snapshot) throw new Error("Snapshot is unavailable.");
              return { kind: "snapshot" as const, blockId, slot, hash: structuralHash(snapshot) };
            })();
            save({ schemaVersion: 1, text: claim.text, evidence: [...claim.evidence, evidence] });
          } catch (cause) { setError((cause as Error).message); }
        }}>Cite evidence</button>
        <details><summary>Bounded scalar checker</summary>
          <p>Check one saved summary field against inclusive bounds in its reported units. Free text and snapshots alone remain unverified.</p>
          <select aria-label="Checker citation" value={index} onChange={event => setIndex(event.target.value)} style={{ width: "100%" }}><option value="">Choose result citation</option>{claim.evidence.map((item, i) => item.kind === "result" && <option key={i} value={i}>Citation {i + 1}: {item.reference.targetId}</option>)}</select>
          <select aria-label="Checker field" value={field} onChange={event => setField(event.target.value as typeof field)}>{PROJECT_NOTE_RESULT_VALUE_FIELDS.map(value => <option key={value}>{value}</option>)}</select>
          <div style={{ display: "flex", gap: 5 }}><input aria-label="Checker minimum" value={min} onChange={event => setMin(event.target.value)} style={{ width: "50%", minWidth: 0 }} /><input aria-label="Checker maximum" value={max} onChange={event => setMax(event.target.value)} style={{ width: "50%", minWidth: 0 }}/></div>
          <button type="button" disabled={index === ""} onClick={() => {
            if (!min.trim() || !max.trim()) { setError("Enter finite bounds."); return; }
            save({ ...claim, checker: { kind: "scalar-range", evidenceIndex: Number(index), field, min: Number(min), max: Number(max) } });
          }}>Check bounded scalar</button>
          {claim.checker && <><p>Saved checker: citation {claim.checker.evidenceIndex + 1}, {claim.checker.field} ∈ [{claim.checker.min}, {claim.checker.max}]</p><button type="button" onClick={() => save({ schemaVersion: 1, text: claim.text, evidence: claim.evidence })}>Clear checker</button></>}
        </details>
      </fieldset>
      <button type="button" disabled={readOnly} onClick={() => onChange(undefined)}>Remove evidence claim</button>
    </>}
    {error && <p role="alert">{error}</p>}
  </div>;
};
