import React, { useState } from "react";
import type { Math3DProject, ScientificSourceGeneration } from "@math3d/core";
import { inspectNotebookProvenance, type NotebookArtifactReader, type NotebookReference } from "@math3d/workbook";

const generation = (source: ScientificSourceGeneration) => `${source.documentId} · revision ${source.revision} · generation ${source.generation} · ${source.structuralHash}`;
export const WorkbookProvenance = ({ project, reference, reader }: { project: Math3DProject | null; reference: NotebookReference; reader?: NotebookArtifactReader }) => {
  const [open, setOpen] = useState(false);
  const { inspection, result, relations, artifacts } = inspectNotebookProvenance(project, reference, open ? reader : undefined);
  return <details data-testid="workbook-provenance" open={open} onToggle={event => setOpen(event.currentTarget.open)} style={{ fontSize: 11, overflowWrap: "anywhere", minWidth: 0 }}>
    <summary>Provenance · {inspection?.status ?? "unresolved"}{result ? ` · ${result.status}` : ""}</summary>
    <p>Recorded source: {generation(reference.source)}</p>
    {inspection?.currentSource && <p>Current source: {generation(inspection.currentSource)}</p>}
    <p>{inspection?.reason ?? "Open the referenced Project to inspect its source."}</p>
    {inspection?.status === "stale" && <p>Historical evidence remains visible. It does not describe the edited source.</p>}
    {result && <>
      <p>Result: {result.resultId}</p>
      <p>Authority: {result.status} · method: {result.provenance.operation.algorithm} v{result.provenance.operation.algorithmVersion} · backend: {result.provenance.engine.name} v{result.provenance.engine.version}</p>
      <p>Operation: {result.provenance.operation.type} · elapsed {result.provenance.elapsedMs} ms</p>
      <p>Parameters: {JSON.stringify(result.provenance.operation.parameters)}</p>
      <p>Numeric context: {result.provenance.numericContext ? JSON.stringify(result.provenance.numericContext) : "not reported"}</p>
      <p>Saved summary: {JSON.stringify(result.summary)}</p>
      <p>Warnings: {result.warnings.length ? result.warnings.join("; ") : "none reported"}</p>
      {result.diagnostics.length > 0 && <p>Diagnostics: {JSON.stringify(result.diagnostics)}</p>}
      <div data-testid="workbook-artifact-availability">{artifacts.length ? artifacts.map(item => <p key={item.handle.artifactId}>{item.handle.role}: {item.status} · {item.reason}</p>) : "This saved result declares no artifact sidecars."}</div>
    </>}
    <strong>Project relations ({relations.length})</strong>
    {relations.map(({ relation, status }) => <div key={relation.relationId} style={{ borderTop: "1px solid #dbeafe", paddingTop: 4 }}>
      <p>{relation.kind} · {relation.operation} · {status} · {relation.tool ? `${relation.tool.name} v${relation.tool.version}` : "tool not reported"}</p>
      <p>{relation.relationId} · target {JSON.stringify(relation.target)}</p>
      {relation.sources.map(source => <p key={`${source.documentId}:${source.generation}`}>Source: {generation(source)}</p>)}
      <p>Relation parameters: {JSON.stringify(relation.parameters)}</p>
    </div>)}
  </details>;
};
