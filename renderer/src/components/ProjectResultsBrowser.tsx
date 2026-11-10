import React, { useEffect, useMemo, useRef, useState } from "react";
import { VECTOR_FIELD3D_POINT_RESULT_TYPE, VECTOR_FIELD3D_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE, type KernelWorkspaceModule,
  VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE,
  VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE,
  VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE,
  VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE,
  type Math3DProject, type ScientificSourceGeneration,
  presentAnalysisResultClaim } from "@math3d/core";
import type { ProjectDependencyInspection } from "../projects/projectDependencies";
import { presentProjectResultCard } from "../projects/projectResultCard";
import { createProjectResultEvidence, createProjectResultEvidenceCsv } from "../projects/projectResultEvidence";
import { resultNoteReferences, resultStudyReferences, resultWorkbookReferences } from
  "../projects/projectResultReferences";
import type { WorkbookStageId } from "@math3d/workbook";
import type { SavedRegionSourceStatus } from "../vectorfield3d/checkSavedRegionResultSources";
import { isScientificSubrectangle } from
  "../projects/scientificSubrectangleWorkbook";
import { isScientificTrajectory } from "../projects/scientificTrajectoryWorkbook";
import { isScientificEquilibrium } from "../projects/scientificEquilibriumWorkbook";
import type { ProjectResourceReader } from "../projects/projectResources";
import { verifySavedMeshResult } from "../projects/projectSavedMeshResultComparison";
import { projectResultSourceLink } from "../projects/projectResultSourceLink";
import { presentProjectResultVerification } from "../projects/projectResultVerification";
import { projectResultActionPolicy } from "../projects/projectResultActionPolicy";

const ProjectSavedMeshGenerationPreview = React.lazy(() => import("./ProjectSavedMeshGenerationPreview").then(module => ({ default: module.ProjectSavedMeshGenerationPreview })));

type Selection = { kind: "result" | "artifact"; id: string };
type Props = {
  project: Math3DProject;
  inspection: ProjectDependencyInspection | null;
  titles: ReadonlyMap<string, string>;
  canOpen: (id: string, module: KernelWorkspaceModule) => boolean;
  onOpen: (id: string, module: KernelWorkspaceModule) => void;
  focusResult?: { id: string; token: number } | null;
  readResource?: ProjectResourceReader;
  regionResultStatuses?: Readonly<Record<string, SavedRegionSourceStatus>>;
  onCreateScientificReport?: (resultId: string) => void;
  onExportScientificReport?: (resultId: string) => void;
  workbookBytes?: (id: string) => Uint8Array | null;
  onOpenWorkbookBlock?: (id: string, stageId: WorkbookStageId, blockId: string) => void;
  onOpenNote?: (id: string) => void;
  onOpenStudy?: (id: string) => void;
};

const readable = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value);
const bytes = (value: number | null) => value === null ? "Size not recorded" : `${value.toLocaleString()} bytes`;

const isRegionResult = (operation: string) => operation === VECTOR_FIELD3D_REGION_RESULT_TYPE ||
  operation === VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE ||
  operation === VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE ||
  operation === VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE ||
  operation === VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE ||
  operation === VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE ||
  operation === VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE;

