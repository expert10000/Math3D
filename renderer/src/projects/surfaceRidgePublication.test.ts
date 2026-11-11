import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createSurfaceDocument,
  instantiateMath3DProjectTemplate, parseMath3DProject, replaceMath3DProjectWorkspace,
  serializeMath3DProject, type SurfaceDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { createSavedSurfaceMesh } from "./savedSurfaceMesh";
import { analyzeSavedMesh, appendSavedMeshAnalysis } from "./savedMeshAnalysis";
import { inspectSurfaceRidgeComparison, prepareSurfaceRidgeWorkbook,
  recordSurfaceRidgeComparison, supportedSurfaceRidges,
  SURFACE_RIDGE_COMPARISON_OPERATION } from "./surfaceRidgePublication";

const original = instantiateMath3DProjectTemplate("catenary-study", "general-ridge")
  .workspace.entries.find(entry => entry.module === "surface")!.checkpoint as SurfaceDocument;
expect(supportedSurfaceRidges(original).length).toBeGreaterThan(0);
const source = structuredClone(original.source);
source.definition.expressions = { ...source.definition.expressions, y: "(exp(x) + exp(-x))/2 + 0.5" };
const surface = createSurfaceDocument({ source, stableKey: "shifted-cosh-ridge",
  metadata: { title: "Shifted catenary revolution" } });
const base = createMath3DProject(createMixedWorkspaceDocument({
  entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }],
  activeDocumentIds: [surface.identity.id], constructions: [], results: [], relations: [],
  artifacts: [], committedSelection: null }), { stableKey: "shifted-cosh-ridge", title: "Ridge test" });

describe("general sampled Surface ridge publication", () => {
  it("publishes a non-Catenoid ridge, exact Mesh comparison and Workbook through reopen", () => {
    const candidates = supportedSurfaceRidges(surface);
    expect(candidates.length).toBeGreaterThan(0);
    const made = createSavedSurfaceMesh(base.workspace, surface,
      { documents: verifyMixedWorkspaceReplay(base.workspace) });
    const curvature = analyzeSavedMesh(made.adapter, "curvature");
    const withMesh = replaceMath3DProjectWorkspace(base,
      appendSavedMeshAnalysis(made.workspace, curvature));
    const recorded = recordSurfaceRidgeComparison(withMesh, made.adapter,
      surface.identity.id, candidates[0]!.index);
    const result = recorded.workspace.results.find(item =>
      item.provenance.operation.type === SURFACE_RIDGE_COMPARISON_OPERATION)!;
    const prepared = prepareSurfaceRidgeWorkbook(recorded, result.resultId);
    const reopened = parseMath3DProject(serializeMath3DProject(prepared.project));
    const checked = inspectSurfaceRidgeComparison(reopened, result.resultId,
      id => made.adapter.resources.bytes(made.adapter.document().source.resource));
    expect(checked.status).toBe("current");
    if (checked.status !== "current") return;
    const summary = checked.result.summary as Record<string, number>;
    // Independent revolution formula: K = -r'' / (r(1+r'^2)^2), r=cosh(u)+0.5.
    const c = Math.cosh(summary.ridgeParameter);
    expect(summary.analyticGaussian).toBeCloseTo(-1 / ((c + 0.5) * c ** 3), 2);
    expect(summary.absoluteDifference).toBeCloseTo(
      Math.abs(summary.discreteGaussian - summary.analyticGaussian), 10);
    expect(summary.spatialOffset).toBeGreaterThanOrEqual(0);
    expect(prepared.workbookBytes.byteLength).toBeGreaterThan(0);
    expect(reopened.workbooks).toHaveLength(1);
    expect(reopened.workspace.entries.some(entry => entry.module === "curve" &&
      entry.checkpoint.format === "math3d.curve-document" &&
      entry.checkpoint.source.definition.familyId === "surface.sampled-revolution-ridge-v1")).toBe(true);
    expect(inspectSurfaceRidgeComparison(reopened, result.resultId, () => null).status).toBe("withheld");
    const changed = { ...reopened, workspace: { ...reopened.workspace,
      entries: reopened.workspace.entries.map(entry => entry.expected.id === surface.identity.id ?
        { ...entry, expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) } };
    expect(inspectSurfaceRidgeComparison(changed, result.resultId).status).toBe("withheld");
    expect(() => recordSurfaceRidgeComparison(withMesh, new MeshDocumentAdapter(
      made.adapter.document(), made.adapter.resources), surface.identity.id, 0)).toThrow();
  });
});
