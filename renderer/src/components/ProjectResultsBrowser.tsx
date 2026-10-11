import React, { useMemo, useRef, useState } from "react";
import type { KernelWorkspaceModule, Math3DProject } from "@math3d/core";
import type { ProjectDependencyInspection } from "../projects/projectDependencies";
import { presentProjectFreshness } from "../projects/projectFreshnessPresentation";

type Selection = { kind: "result" | "artifact"; id: string };
type Props = {
  project: Math3DProject;
  inspection: ProjectDependencyInspection | null;
  titles: ReadonlyMap<string, string>;
  canOpen: (id: string, module: KernelWorkspaceModule) => boolean;
  onOpen: (id: string, module: KernelWorkspaceModule) => void;
};

const readable = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);
const bytes = (value: number | null) => value === null ? "Size not recorded" : `${value.toLocaleString()} bytes`;

export const ProjectResultsBrowser: React.FC<Props> = ({ project, inspection, titles, canOpen, onOpen }) => {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const detailRef = useRef<HTMLElement>(null);
  const select = (next: Selection) => {
    setSelection(next);
    if (window.innerWidth <= 760) window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      detailRef.current?.focus({ preventScroll: true });
    });
  };
  const results = project.workspace.results;
  const artifacts = useMemo(() => {
    const items = [...project.workspace.artifacts];
    const manifestIds = new Set(items.map(item => item.handle.artifactId));
    for (const result of results) for (const handle of result.artifacts) if (!manifestIds.has(handle.artifactId)) {
      items.push({ handle, contentHash: null, byteLength: null });
      manifestIds.add(handle.artifactId);
    }
    return items;
  }, [project.workspace.artifacts, results]);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredResults = results.filter(result => !normalizedQuery || [result.provenance.operation.type, result.provenance.operation.algorithm,
    titles.get(result.provenance.source.documentId) ?? result.provenance.source.documentId, result.resultId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery)));
  const filteredArtifacts = artifacts.filter(artifact => !normalizedQuery || [artifact.handle.role, artifact.handle.kind, artifact.handle.artifactId]
    .some(value => value.toLocaleLowerCase().includes(normalizedQuery)));
  const active = selection && (selection.kind === "result" ? results.some(result => result.resultId === selection.id) : artifacts.some(artifact => artifact.handle.artifactId === selection.id))
    ? selection : results[0] ? { kind: "result" as const, id: results[0].resultId } : artifacts[0] ? { kind: "artifact" as const, id: artifacts[0].handle.artifactId } : null;
  const result = active?.kind === "result" ? results.find(item => item.resultId === active.id) : undefined;
  const artifact = active?.kind === "artifact" ? artifacts.find(item => item.handle.artifactId === active.id) : undefined;
  const resultStatus = result && inspection?.results.find(item => item.id === result.resultId);
  const artifactStatus = artifact && inspection?.artifacts.find(item => item.id === artifact.handle.artifactId);
  const linkedResults = artifact ? results.filter(item => item.artifacts.some(handle => handle.artifactId === artifact.handle.artifactId)) : [];
  const artifactRelations = artifact ? project.workspace.relations.filter(relation => relation.target.type === "artifact" && relation.target.artifactId === artifact.handle.artifactId) : [];
  const sourceButton = (id: string) => {
    const entry = project.workspace.entries.find(item => item.expected.id === id);
    return <button type="button" disabled={!entry || !canOpen(id, entry.module)} onClick={() => entry && onOpen(id, entry.module)}>{titles.get(id) ?? id}</button>;
  };

  return <div className="project-results-browser" data-testid="project-results-browser">
    <label className="project-results-search">Search saved outputs
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Operation, source or artifact" />
    </label>
    <div className="project-results-layout">
      <nav className="project-results-list" aria-label="Saved results and artifacts">
        <h4>Results ({results.length})</h4>
        {filteredResults.map(item => {
          const status = inspection?.results.find(candidate => candidate.id === item.resultId);
          const freshness = status && presentProjectFreshness(status.freshness);
          return <button type="button" key={item.resultId} data-testid={`project-result-select-${item.resultId}`}
            aria-current={active?.kind === "result" && active.id === item.resultId ? "true" : undefined}
            onClick={() => select({ kind: "result", id: item.resultId })}>
            <strong>{item.provenance.operation.type}</strong>
            <small>{titles.get(item.provenance.source.documentId) ?? item.provenance.source.documentId} · {item.status}</small>
            {freshness && <span className="project-freshness-badge" data-tone={freshness.tone}>{freshness.label}</span>}
          </button>;
        })}
        {!filteredResults.length && <p>{results.length ? "No matching results." : "No saved results yet."}</p>}
        <h4>Artifacts ({artifacts.length})</h4>
        {filteredArtifacts.map(item => {
          const available = inspection?.artifacts.find(candidate => candidate.id === item.handle.artifactId)?.available ?? false;
          return <button type="button" key={item.handle.artifactId} data-testid={`project-artifact-select-${item.handle.artifactId}`}
            aria-current={active?.kind === "artifact" && active.id === item.handle.artifactId ? "true" : undefined}
            onClick={() => select({ kind: "artifact", id: item.handle.artifactId })}>
            <strong>{item.handle.role}</strong><small>{item.handle.kind}</small>
            <span className="project-freshness-badge" data-tone={available ? "current" : "unavailable"}>{available ? "Available" : "Unavailable"}</span>
          </button>;
        })}
        {!filteredArtifacts.length && <p>{artifacts.length ? "No matching artifacts." : "No saved artifacts yet."}</p>}
      </nav>
      <section ref={detailRef} tabIndex={-1} className="project-results-detail" aria-label="Selected saved output" data-testid="project-result-detail">
        {result && <>
          <div className="project-results-detail-heading"><div><small>ANALYSIS RESULT</small><h4>{result.provenance.operation.type}</h4></div>
            {resultStatus && <span className="project-freshness-badge" data-tone={presentProjectFreshness(resultStatus.freshness).tone}>{presentProjectFreshness(resultStatus.freshness).label}</span>}
          </div>
          <p>Recorded status: <strong>{result.status}</strong>{resultStatus?.missingArtifactIds.length ? ` · ${resultStatus.missingArtifactIds.length} unavailable artifact(s)` : ""}</p>
          <dl><div><dt>Source document</dt><dd>{sourceButton(result.provenance.source.documentId)}</dd></div>
            <div><dt>Source generation</dt><dd>Revision {result.provenance.source.revision} · generation {result.provenance.source.generation}</dd></div>
            <div><dt>Source hash</dt><dd><code>{result.provenance.source.structuralHash}</code></dd></div>
            <div><dt>Method</dt><dd>{result.provenance.operation.algorithm} · version {result.provenance.operation.algorithmVersion}</dd></div>
            <div><dt>Engine</dt><dd>{result.provenance.engine.name} {result.provenance.engine.version}</dd></div>
            <div><dt>Run time</dt><dd>{result.provenance.elapsedMs.toLocaleString()} ms</dd></div></dl>
          <h5>Summary</h5>
          {Object.keys(result.summary).length ? <dl>{Object.entries(result.summary).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><code>{readable(value)}</code></dd></div>)}</dl> : <p>No summary values recorded.</p>}
          {result.artifacts.length > 0 && <><h5>Artifacts</h5><div className="project-results-links">{result.artifacts.map(handle => <button type="button" key={handle.artifactId}
            onClick={() => select({ kind: "artifact", id: handle.artifactId })}>{handle.role} · {handle.kind}</button>)}</div></>}
          {(result.warnings.length > 0 || result.diagnostics.length > 0) && <details><summary>Warnings and diagnostics ({result.warnings.length + result.diagnostics.length})</summary>
            <ul>{result.warnings.map((warning, index) => <li key={`warning-${index}`}>{warning}</li>)}
              {result.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.code}-${index}`}>{diagnostic.severity} · {diagnostic.code}: {diagnostic.message}</li>)}</ul>
          </details>}
          <details><summary>Operation parameters</summary><pre>{JSON.stringify(result.provenance.operation.parameters, null, 2)}</pre></details>
          <small>Result ID: {result.resultId}</small>
        </>}
        {artifact && <>
          <div className="project-results-detail-heading"><div><small>ARTIFACT</small><h4>{artifact.handle.role}</h4></div>
            <span className="project-freshness-badge" data-tone={artifactStatus?.available ? "current" : "unavailable"}>{artifactStatus?.available ? "Available" : "Unavailable"}</span>
          </div>
          <dl><div><dt>Kind</dt><dd>{artifact.handle.kind}</dd></div>
            <div><dt>Size</dt><dd>{bytes(artifact.byteLength)}</dd></div>
            <div><dt>Checksum</dt><dd><code>{artifact.contentHash ?? "Not recorded"}</code></dd></div>
            <div><dt>Artifact ID</dt><dd><code>{artifact.handle.artifactId}</code></dd></div></dl>
          <h5>Referenced by saved results ({linkedResults.length})</h5>
          {linkedResults.length ? <div className="project-results-links">{linkedResults.map(item => <button type="button" key={item.resultId}
            onClick={() => select({ kind: "result", id: item.resultId })}>{item.provenance.operation.type} · {titles.get(item.provenance.source.documentId) ?? item.provenance.source.documentId} · r{item.provenance.source.revision} g{item.provenance.source.generation}</button>)}</div> : <p>No result reference recorded.</p>}
          <h5>Recorded relation sources ({artifactRelations.length})</h5>
          {artifactRelations.length ? <ul>{artifactRelations.flatMap(relation => relation.sources.map(source => <li key={`${relation.relationId}:${source.documentId}`}>
            {sourceButton(source.documentId)} · revision {source.revision} · generation {source.generation}
          </li>))}</ul> : <p>No direct relation to a source document recorded.</p>}
        </>}
        {!result && !artifact && <p>No saved result or artifact is available to inspect.</p>}
      </section>
    </div>
  </div>;
};