export const ProjectResultsBrowser: React.FC<Props> = ({ project, inspection, titles, canOpen, onOpen, focusResult, readResource, regionResultStatuses = {}, onCreateScientificReport, onExportScientificReport,
  workbookBytes, onOpenWorkbookBlock, onOpenNote, onOpenStudy }) => {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [meshPreviewOpen, setMeshPreviewOpen] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusResult && project.workspace.results.some(result => result.resultId === focusResult.id)) {
      setSelection({ kind: "result", id: focusResult.id });
      setMeshPreviewOpen(false);
      if (window.innerWidth <= 760) window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start", behavior: "auto" }));
    }
  }, [focusResult?.token, project.identity.id]);
  const select = (next: Selection) => {
    setSelection(next);
    setMeshPreviewOpen(false);
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
  const resultClaim = result && presentAnalysisResultClaim(result.status);
  const meshResult = result?.provenance.operation.type.startsWith("mesh.saved.") ? result : undefined;
  const meshVerification = useMemo(() => {
    if (!meshResult || !readResource) return null;
    try { return { checked: verifySavedMeshResult(project, meshResult.resultId, readResource), error: null }; }
    catch (error) { return { checked: null, error: (error as Error).message }; }
  }, [project, meshResult, readResource]);
  const artifact = active?.kind === "artifact" ? artifacts.find(item => item.handle.artifactId === active.id) : undefined;
  const resultStatus = result && inspection?.results.find(item => item.id === result.resultId);
  const references = result ? [
    ...resultNoteReferences(project, result), ...resultStudyReferences(project, result),
    ...(workbookBytes ? resultWorkbookReferences(project, result, workbookBytes) : []),
  ] : [];
  const resultCard = result && presentProjectResultCard(result, resultStatus,
    regionResultStatuses[result.resultId], isRegionResult(result.provenance.operation.type));
  const resultVerification = result && presentProjectResultVerification({
    kind: meshResult ? "mesh" : isRegionResult(result.provenance.operation.type) ? "field" : "other",
    savedMeshChecked: !!meshVerification?.checked,
    sourceCurrent: resultCard?.integrity.label === "Source verified",
  });
  const resultActions = result && resultCard && resultVerification ? projectResultActionPolicy({
    card: resultCard, verification: resultVerification,
    sourceLink: projectResultSourceLink(project, result.provenance.source),
    savedMeshChecked: Boolean(meshVerification?.checked),
    canCreateReport: Boolean(onCreateScientificReport),
    canExportReport: Boolean(onExportScientificReport),
    regionStatus: regionResultStatuses[result.resultId],
  }) : null;
  const artifactStatus = artifact && inspection?.artifacts.find(item => item.id === artifact.handle.artifactId);
  const linkedResults = artifact ? results.filter(item => item.artifacts.some(handle => handle.artifactId === artifact.handle.artifactId)) : [];
  const artifactRelations = artifact ? project.workspace.relations.filter(relation => relation.target.type === "artifact" && relation.target.artifactId === artifact.handle.artifactId) : [];
  const sourceButton = (source: ScientificSourceGeneration) => {
    const link = projectResultSourceLink(project, source);
    const label = titles.get(source.documentId) ?? source.documentId;
    return link.status === "current" && link.module
      ? <button type="button" data-testid={`project-result-source-${source.documentId}`}
          disabled={!canOpen(source.documentId, link.module)} title={link.reason}
          onClick={() => onOpen(source.documentId, link.module!)}>{label}</button>
      : <span data-testid={`project-result-source-${source.documentId}`} title={link.reason}>
          {label} · {link.status === "historical" ? "historical source generation" : "missing source"}
        </span>;
  };
  const exportEvidence = (format: "json" | "csv") => {
    if (!result || !resultCard) return;
    const evidence = createProjectResultEvidence(result, resultCard, resultStatus);
    const content = format === "json" ? JSON.stringify(evidence, null, 2) + "\n" :
      createProjectResultEvidenceCsv(evidence);
    const url = URL.createObjectURL(new Blob([content],
      { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `result-${result.resultId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.evidence.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return <div className="project-results-browser" data-testid="project-results-browser">
    <label className="project-results-search">Search saved outputs
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Operation, source or artifact" />
    </label>
    <div className="project-results-layout">
      <nav className="project-results-list" aria-label="Saved results and artifacts">
        <h4>Results ({results.length})</h4>
        {filteredResults.map(item => {
          const claim = presentAnalysisResultClaim(item.status);
          const status = inspection?.results.find(candidate => candidate.id === item.resultId);
          const freshness = presentProjectResultCard(item, status,
            regionResultStatuses[item.resultId], isRegionResult(item.provenance.operation.type)).integrity;
          return <button type="button" key={item.resultId} data-testid={`project-result-select-${item.resultId}`}
            aria-current={active?.kind === "result" && active.id === item.resultId ? "true" : undefined}
            onClick={() => select({ kind: "result", id: item.resultId })}>
            <strong>{item.provenance.operation.type}</strong>
            <small>{titles.get(item.provenance.source.documentId) ?? item.provenance.source.documentId} · {claim.label}</small>
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
            {resultCard && <span className="project-freshness-badge" data-tone={resultCard.integrity.tone}
              title={resultCard.integrity.detail}>{resultCard.integrity.label}</span>}
          </div>
          <p data-testid="project-result-claim">Mathematical claim: <strong>{resultClaim!.label}</strong>
            {` · ${resultClaim!.meaning}`}
            {resultStatus?.missingArtifactIds.length ? ` · ${resultStatus.missingArtifactIds.length} unavailable artifact(s)` : ""}</p>
          <p data-testid="project-result-verification" data-scope={resultVerification!.scope}>
            Independent check: <strong>{resultVerification!.label}</strong> · {resultVerification!.detail}</p>
          <p>Recorded status: <strong>{result.status}</strong>{resultStatus?.missingArtifactIds.length ? ` · ${resultStatus.missingArtifactIds.length} unavailable artifact(s)` : ""}</p>
          {resultCard && <div data-testid="project-result-card-axes" className="project-results-links">
            {(["execution", "integrity", "mathematics"] as const).map(axis =>
              <p key={axis} data-testid={`project-result-axis-${axis}`}>
                <strong>{axis === "mathematics" ? "Mathematics" : axis === "integrity" ? "Source integrity" : "Execution"}:</strong>{" "}
                <span className="project-freshness-badge" data-tone={resultCard[axis].tone}>
                  {resultCard[axis].label}</span>{" "}{resultCard[axis].detail}
              </p>)}
          </div>}
          {resultActions && <p role="status" data-testid="project-result-action-status"
            data-summary={resultActions.summary}>{resultActions.reason}</p>}
          <button type="button" data-testid="project-result-export-evidence" onClick={() => exportEvidence("json")}>
            Export result evidence JSON</button>
          <button type="button" data-testid="project-result-export-evidence-csv" onClick={() => exportEvidence("csv")}>
            Export result evidence CSV</button>
          {meshResult && <div data-testid="project-saved-mesh-evidence" style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 10 }}>
            <strong>Exact saved Mesh evidence</strong>
            {meshVerification?.checked ? <><p>Result {meshResult.resultId} · hash {meshVerification.checked.resultHash}<br />
              Mesh r{meshVerification.checked.source.identity.revision} · {meshVerification.checked.generation} · source hash {meshVerification.checked.source.identity.structuralHash}</p>
              <button type="button" data-testid="project-open-exact-mesh-generation"
                disabled={!resultActions?.openExactSavedMesh} onClick={() => setMeshPreviewOpen(true)}>Show exact Mesh generation</button></> :
              <p role="alert">Saved result inspection remains available; the exact Mesh generation cannot open: {meshVerification?.error ?? "source bytes are unavailable"}. No current Mesh is substituted.</p>}
          </div>}
          {isScientificSubrectangle(result) && <div className="project-results-links">
            <button type="button" data-testid="project-create-subrectangle-workbook" disabled={!resultActions?.createVerifiedReport}
              onClick={() => onCreateScientificReport?.(result.resultId)}>Create source-linked Workbook report</button>
            <button type="button" data-testid="project-export-subrectangle-report" disabled={!resultActions?.exportVerifiedReport}
              onClick={() => onExportScientificReport?.(result.resultId)}>Verify and export report</button>
          </div>}
          {isScientificTrajectory(result) && <div className="project-results-links">
            <button type="button" data-testid="project-create-trajectory-workbook"
              disabled={!resultActions?.createVerifiedReport}
              onClick={() => onCreateScientificReport?.(result.resultId)}>
              Create verified solver Workbook report</button>
          </div>}
          {isScientificEquilibrium(result) && <div className="project-results-links">
            <button type="button" data-testid="project-create-equilibrium-workbook"
              disabled={!resultActions?.createVerifiedReport}
              onClick={() => onCreateScientificReport?.(result.resultId)}>
              Create verified equilibrium Workbook report</button>
          </div>}
          <dl><div><dt>Source document</dt><dd>{sourceButton(result.provenance.source)}</dd></div>
            <div><dt>Source generation</dt><dd>Revision {result.provenance.source.revision} · generation {result.provenance.source.generation}</dd></div>
            <div><dt>Source hash</dt><dd><code>{result.provenance.source.structuralHash}</code></dd></div>
            <div><dt>Method</dt><dd>{result.provenance.operation.algorithm} · version {result.provenance.operation.algorithmVersion}</dd></div>
            <div><dt>Engine</dt><dd>{result.provenance.engine.name} {result.provenance.engine.version}</dd></div>
            <div><dt>Run time</dt><dd>{result.provenance.elapsedMs.toLocaleString()} ms</dd></div></dl>
          <h5>Summary</h5>
          {resultClaim!.outcome === "none" ?
            <p data-testid="project-result-no-values">No completed result values are available. Inspect warnings and diagnostics for the recorded outcome.</p> :
          (result.provenance.operation.type === VECTOR_FIELD3D_COMBINED_REGION_RESULT_TYPE ||
            result.provenance.operation.type ===
              VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE) ?
            <div data-testid="project-combined-region-result">
              <p>Physical rectangle: <code>{readable(result.provenance.operation.parameters.region)}</code></p>
              {result.provenance.operation.type ===
                VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE &&
                <p>Selected subrectangle bounds: <code>{readable(
                  result.provenance.operation.parameters.bounds)}</code>; {
                  resultActions?.summary === "recorded" ? `${String(result.summary.sampleCount)} lattice positions.` :
                    "lattice count withheld."}</p>}
              {(["vector", "scalar", "complexMagnitude", "complexPhase",
                ...(["17x17-v3", "17x17-v4"].includes(
                  result.provenance.operation.algorithmVersion) ||
                  result.provenance.operation.type ===
                    VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE ?
                  ["divergence" as const] : []),
                ...(result.provenance.operation.algorithmVersion === "17x17-v4" ||
                   result.provenance.operation.type ===
                     VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE ?
                  ["curlMagnitude" as const] : [])] as const).map(key => {
                const state = regionResultStatuses[result.resultId];
                const layer = key === "complexMagnitude" || key === "complexPhase" ?
                  "complex" : key;
                const source = typeof state === "object" && state.kind === "combined" ?
                  (result.provenance.operation.type ===
                    VECTOR_FIELD3D_COMBINED_SUBRECTANGLE_RESULT_TYPE &&
                    (key === "complexMagnitude" || key === "complexPhase") ?
                      state[key] ?? state.complex : state[layer]) ?? "checking" :
                  state ?? "checking";
                const unit = key === "vector" ? result.summary.vectorUnit :
                  key === "scalar" ? result.summary.scalarUnit :
                    key === "complexPhase" ? "rad" : key === "divergence" ?
                      result.summary.divergenceUnit : key === "curlMagnitude" ?
                        result.summary.curlMagnitudeUnit : result.summary.complexUnit;
                return <p key={key} data-testid={`project-combined-${key}`}>
                  {key === "curlMagnitude" ? "curl magnitude" : key} ({String(unit)}): {
                    source === "source-current" && resultStatus?.sourceFreshness === "current" &&
                      resultStatus.freshness === "current" ?
                    <code>{readable(result.summary[key])}</code> :
                    <>values withheld ({source})</>}
                </p>;
              })}
            </div> :
          (result.provenance.operation.type === VECTOR_FIELD3D_DERIVED_REGION_RESULT_TYPE ||
            result.provenance.operation.type === VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE) ?
            <div data-testid="project-vector-derived-region-result">
              <p>Physical rectangle: <code>{readable(result.provenance.operation.parameters.region)}</code></p>
              {result.provenance.operation.type === VECTOR_FIELD3D_DERIVED_SUBRECTANGLE_RESULT_TYPE &&
                <p>Selected subrectangle bounds: <code>{readable(
                  result.provenance.operation.parameters.bounds)}</code>; {
                  resultActions?.summary === "recorded" ? `${String(result.summary.sampleCount)} lattice positions.` :
                    "lattice count withheld."}</p>}
              {(["vector", "divergence", "curlMagnitude"] as const).map(key => {
                const state = regionResultStatuses[result.resultId];
                const source = typeof state === "object" && state.kind === "vector-derived" ?
                  state[key] : state ?? "checking";
                const unit = key === "vector" ? result.summary.vectorUnit :
                  key === "divergence" ? result.summary.divergenceUnit :
                    result.summary.curlMagnitudeUnit;
                return <p key={key} data-testid={`project-vector-derived-${key}`}>
                  {key === "curlMagnitude" ? "curl magnitude" : key} ({String(unit)}): {
                    source === "source-current" && resultStatus?.sourceFreshness === "current" &&
                      resultStatus.freshness === "current" ? <code>{readable(result.summary[key])}</code> :
                      <>values withheld ({typeof source === "string" ? source : "checking"})</>}
                </p>;
              })}
            </div> :
          (result.provenance.operation.type === VECTOR_FIELD3D_REGION_RESULT_TYPE ||
            result.provenance.operation.type === VECTOR_FIELD3D_TRAJECTORY_RESULT_TYPE ||
            result.provenance.operation.type === VECTOR_FIELD3D_EQUILIBRIUM_RESULT_TYPE) &&
            (regionResultStatuses[result.resultId] !== "source-current" ||
              resultActions?.summary !== "recorded") ?
            <p data-testid="project-region-result-gated">Saved analysis values are withheld.
              {regionResultStatuses[result.resultId] === "missing" ? " A source is missing." :
                regionResultStatuses[result.resultId] === "changed" ? " A source has changed." :
                  " Source verification is pending or unavailable."}</p> :
          result.provenance.operation.type === VECTOR_FIELD3D_POINT_RESULT_TYPE ?
            <p data-testid="project-point-result-gated">Saved point values require fresh verification.
              Open the source in Field Explorer and choose “Reverify saved Inspector result” to view them.</p> :
          resultActions?.summary !== "recorded" ?
            <p data-testid="project-result-values-withheld">Saved result values are withheld. {resultActions?.reason}</p> :
            Object.keys(result.summary).length ? <dl>{Object.entries(result.summary).map(([key, value]) => <div key={key}><dt>{key}</dt><dd><code>{readable(value)}</code></dd></div>)}</dl> : <p>No summary values recorded.</p>}
          {result.artifacts.length > 0 && <><h5>Artifacts</h5><div className="project-results-links">{result.artifacts.map(handle => <button type="button" key={handle.artifactId}
            onClick={() => select({ kind: "artifact", id: handle.artifactId })}>{handle.role} · {handle.kind}</button>)}</div></>}
          <section data-testid="project-result-backlinks" aria-label="Result references in this Project">
            <h5>Referenced in this Project ({references.length})</h5>
            {references.length ? <ul>{references.map((reference, index) => <li key={`${reference.kind}:${reference.id}:${reference.blockId ?? index}`}
              data-testid={`project-result-backlink-${reference.kind}-${index}`}>
              <span>{reference.kind === "workbook" ? "Workbook block" : reference.kind === "study" ? "Study" : "Note"}: {reference.title}</span>{" "}
              <span className="project-freshness-badge" data-tone={reference.status === "current" ? "current" : "stale"}
                title={reference.reason}>{reference.status === "current" ? "Exact reference" : "Historical reference"}</span>{" "}
              <button type="button" disabled={reference.kind === "note" ? !onOpenNote :
                reference.kind === "study" ? !onOpenStudy : !onOpenWorkbookBlock}
                onClick={() => { if (reference.kind === "note") onOpenNote?.(reference.id);
                  else if (reference.kind === "study") onOpenStudy?.(reference.id);
                  else if (reference.stageId && reference.blockId)
                    onOpenWorkbookBlock?.(reference.id, reference.stageId, reference.blockId); }}>
                Open {reference.kind === "workbook" ? "block" : reference.kind}</button>
            </li>)}</ul> : <p>No exact Note, Study, or checked Workbook reference is recorded.</p>}
          </section>
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
            {sourceButton(source)} · revision {source.revision} · generation {source.generation}
          </li>))}</ul> : <p>No direct relation to a source document recorded.</p>}
        </>}
        {!result && !artifact && <p>No saved result or artifact is available to inspect.</p>}
      </section>
    </div>
    {meshPreviewOpen && meshResult && readResource && <React.Suspense fallback={<p role="status">Opening retained Mesh generation…</p>}>
      <ProjectSavedMeshGenerationPreview project={project} resultId={meshResult.resultId} readResource={readResource} onClose={() => setMeshPreviewOpen(false)} />
    </React.Suspense>}
  </div>;
};
