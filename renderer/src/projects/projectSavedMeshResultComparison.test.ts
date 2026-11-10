import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh } from "./savedMeshAnalysis";
import { captureProjectResources, projectResourceInventory } from "./projectResources";
import { compareSavedMeshResults, savedMeshResultComparisonCsv,
  savedMeshResultComparisonHtml, verifySavedMeshResult } from "./projectSavedMeshResultComparison";

const mesh = (height: number, unit?: string) => ({ label: "Two triangles", source: { kind: "import" as const, format: "obj" as const, filename: "two.obj",
  ...(unit ? { math3dCoordinateFrame: { format: "math3d.coordinate-frame/v1", frame: "local", unit, axes: ["x", "y", "z"], handedness: "right" } } : {}) },
  positions: Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,height]), indices: Uint32Array.from([0,1,2,1,3,2]) });
const fixture = (unit?: string, newUnit = unit) => {
  const adapter = MeshDocumentAdapter.fromMesh(mesh(0, unit));
  const oldQuality = analyzeSavedMesh(adapter, "quality"), oldCurvature = analyzeSavedMesh(adapter, "curvature");
  adapter.replaceMesh(mesh(0.5, newUnit), "object-edit", { translation: [0, 0, 0.5] });
  const newQuality = analyzeSavedMesh(adapter, "quality"), newCurvature = analyzeSavedMesh(adapter, "curvature");
  const replay = adapter.replayBundle();
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: replay.checkpoint.document, expected: adapter.document().identity,
    replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }], activeDocumentIds: [adapter.document().identity.id],
    constructions: [], results: [oldQuality, newQuality, oldCurvature, newCurvature], relations: [], artifacts: [], committedSelection: null });
  const project = createMath3DProject(workspace, { stableKey: "pc13" });
  const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
  return { project, resources, oldQuality, newQuality, oldCurvature, newCurvature };
};

describe("PC13 stored Mesh analysis comparison", () => {
  it("compares only matching stored methods and metric units after restart", () => {
    const { project, resources, oldQuality, newQuality, oldCurvature, newCurvature } = fixture();
    const reopened = parseMath3DProject(serializeMath3DProject(project));
    const compare = (a: string, b: string) => compareSavedMeshResults(reopened, a, b, item => resources.bytes(item));
    const quality = compare(oldQuality.resultId, newQuality.resultId);
    expect(quality.compatible).toBe(true);
    expect(quality.a.sourceRevision).toBe(oldQuality.provenance.source.revision);
    expect(quality.a.generation).toBe("retained");
    expect(quality.b.generation).toBe("current");
    expect(quality.metrics.find(item => item.path === "metrics.aspectRatio.avg")?.difference).not.toBeNull();
    expect(quality.metrics.find(item => item.path === "metrics.triangleArea.avg")?.difference).toBeNull();
    expect(quality.metrics.find(item => item.path === "metrics.triangleArea.avg")?.reason).toMatch(/Units/);
    expect(quality.publication).toMatchObject({ module: "comparison",
      assessment: { status: "recorded", sourceStatus: "both saved Mesh generations and result envelopes verified" },
      summary: { a: { resultId: oldQuality.resultId }, b: { resultId: newQuality.resultId } } });
    expect(quality.publication.assessment.independentCheck).toMatch(/not a new Mesh analysis/);
    expect(savedMeshResultComparisonCsv(quality)).toContain('"metric.metrics.aspectRatio.avg"');
    const curvature = compare(oldCurvature.resultId, newCurvature.resultId);
    expect(curvature.compatible).toBe(true);
    expect(curvature.metrics.every(item => !item.path.startsWith("gaussian.") || item.path === "gaussian.count" || item.difference === null)).toBe(true);
    expect(savedMeshResultComparisonHtml(quality)).toContain(oldQuality.resultId);
    expect(savedMeshResultComparisonHtml(quality)).toContain(newQuality.provenance.source.structuralHash);
    expect(savedMeshResultComparisonHtml(quality)).toContain("B − A");
    expect(compare(oldQuality.resultId, oldCurvature.resultId).metrics.every(item => item.difference === null)).toBe(true);
    const declared = fixture("m"), unitEvidence = compareSavedMeshResults(declared.project, declared.oldQuality.resultId,
      declared.newQuality.resultId, item => declared.resources.bytes(item));
    expect(unitEvidence.metrics.find(item => item.path === "metrics.triangleArea.avg")?.unit).toBe("m²");
    expect(unitEvidence.metrics.find(item => item.path === "metrics.triangleArea.avg")?.difference).not.toBeNull();
    const mismatched = fixture("m", "cm"), mismatchEvidence = compareSavedMeshResults(mismatched.project,
      mismatched.oldQuality.resultId, mismatched.newQuality.resultId, item => mismatched.resources.bytes(item));
    expect(mismatchEvidence.metrics.find(item => item.path === "metrics.triangleArea.avg")?.difference).toBeNull();
    expect(mismatchEvidence.metrics.find(item => item.path === "metrics.aspectRatio.avg")?.difference).not.toBeNull();
    const versionChanged = { ...newQuality, provenance: { ...newQuality.provenance, operation: {
      ...newQuality.provenance.operation, algorithmVersion: "99" } } };
    const versionProject = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace,
      results: [oldQuality, versionChanged] }), { stableKey: "pc13-version" });
    const versionEvidence = compareSavedMeshResults(versionProject, oldQuality.resultId, newQuality.resultId, item => resources.bytes(item));
    expect(versionEvidence.compatible).toBe(false);
    expect(versionEvidence.metrics.every(item => item.difference === null)).toBe(true);
    expect(versionEvidence.publication.summary?.compatible).toBe(false);
  });
  it("refuses missing, altered, or unretained source generations and result tampering", () => {
    const { project, resources, oldQuality, newQuality } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    expect(() => compareSavedMeshResults(project, oldQuality.resultId, newQuality.resultId, () => null)).toThrow(/bytes/);
    expect(() => compareSavedMeshResults(project, oldQuality.resultId, newQuality.resultId, item => {
      const bytes = read(item); if (!bytes) return null; const changed = bytes.slice(); changed[0] ^= 1; return changed;
    })).toThrow();
    const withoutOld = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, results: [newQuality] }), { stableKey: "pc13-missing" });
    expect(() => verifySavedMeshResult(withoutOld, oldQuality.resultId, read)).toThrow(/missing/);
    const changedResult = { ...oldQuality, summary: { ...oldQuality.summary, vertexCount: 999 } };
    const changedProject = { ...project, workspace: { ...project.workspace, results: [changedResult, ...project.workspace.results.slice(1)] } };
    expect(() => parseMath3DProject(JSON.stringify(changedProject))).toThrow();
    const entry = project.workspace.entries[0]!;
    const sourceChanged = { ...oldQuality, provenance: { ...oldQuality.provenance,
      source: { ...oldQuality.provenance.source, structuralHash: newQuality.provenance.source.structuralHash } } };
    const stale = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace,
      results: [sourceChanged, ...project.workspace.results.slice(1)] }), { stableKey: "pc13-stale" });
    expect(() => verifySavedMeshResult(stale, oldQuality.resultId, read)).toThrow(/generation/);
    expect(projectResourceInventory(project).filter(item => item.kind === "mesh-buffers")).toHaveLength(2);
    expect(entry.expected.revision).toBe(newQuality.provenance.source.revision);
  });
});
