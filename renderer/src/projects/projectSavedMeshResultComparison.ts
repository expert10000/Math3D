import { normalizeAnalysisResultEnvelope, readProjectCoordinateFrame, retainedMeshGenerationDocuments, structuralHash,
  type AnalysisResultEnvelope, type Math3DProject, type MeshDocument } from "@math3d/core";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { MeshResourceStore } from "../mesh/meshResourceStore";
import { projectResourceInventory, type ProjectResourceReader } from "./projectResources";

export const comparableSavedMeshResults = (project: Math3DProject) => project.workspace.results.filter(result =>
  result.provenance.operation.type === "mesh.saved.quality" || result.provenance.operation.type === "mesh.saved.curvature");

type CheckedResult = { result: AnalysisResultEnvelope; resultHash: string; source: MeshDocument; lengthUnit: string | null; generation: string };
const sameSource = (source: AnalysisResultEnvelope["provenance"]["source"], document: MeshDocument) =>
  source.documentId === document.identity.id && source.revision === document.identity.revision &&
  source.structuralHash === document.identity.structuralHash && source.generation === document.identity.revision;

/** Reads only saved result envelopes and their exact source bytes. No analysis runs here. */
export function verifySavedMeshResult(project: Math3DProject, resultId: string, read: ProjectResourceReader): CheckedResult {
  const found = comparableSavedMeshResults(project).filter(result => result.resultId === resultId);
  if (found.length !== 1) throw new TypeError("The selected saved Mesh result is missing or ambiguous.");
  const normalized = normalizeAnalysisResultEnvelope(found[0]);
  if (!normalized.ok || !normalized.value) throw new TypeError("The saved Mesh result is invalid.");
  const result = normalized.value;
  const source = result.provenance.source;
  const entry = project.workspace.entries.find(item => item.module === "mesh" && item.expected.id === source.documentId);
  if (!entry) throw new TypeError("The saved Mesh source is missing.");
  const current = verifyMixedWorkspaceReplay(project.workspace).get(source.documentId);
  if (!current || current.format !== "math3d.mesh-document" || current.identity.revision !== entry.expected.revision ||
    current.identity.structuralHash !== entry.expected.structuralHash) throw new TypeError("The saved Mesh source failed replay verification.");
  const retained = entry.replay && entry.checkpoint.format === "math3d.mesh-document" && sameSource(source, entry.checkpoint) ? entry.checkpoint :
    retainedMeshGenerationDocuments(entry).find(document => sameSource(source, document));
  const document = sameSource(source, current) ? current : retained;
  if (!document) throw new TypeError("The result's exact Mesh generation is unavailable or changed.");
  const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" && item.id === document.source.resource.id);
  const bytes = requirement && read(requirement);
  if (!bytes) throw new TypeError("The saved Mesh source bytes are missing.");
  const store = new MeshResourceStore();
  store.import(document.source.resource, bytes);
  if (!store.resolve(document.source.resource)) throw new TypeError("The saved Mesh source bytes failed verification.");
  const coordinates = readProjectCoordinateFrame(document);
  if (coordinates.status === "invalid") throw new TypeError("The saved Mesh coordinate metadata is invalid.");
  return { result, resultHash: structuralHash(result), source: document, lengthUnit: coordinates.value?.unit ?? null,
    generation: sameSource(source, current) ? "current" : "retained" };
}

export const savedMeshSummaryNumbers = (value: unknown, prefix = ""): Array<{ path: string; value: number }> => {
  if (typeof value === "number" && Number.isFinite(value)) return [{ path: prefix, value }];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) => savedMeshSummaryNumbers(child, prefix ? `${prefix}.${key}` : key));
};
export const savedMeshMetricUnit = (operation: string, path: string, length: string | null): string | null => {
  if (operation === "mesh.saved.quality") {
    if (path.startsWith("metrics.edgeLength.")) return length;
    if (path.startsWith("metrics.triangleArea.")) return length ? `${length}²` : null;
    if (/AngleDeg\./.test(path)) return "deg";
    return "1";
  }
  if (path.startsWith("gaussian.") && path !== "gaussian.count") return length ? `${length}⁻²` : null;
  if (path.startsWith("mean.") && path !== "mean.count") return length ? `${length}⁻¹` : null;
  return "1";
};

