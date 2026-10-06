import { analyzeGraph2DDerivative, matchesScientificSourceGeneration, structuralHash, viewerSourceFromDocument, type AnalysisResultEnvelope } from "@math3d/core";
import { createNotebookReference, inspectNotebookReference, type NotebookReference } from "@math3d/workbook";
import type { NotebookProjectContext } from "./notebookProjectContext";
import type { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh } from "../projects/savedMeshAnalysis";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";

/** Only operations whose recorded method and parameters can be reproduced locally. */
export function notebookRerunSupported(result?: AnalysisResultEnvelope): boolean {
  if (!result) return false;
  const op = result.provenance.operation, p = op.parameters as Record<string, unknown>;
  if (!p || typeof p !== "object" || Array.isArray(p)) return false;
  if (op.type === "graph2d.derivative") return op.algorithm === "symbolic-rules-or-richardson" && op.algorithmVersion === "1" && typeof p.objectId === "string" && typeof p.x === "number" && Number.isFinite(p.x) && [1, 2].includes(p.order as number) && typeof p.tolerance === "number" && p.tolerance > 0;
  if (op.type === "mesh.saved.curvature") return op.algorithm === "angle-defect-cotan-shape-operator-v2" && op.algorithmVersion === "2" && Object.keys(p).length === 0;
  if (op.type === "mesh.saved.quality") return op.algorithm === "vtk-verdict-compatible-triangle-quality" && op.algorithmVersion === "1" && Object.keys(p).length === 0;
  return op.type === "mesh.saved.edge-path" && op.algorithm === "edge-graph-dijkstra" && op.algorithmVersion === "1" && Object.keys(p).sort().join() === "end,start" && [p.start, p.end].every(v => typeof v === "number" && Number.isSafeInteger(v) && v >= 0);
}

export async function rerunNotebookAnalysis(reference: NotebookReference, signal: AbortSignal, read: () => NotebookProjectContext | null,
  mesh: (id: string) => MeshDocumentAdapter | undefined, publish: (result: AnalysisResultEnvelope) => void): Promise<NotebookReference> {
  const initial = read(), inspection = initial && inspectNotebookReference(initial.project, reference), previous = inspection?.result;
  if (!initial?.live || inspection?.status !== "stale" || !notebookRerunSupported(previous)) throw new TypeError("Open the cited Project and choose a supported stale analysis.");
  const documents = verifyMixedWorkspaceReplay(initial.project.workspace), source = documents.get(reference.source.documentId);
  if (!source) throw new TypeError("Analysis source is unavailable.");
  const generation = viewerSourceFromDocument(source), projectId = initial.project.identity.id;
  const guard = () => {
    if (signal.aborted) throw new Error("Rerun cancelled; prior evidence retained.");
    const latest = read(), current = latest && verifyMixedWorkspaceReplay(latest.project.workspace).get(generation.documentId);
    if (!latest?.live || latest.project.identity.id !== projectId || !current || !matchesScientificSourceGeneration(viewerSourceFromDocument(current), generation)) throw new Error("Source changed during rerun; prior evidence retained.");
  };
  await new Promise<void>(resolve => setTimeout(resolve, 0)); guard();
  const op = previous!.provenance.operation, p = op.parameters as Record<string, unknown>;
  let result: AnalysisResultEnvelope;
  if (op.type === "graph2d.derivative") {
    if (source.format !== "math3d.graph2d-document") throw new TypeError("Derivative source is unavailable.");
    result = analyzeGraph2DDerivative({ document: source, objectId: p.objectId as string, x: p.x as number, order: p.order as 1 | 2, tolerance: p.tolerance as number }).publication;
  } else {
    const adapter = mesh(generation.documentId);
    if (!adapter || !matchesScientificSourceGeneration(adapter.sourceGeneration(), generation)) throw new TypeError("Exact Mesh source bytes are unavailable.");
    result = analyzeSavedMesh(adapter, op.type === "mesh.saved.quality" ? "quality" : op.type === "mesh.saved.curvature" ? "curvature" : "edge-path", { start: p.start as number, end: p.end as number });
  }
  if (!matchesScientificSourceGeneration(result.provenance.source, generation)) throw new Error("Rerun returned a different source generation.");
  await new Promise<void>(resolve => setTimeout(resolve, 0)); guard();
  const retained = read()?.project.workspace.results.find(item => item.resultId === result.resultId);
  if (retained) {
    if (!matchesScientificSourceGeneration(retained.provenance.source, generation) || structuralHash(retained.provenance.operation) !== structuralHash(result.provenance.operation)) throw new Error("Conflicting retained result identity.");
    return createNotebookReference(read()!.project, "result", retained.resultId);
  }
  publish(result);
  const saved = read()?.project, published = saved?.workspace.results.find(item => item.resultId === result.resultId);
  if (!saved || !published || structuralHash(published) !== structuralHash(result)) throw new Error("Publication was not retained. Historical link is unchanged.");
  return createNotebookReference(saved, "result", result.resultId);
}
