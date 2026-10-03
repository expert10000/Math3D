import React from "react";
import type { ProjectDependencyInspection } from "../projects/projectDependencies";

type Props = { inspection: ProjectDependencyInspection; selectedId: string | null; titles: ReadonlyMap<string, string>;
  refreshOptions?: readonly { relationId: string; canRefresh: boolean; reason: string }[]; onRefresh?: (relationId: string) => void;
  analysisRefreshOptions?: readonly { resultId: string; label?: string; canRecompute: boolean; reason: string }[]; onRecompute?: (resultId: string) => void;
  onLocate: (id: string) => void; onClose: () => void };
export const ProjectDependenciesPanel: React.FC<Props> = ({ inspection, selectedId, titles, onLocate, onClose, refreshOptions, onRefresh, analysisRefreshOptions, onRecompute }) => {
  const document = inspection.documents.find((document) => document.id === selectedId);
  const relations = selectedId ? inspection.relations.filter((relation) => relation.sources.some((source) => source.documentId === selectedId) ||
    (relation.target.type === "document" && relation.target.generation.documentId === selectedId)) : inspection.relations;
  const results = selectedId ? inspection.results.filter((result) => result.source.documentId === selectedId) : inspection.results;
  const locate = (id: string) => <button type="button" disabled={!titles.has(id)} onClick={() => onLocate(id)} style={{ maxWidth: "100%", textAlign: "left", overflowWrap: "anywhere" }}>{titles.get(id) ?? `Missing source: ${id}`}</button>;
  return <section data-testid="project-dependencies" style={{ marginTop: 12, border: "1px solid #94a3b8", borderRadius: 6, padding: 8, overflowWrap: "anywhere" }}>
    <strong>{document ? `Dependencies: ${titles.get(document.id)}` : "Project relations and availability"}</strong>
    <button type="button" onClick={onClose} style={{ marginLeft: 6 }}>Close inspection</button>
    {document && <div data-testid="project-document-freshness">Source revision {document.revision} · lineage {document.freshness}{document.snapshot ? " · independent source snapshot" : ""}<small style={{ display: "block" }}>{document.structuralHash}</small></div>}
    <p>Snapshots retain recorded source generations. Derived records are not automatically recomputed.</p>
    <strong>Relations ({relations.length})</strong>
    {relations.map((relation) => <article key={relation.relationId} data-testid={`project-relation-${relation.relationId}`} style={{ padding: "8px 0", borderBottom: "1px solid #e2e8f0" }}>
      <div>{relation.kind} · {relation.freshness}{relation.snapshot ? " · snapshot" : ""}</div>
      <small>{relation.operation}</small>
      {onRefresh && refreshOptions?.filter(option => option.relationId === relation.relationId).map(option =>
        <div key={option.relationId}><button type="button" data-testid={`project-refresh-${relation.relationId}`} disabled={!option.canRefresh}
          onClick={() => onRefresh(relation.relationId)}>Create refreshed copy</button><small style={{ display: "block" }}>{option.reason}</small></div>)}
      {relation.sources.map((source) => <div key={`${source.documentId}:${source.revision}`}>Source {locate(source.documentId)} · recorded revision {source.revision} · generation {source.generation}</div>)}
      <div>Target {relation.target.type === "document" ? locate(relation.target.generation.documentId) : relation.target.type === "result" ? `Analysis ${relation.target.resultId}` : `Artifact ${relation.target.artifactId}`}</div>
    </article>)}
    {!relations.length && <p>No recorded relations.</p>}
    <strong>Analysis provenance ({results.length})</strong>
    {results.map((result) => <article key={result.id} data-testid={`project-result-status-${result.id}`} style={{ padding: "8px 0" }}>
      <div>{result.operation} · authority {result.authority} · source {result.sourceFreshness} · artifacts {result.missingArtifactIds.length ? "unavailable" : "available"}</div>
      {onRecompute && analysisRefreshOptions?.filter(option => option.resultId === result.id).map(option =>
        <div key={option.resultId}><button type="button" data-testid={`project-recompute-${result.id}`} disabled={!option.canRecompute}
          onClick={() => onRecompute(result.id)}>{option.label ?? "Recompute analysis"}</button><small style={{ display: "block" }}>{option.reason}</small></div>)}
      <div>Source {locate(result.source.documentId)} · revision {result.source.revision} · generation {result.source.generation}</div>
      <small>{result.source.structuralHash} · engine {result.engine.name} {result.engine.version}</small>
      {result.warnings.map((warning, index) => <div key={index}>{warning}</div>)}
      {!!result.missingArtifactIds.length && <div>Missing or unverified artifacts: {result.missingArtifactIds.join(", ")}</div>}
    </article>)}
    {!results.length && <p>No analysis records for this selection.</p>}
    <strong>External artifacts ({inspection.artifacts.length})</strong>
    {inspection.artifacts.map((artifact) => <div key={artifact.id} data-testid={`project-artifact-${artifact.id}`}>
      {artifact.role} · {artifact.kind} · {artifact.available ? "available" : "missing or unverified"}<small style={{ display: "block" }}>{artifact.id} · {artifact.contentHash ?? "No checksum"}</small>
    </div>)}
    {!inspection.artifacts.length && <p>No external artifact manifest.</p>}
  </section>;
};
