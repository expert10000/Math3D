import { normalizeAnalysisResultEnvelope, retainedMeshGenerationDocuments, structuralHash, type AnalysisResultEnvelope,
  type Math3DProject, type MeshDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import type { ProjectResourceReader } from "./projectResources";
import { comparableSavedMeshResults, savedMeshMetricUnit, savedMeshSummaryNumbers, verifySavedMeshResult } from "./projectSavedMeshResultComparison";

const MAX_TREND_ROWS = 64;
const sameMethod = (a: AnalysisResultEnvelope, b: AnalysisResultEnvelope) =>
  a.provenance.source.documentId === b.provenance.source.documentId &&
  a.provenance.operation.type === b.provenance.operation.type &&
  a.provenance.operation.algorithm === b.provenance.operation.algorithm &&
  a.provenance.operation.algorithmVersion === b.provenance.operation.algorithmVersion && a.status === b.status;

export function savedMeshTrendMetricChoices(project: Math3DProject, anchorId: string): string[] {
  const anchor = comparableSavedMeshResults(project).find(item => item.resultId === anchorId);
  if (!anchor) return [];
  return [...new Set(comparableSavedMeshResults(project).filter(item => sameMethod(item, anchor))
    .flatMap(item => savedMeshSummaryNumbers(item.summary).map(metric => metric.path)))].sort();
}

type TrendRow = Readonly<{ revision: number; sourceHash: string; resultId: string | null; resultHash: string | null;
  value: number | null; unit: string | null; status: "available" | "unavailable" | "not recorded"; reason: string | null;
  generation: "current" | "retained" | "unretained" }>;

/** One row per exact saved result or explicitly retained generation. No result or mesh computation runs. */
export function buildSavedMeshResultTrend(project: Math3DProject, anchorId: string, metricPath: string, read: ProjectResourceReader) {
  const anchor = comparableSavedMeshResults(project).find(item => item.resultId === anchorId);
  if (!anchor) throw new TypeError("The selected saved Mesh analysis result is missing.");
  const normalized = normalizeAnalysisResultEnvelope(anchor);
  if (!normalized.ok) throw new TypeError("The selected result envelope is invalid.");
  if (!savedMeshTrendMetricChoices(project, anchorId).includes(metricPath)) throw new TypeError("The metric is not a recorded finite scalar in this method group.");
  const group = comparableSavedMeshResults(project).filter(item => sameMethod(item, anchor));
  if (group.length > MAX_TREND_ROWS) throw new TypeError(`A Mesh trend accepts at most ${MAX_TREND_ROWS} saved results.`);
  const sourceId = anchor.provenance.source.documentId;
  const entry = project.workspace.entries.find(item => item.module === "mesh" && item.expected.id === sourceId);
  if (!entry) throw new TypeError("The selected Mesh document is missing.");
  const current = verifyMixedWorkspaceReplay(project.workspace).get(sourceId);
  if (!current || current.format !== "math3d.mesh-document" || current.identity.revision !== entry.expected.revision ||
    current.identity.structuralHash !== entry.expected.structuralHash) throw new TypeError("The current Mesh generation failed replay verification.");
  const generations = new Map<string, MeshDocument>();
  const add = (document: MeshDocument) => generations.set(`${document.identity.revision}:${document.identity.structuralHash}`, document);
  add(current);
  if (entry.replay && entry.checkpoint.format === "math3d.mesh-document") add(entry.checkpoint);
  for (const document of retainedMeshGenerationDocuments(entry)) add(document);
  if (generations.size > MAX_TREND_ROWS) throw new TypeError(`A Mesh trend accepts at most ${MAX_TREND_ROWS} generations.`);

  const checked = group.map(result => {
    try { return { result, checked: verifySavedMeshResult(project, result.resultId, read), error: null }; }
    catch (error) { return { result, checked: null, error: (error as Error).message }; }
  });
  const units = checked.flatMap(item => {
    if (!item.checked || !savedMeshSummaryNumbers(item.result.summary).some(metric => metric.path === metricPath)) return [];
    const unit = savedMeshMetricUnit(item.result.provenance.operation.type, metricPath, item.checked.lengthUnit);
    return unit ? [unit] : [];
  });
  const referenceUnit = units[0] ?? null;
  const rows: TrendRow[] = checked.map(({ result, checked: verified, error }) => {
    const source = result.provenance.source;
    const generation = generations.has(`${source.revision}:${source.structuralHash}`) ?
      source.revision === current.identity.revision && source.structuralHash === current.identity.structuralHash ? "current" : "retained" : "unretained";
    const value = verified ? savedMeshSummaryNumbers(result.summary).find(item => item.path === metricPath)?.value ?? null : null;
    const unit = verified ? savedMeshMetricUnit(result.provenance.operation.type, metricPath, verified.lengthUnit) : null;
    const reason = error ?? (value === null ? "This result has no finite stored value for the selected metric." :
      !unit ? "The source has no declared length unit for this metric." :
      unit !== referenceUnit ? `Metric unit ${unit} differs from ${referenceUnit}.` : null);
    return { revision: source.revision, sourceHash: source.structuralHash, resultId: result.resultId,
      resultHash: verified ? structuralHash(verified.result) : null,
      value: reason ? null : value, unit: reason ? null : unit,
      status: reason ? "unavailable" : "available", reason, generation };
  });
  for (const document of generations.values()) if (!rows.some(row => row.revision === document.identity.revision && row.sourceHash === document.identity.structuralHash))
    rows.push({ revision: document.identity.revision, sourceHash: document.identity.structuralHash,
      resultId: null, resultHash: null, value: null, unit: null, status: "not recorded", reason: "No saved result for this retained generation.",
      generation: document.identity.structuralHash === current.identity.structuralHash && document.identity.revision === current.identity.revision ? "current" : "retained" });
  rows.sort((a, b) => a.revision - b.revision || a.sourceHash.localeCompare(b.sourceHash) || (a.resultId ?? "").localeCompare(b.resultId ?? ""));
  return { schemaVersion: 1 as const, projectId: project.identity.id, sourceDocumentId: sourceId, operation: anchor.provenance.operation.type,
    algorithm: anchor.provenance.operation.algorithm, algorithmVersion: anchor.provenance.operation.algorithmVersion,
    resultStatus: anchor.status, metricPath, unit: referenceUnit, rows,
    qualification: "Each dot is a stored scalar from an exact saved result and verified Mesh generation. Gaps are not estimated or connected. No Mesh analysis runs here." };
}

export type SavedMeshResultTrend = ReturnType<typeof buildSavedMeshResultTrend>;

export function savedMeshResultTrendHtml(study: SavedMeshResultTrend): string {
  if (study.rows.some(row => row.status === "unavailable")) throw new TypeError("A saved result or source is unavailable; trend export is refused.");
  const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rows = study.rows.map(row => `<tr><th>r${row.revision}</th><td>${esc(row.generation)}</td><td>${row.status === "available" ? esc(row.value) : "unavailable"}</td><td>${esc(row.unit ?? "—")}</td><td>${esc(row.resultId ?? "no saved result")}</td><td><code>${esc(row.resultHash ?? "—")}</code></td><td><code>${esc(row.sourceHash)}</code></td><td>${esc(row.reason ?? "verified")}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Saved Mesh analysis trend</title><style>body{font:16px/1.5 system-ui;max-width:1200px;margin:auto;padding:24px;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #94a3b8;padding:8px;text-align:left;overflow-wrap:anywhere}code,pre{overflow-wrap:anywhere}</style></head><body><h1>Saved Mesh analysis trend</h1><p>${esc(study.operation)} · ${esc(study.algorithm)} v${esc(study.algorithmVersion)}<br>Metric: ${esc(study.metricPath)} · unit: ${esc(study.unit ?? "unqualified")}</p><p>${esc(study.qualification)}</p><p>Project <code>${esc(study.projectId)}</code> · Mesh <code>${esc(study.sourceDocumentId)}</code></p><table><thead><tr><th>Revision</th><th>Generation</th><th>Stored value</th><th>Unit</th><th>Result ID</th><th>Result hash</th><th>Source hash</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><details><summary>Machine-readable evidence</summary><pre>${esc(JSON.stringify(study,null,2))}</pre></details></body></html>`;
}
