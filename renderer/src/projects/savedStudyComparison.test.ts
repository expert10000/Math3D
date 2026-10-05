import { expect, it } from "vitest";
import { createSurfaceDocument, createMixedWorkspaceDocument, createMath3DProject } from "@math3d/core";
import { createSavedSurfaceMesh, savedSurfaceMeshLinks } from "./savedSurfaceMesh";
import { savedMeshCurvatureReport } from "./savedMeshExploration";
import { compareSavedMeshStudies, savedStudyComparisonCsv, savedStudyComparisonReport } from "./savedStudyComparison";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { additionalRepresentationFixture } from "../../../tests/fixtures/unified-projects/additionalRepresentations";
import { additionalRepresentationView } from "./additionalProjectRepresentations";
import { supportsSavedSurfaceResolution } from "./surfaceStudyResolution";

const fixture = () => {
  const surface = createSurfaceDocument({ stableKey: "resolution-paraboloid", source: { representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, label: "u", periodic: false }, v: { min: -1, max: 1, label: "v", periodic: false } }, units: { length: "m" }, orientation: { sign: 1 }, parameters: {}, branchPolicy: null, definition: { familyId: "custom", expressions: { x: "u", y: "v", z: "u*u+v*v" } } } });
  const workspace = createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null });
  return { surface, workspace, context: { documents: new Map([[surface.identity.id, surface]]) } };
};
it("resolution snapshots preserve their source and portable resources, reuse exact sampling, and refine a known custom curvature", () => {
  const f = fixture(); let workspace = f.workspace;
  const adapters = new Map<string, ReturnType<typeof createSavedSurfaceMesh>["adapter"]>(), errors: number[] = [];
  for (const n of [17, 33, 65]) {
    const next = createSavedSurfaceMesh(workspace, f.surface, f.context, n); workspace = next.workspace;
    const adapter = next.adapter; adapters.set(adapter.document().identity.id, adapter);
    expect(adapter.mesh().positions.length / 3).toBe(n * n);
    expect(adapter.mesh().indices!.length / 3).toBe(2 * (n - 1) ** 2);
    const report = savedMeshCurvatureReport(adapter.mesh());
    errors.push(Math.abs(report.K[((n - 1) / 2) * n + (n - 1) / 2] - 4));
    const again = createSavedSurfaceMesh(workspace, f.surface, f.context, n);
    expect(again.existing).toBe(true); expect(again.adapter.document()).toEqual(adapter.document()); expect(again.workspace).toEqual(workspace);
  }
  expect(errors[1]).toBeLessThan(errors[0]); expect(errors[2]).toBeLessThan(errors[1]); expect(errors[2]).toBeLessThan(.02);
  expect(workspace.entries[0].checkpoint).toEqual(f.surface);
  const links = savedSurfaceMeshLinks(workspace, f.surface, adapters);
  expect(links.map(link => link.samplingSize)).toEqual([17, 33, 65]); expect(links.every(link => link.current)).toBe(true);
  const project = createMath3DProject(workspace, { stableKey: "resolution-round-trip" });
  const resources = captureProjectResources(project, item => [...adapters.values()].map(adapter => adapter.resources.bytes(item.reference as never)).find(bytes => bytes !== null) ?? null);
  const parsed = parseProjectPackage(exportProjectPackage(project, resources)); expect(parsed.project).toEqual(project);
  for (const adapter of adapters.values()) expect(parsed.resources.meshStore(parsed.project).resolve(adapter.document().source.resource)?.positions).toEqual(adapter.mesh().positions);
  for (const n of [0, 18, NaN, 1000]) expect(() => createSavedSurfaceMesh(workspace, f.surface, f.context, n)).toThrow("17, 33 or 65");
});
it("comparison uses one signed scale and exports exact vertex data, units, masks and source provenance", () => {
  const f = fixture(), first = createSavedSurfaceMesh(f.workspace, f.surface, f.context, 17), second = createSavedSurfaceMesh(first.workspace, f.surface, f.context, 65);
  const adapters = new Map([first.adapter, second.adapter].map(adapter => [adapter.document().identity.id, adapter]));
  const snapshots = savedSurfaceMeshLinks(second.workspace, f.surface, adapters).map(choice => { const mesh = adapters.get(choice.id)!.mesh(); return { choice, mesh, report: savedMeshCurvatureReport(mesh) }; });
  for (const field of ["K", "H"] as const) {
    const comparison = compareSavedMeshStudies(snapshots[0], snapshots[1], field);
    expect(comparison.left.map.range).toEqual(comparison.right.map.range); expect(comparison.limit).toBeGreaterThan(0);
    const report = savedStudyComparisonReport(comparison);
    expect(report.lengthUnits).toBe("m"); expect(report.studies.map(side => side.samplingSize)).toEqual([17, 65]);
    expect(report.studies[0].meshSource).toEqual(first.adapter.sourceGeneration());
    expect(report.studies[0].vertices[144].coordinates).toEqual([0, 0, 0]);
    expect(report.studies[0].vertices[0].interior).toBe(false); expect(report.studies[0].vertices[144].K).toBeCloseTo(snapshots[0].report.K[144]);
    const csv = savedStudyComparisonCsv(comparison);
    expect(csv.split("\r\n")).toHaveLength(17 ** 2 + 65 ** 2 + 2); expect(csv).toContain(first.adapter.document().identity.structuralHash);
  }
  expect(() => compareSavedMeshStudies(snapshots[0], snapshots[0], "K")).toThrow("different");
  expect(() => compareSavedMeshStudies(snapshots[0], { ...snapshots[1], choice: { ...snapshots[1].choice, units: "cm" } }, "H")).toThrow("matching known length units");
});
it("qualified implicit, explicit, parametric, spline and Weierstrass samplers honor the selected bound without editing source recipes", () => {
  const f = additionalRepresentationFixture(), context = { documents: new Map(f.docs.map(document => [document.identity.id, document])) };
  for (const surface of f.docs.filter(document => document.format === "math3d.surface-document")) {
    if (surface.format !== "math3d.surface-document") throw Error();
    const before = JSON.stringify(surface);
    if (!supportsSavedSurfaceResolution(surface)) {
      expect(() => additionalRepresentationView(surface, context, { surfaceResolution: 17 })).toThrow("source-defined sampling");
      continue;
    }
    const coarse = additionalRepresentationView(surface, context, { surfaceResolution: 17 }).meshes[0];
    const fine = additionalRepresentationView(surface, context, { surfaceResolution: 65 }).meshes[0];
    expect(fine.positions.length).toBeGreaterThan(coarse.positions.length);
    if (surface.source.representation !== "implicit") { expect(coarse.positions.length / 3).toBe(17 * 17); expect(fine.positions.length / 3).toBe(65 * 65); }
    expect(Array.from(fine.positions).every(Number.isFinite)).toBe(true); expect(JSON.stringify(surface)).toBe(before);
  }
});
