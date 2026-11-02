import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { analyzeSavedMesh } from "./savedMeshAnalysis";
import { transformWithRetainedMeshSnapshot } from "./retainedMeshGeneration";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { buildSavedMeshResultTrend, savedMeshResultTrendHtml, savedMeshTrendMetricChoices } from "./projectSavedMeshResultTrend";
import { resolveSavedMeshTrendPoint } from "./projectSavedMeshTrendPoint";

const mesh = () => ({ label: "Trend square", source: { kind: "import" as const, format: "obj" as const, filename: "square.obj",
  math3dCoordinateFrame: { format: "math3d.coordinate-frame/v1", frame: "local", unit: "m", axes: ["x", "y", "z"], handedness: "right" } },
  positions: Float32Array.from([0,0,0,1,0,0,0,1,0,1,1,0]), indices: Uint32Array.from([0,1,2,1,3,2]) });
const fixture = (saveMiddle = true) => {
  const adapter = MeshDocumentAdapter.fromMesh(mesh());
  const first = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 2);
  const middle = analyzeSavedMesh(adapter, "quality");
  transformWithRetainedMeshSnapshot(adapter, [0, 0, 0], 0.5);
  const last = analyzeSavedMesh(adapter, "quality");
  const replay = adapter.replayBundle();
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "mesh", checkpoint: replay.checkpoint.document,
    expected: adapter.document().identity, replay: { format: "math3d.mesh-replay.v1", payload: replay as never } }],
    activeDocumentIds: [adapter.document().identity.id], constructions: [],
    results: saveMiddle ? [first, middle, last] : [first, last], relations: [], artifacts: [], committedSelection: null });
  const project = createMath3DProject(workspace, { stableKey: "pc14" });
  const resources = captureProjectResources(project, item => adapter.resources.bytes(item.reference as never));
  return { project, resources, first, middle, last };
};

describe("PC14 saved Mesh analysis trends", () => {
  it("uses only verified recorded points and retains exact hashes through portable import", () => {
    const { project, resources, first, middle, last } = fixture();
    const imported = parseProjectPackage(exportProjectPackage(project, resources));
    const reopened = parseMath3DProject(serializeMath3DProject(imported.project));
    const metric = "metrics.triangleArea.avg";
    expect(savedMeshTrendMetricChoices(reopened, first.resultId)).toContain(metric);
    const study = buildSavedMeshResultTrend(reopened, first.resultId, metric, item => imported.resources.bytes(item));
    expect(study.unit).toBe("m²");
    expect(study.rows.map(row => row.status)).toEqual(["available", "available", "available"]);
    expect(study.rows.map(row => row.value)).toEqual([0.5, 2, 0.5]);
    expect(study.rows.map(row => row.resultId)).toEqual([first.resultId, middle.resultId, last.resultId]);
    expect(study.rows.map(row => row.sourceHash)).toEqual([first, middle, last].map(result => result.provenance.source.structuralHash));
    expect(savedMeshResultTrendHtml(study)).toContain(first.resultId);
    expect(savedMeshResultTrendHtml(study)).toContain(last.provenance.source.structuralHash);
  });
  it("shows retained generations without a result as gaps and excludes changed methods", () => {
    const { project, resources, first, middle } = fixture(false);
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", read);
    expect(study.rows.map(row => row.status)).toEqual(["available", "not recorded", "available"]);
    expect(study.rows[1]).toMatchObject({ revision: middle.provenance.source.revision, value: null, resultId: null });
    expect(savedMeshResultTrendHtml(study)).toContain("No saved result for this retained generation");
    const altered = { ...middle, provenance: { ...middle.provenance, operation: { ...middle.provenance.operation, algorithmVersion: "99" } } };
    const different = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace, results: [first, altered] }), { stableKey: "pc14-version" });
    expect(buildSavedMeshResultTrend(different, first.resultId, "metrics.triangleArea.avg", read).rows[1]?.status).toBe("not recorded");
  });
  it("marks missing and tampered source bytes unavailable and refuses export", () => {
    const { project, resources, first } = fixture();
    const missing = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", () => null);
    expect(missing.rows.filter(row => row.resultId).every(row => row.status === "unavailable")).toBe(true);
    expect(() => savedMeshResultTrendHtml(missing)).toThrow(/unavailable/);
    const tampered = buildSavedMeshResultTrend(project, first.resultId, "metrics.triangleArea.avg", item => {
      const bytes = resources.bytes(item); if (!bytes) return null; const changed = bytes.slice(); changed[0] ^= 1; return changed;
    });
    expect(tampered.rows.some(row => row.status === "unavailable")).toBe(true);
    expect(() => savedMeshResultTrendHtml(tampered)).toThrow(/unavailable/);
  });
});

describe("PC16 exact saved trend points", () => {
  it("resolves a retained point to its exact result, Mesh revision, hash and sidecar", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    expect(resolveSavedMeshTrendPoint(project, study, middle.resultId, read)).toMatchObject({
      projectId: project.identity.id, resultId: middle.resultId,
      meshId: middle.provenance.source.documentId, revision: middle.provenance.source.revision,
      sourceHash: middle.provenance.source.structuralHash, generation: "retained",
    });
  });
  it("refuses a changed result, missing sidecar, and a stale plot snapshot", () => {
    const { project, resources, first, middle } = fixture();
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const study = buildSavedMeshResultTrend(project, first.resultId, "faceCount", read);
    expect(() => resolveSavedMeshTrendPoint(project, study, middle.resultId, () => null)).toThrow();
    const changed = createMath3DProject(createMixedWorkspaceDocument({ ...project.workspace,
      results: project.workspace.results.map(item => item.resultId === middle.resultId ?
        { ...item, summary: { ...item.summary, faceCount: 999 } } : item) }), { stableKey: "pc16-changed" });
    expect(() => resolveSavedMeshTrendPoint(changed, study, middle.resultId, read)).toThrow();
    expect(() => resolveSavedMeshTrendPoint(project, { ...study, rows: study.rows.slice(1) }, middle.resultId, read)).toThrow(/changed/);
    expect(() => resolveSavedMeshTrendPoint(project, study, "missing", read)).toThrow(/no verified/);
  });
});