export function compareSavedMeshResults(project: Math3DProject, aId: string, bId: string, read: ProjectResourceReader) {
  if (aId === bId) throw new TypeError("Choose two distinct saved Mesh results.");
  const a = verifySavedMeshResult(project, aId, read), b = verifySavedMeshResult(project, bId, read);
  const ao = a.result.provenance.operation, bo = b.result.provenance.operation;
  const compatible = ao.type === bo.type && ao.algorithm === bo.algorithm && ao.algorithmVersion === bo.algorithmVersion &&
    a.result.status === b.result.status && a.result.status !== "failed" && a.result.status !== "cancelled";
  const reason = compatible ? null : "Operation, algorithm, algorithm version, or result status differs; values remain source-local.";
  const bValues = new Map(savedMeshSummaryNumbers(b.result.summary).map(item => [item.path, item.value]));
  const metrics = savedMeshSummaryNumbers(a.result.summary).filter(item => bValues.has(item.path)).map(item => {
    const unitA = savedMeshMetricUnit(ao.type, item.path, a.lengthUnit), unitB = savedMeshMetricUnit(bo.type, item.path, b.lengthUnit);
    const comparable = compatible && unitA !== null && unitA === unitB;
    const valueB = bValues.get(item.path)!;
    return { path: item.path, a: item.value, b: valueB, unit: comparable ? unitA : null,
      difference: comparable ? valueB - item.value : null,
      reason: comparable ? null : !compatible ? reason : "Units are missing or differ for this metric." };
  });
  return { schemaVersion: 1 as const, projectId: project.identity.id, operation: ao.type, compatible, reason,
    a: { resultId: a.result.resultId, resultHash: a.resultHash, result: a.result, sourceId: a.source.identity.id,
      sourceRevision: a.source.identity.revision, sourceHash: a.source.identity.structuralHash, generation: a.generation, lengthUnit: a.lengthUnit },
    b: { resultId: b.result.resultId, resultHash: b.resultHash, result: b.result, sourceId: b.source.identity.id,
      sourceRevision: b.source.identity.revision, sourceHash: b.source.identity.structuralHash, generation: b.generation, lengthUnit: b.lengthUnit },
    metrics, qualification: "Differences use stored scalar summaries only. Mesh vertices are not aligned or recomputed. Missing or incompatible units suppress differences." };
}

export function savedMeshResultComparisonHtml(evidence: ReturnType<typeof compareSavedMeshResults>): string {
  const esc = (value: unknown) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const rows = evidence.metrics.map(metric => `<tr><th>${esc(metric.path)}</th><td>${esc(metric.a)}</td><td>${esc(metric.b)}</td><td>${esc(metric.unit ?? "unqualified")}</td><td>${metric.difference === null ? esc(metric.reason) : esc(metric.difference)}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Saved Mesh analysis comparison</title><style>body{font:16px/1.5 system-ui;max-width:1100px;margin:auto;padding:24px;color:#172033}table{border-collapse:collapse;width:100%}th,td{border:1px solid #94a3b8;padding:8px;text-align:left;overflow-wrap:anywhere}code,pre{overflow-wrap:anywhere}</style></head><body><h1>Saved Mesh analysis comparison</h1><p>${esc(evidence.qualification)}</p><p>${esc(evidence.reason ?? "Compatible stored operation and method.")}</p>${([evidence.a,evidence.b] as const).map((side,index) => `<section><h2>${index ? "B" : "A"} · ${esc(side.resultId)}</h2><p>Result hash <code>${esc(side.resultHash)}</code><br>Mesh ${esc(side.sourceId)} · r${side.sourceRevision} · ${esc(side.generation)}<br>Source hash <code>${esc(side.sourceHash)}</code><br>Length unit: ${esc(side.lengthUnit ?? "not declared")}</p><pre>${esc(JSON.stringify(side.result,null,2))}</pre></section>`).join("")}<h2>Stored scalar values and qualified B − A differences</h2><table><thead><tr><th>Metric</th><th>A</th><th>B</th><th>Unit</th><th>B − A</th></tr></thead><tbody>${rows}</tbody></table><details><summary>Machine-readable evidence</summary><pre>${esc(JSON.stringify(evidence,null,2))}</pre></details></body></html>`;
}
