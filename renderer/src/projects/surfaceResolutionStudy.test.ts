import { expect, it } from "vitest";
import { createSurfaceDocument, createMixedWorkspaceDocument, createMath3DProject } from "@math3d/core";
import { createSurfaceResolutionStudy, surfaceResolutionReport } from "./surfaceResolutionStudy";
import { savedSurfaceMeshLinks } from "./savedSurfaceMesh";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";

const fixture = () => {
  const surface = createSurfaceDocument({ stableKey: "resolution-catenoid", metadata: { title: "Catenoid" }, source: { representation: "parametric",
    definition: { familyId: "catenoid", expressions: { x: "cosh(v)*cos(u)", y: "cosh(v)*sin(u)", z: "v" } },
    domain: { kind: "parameter", u: { min: -Math.PI, max: Math.PI, periodic: false }, v: { min: -1.2, max: 1.2, periodic: false } },
    units: { length: "m" }, parameters: {}, orientation: { sign: 1 }, branchPolicy: null } });
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "surface", expected: surface.identity, checkpoint: surface, replay: null }], activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null });
  return { surface, workspace, context: { documents: new Map([[surface.identity.id, surface]]) } };
};

it("retains three sampling levels of one exact source, reuses results and reopens their qualified comparison", async () => {
  const f = fixture(), before = JSON.stringify(f.workspace), made = await createSurfaceResolutionStudy(f.workspace, f.surface, f.context);
  expect(JSON.stringify(f.workspace)).toBe(before); expect(made.workspace.entries).toHaveLength(4); expect(made.workspace.results).toHaveLength(3);
  const choices = savedSurfaceMeshLinks(made.workspace, f.surface, new Map(made.meshes.map(mesh => [mesh.document().identity.id, mesh])));
  const report = surfaceResolutionReport(choices, made.studyId);
  expect(report.runs.map(run => run.samplesPerAxis)).toEqual([17, 33, 65]);
  expect(report.runs.map(run => [run.vertexCount, run.interior.count, run.interior.excluded])).toEqual([[289, 225, 64], [1089, 961, 128], [4225, 3969, 256]]);
  expect(report.runs.every(run => run.savedResult.status === "numerical" && run.interior.averageK! < 0)).toBe(true);
  expect(report.qualification).toContain("not certified");
  const again = await createSurfaceResolutionStudy(made.workspace, f.surface, f.context);
  expect(again.workspace).toEqual(made.workspace);
  const project = createMath3DProject(made.workspace, { stableKey: "resolution-transfer" });
  const resources = captureProjectResources(project, item => made.meshes.map(mesh => mesh.resources.bytes(item.reference as never)).find(bytes => bytes !== null) ?? null);
  const parsed = parseProjectPackage(exportProjectPackage(project, resources)), docs = verifyMixedWorkspaceReplay(parsed.project.workspace);
  const adapters = new Map([...docs.values()].flatMap(doc => doc.format === "math3d.mesh-document" ? [[doc.identity.id, new MeshDocumentAdapter(doc, parsed.resources.meshStore(parsed.project))] as const] : []));
  expect(surfaceResolutionReport(savedSurfaceMeshLinks(parsed.project.workspace, f.surface, adapters), made.studyId)).toEqual(report);
  expect(surfaceResolutionReport([{ ...choices[0], revision: choices[0].revision + 1 }, ...choices.slice(1)], made.studyId).excludedRuns).toHaveLength(1);
});

it("failed sampling publishes no partial study and a comparison cannot mix source generations", async () => {
  const f = fixture(), before = JSON.stringify(f.workspace);
  const invalid = createSurfaceDocument({ stableKey: "invalid-resolution", metadata: f.surface.metadata, source: { ...f.surface.source, definition: { ...f.surface.source.definition, expressions: { x: "0", y: "0", z: "0" } } } });
  await expect(createSurfaceResolutionStudy(f.workspace, invalid, { documents: new Map([[invalid.identity.id, invalid]]) })).rejects.toThrow();
  expect(JSON.stringify(f.workspace)).toBe(before);
  const made = await createSurfaceResolutionStudy(f.workspace, f.surface, f.context);
  const choices = savedSurfaceMeshLinks(made.workspace, f.surface, new Map(made.meshes.map(mesh => [mesh.document().identity.id, mesh])));
  expect(() => surfaceResolutionReport([choices[0], { ...choices[1], surfaceGeneration: { ...choices[1].surfaceGeneration!, revision: 2 } }], made.studyId)).toThrow("one exact");
});
