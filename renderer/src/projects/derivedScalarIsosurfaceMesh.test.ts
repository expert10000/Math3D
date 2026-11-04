import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { appendProjectDerivedField, createMixedWorkspaceDocument,
  createVectorField3DDocument, extractProjectDerivedScalarIsosurface, parseMath3DProject,
  replaceMath3DProjectWorkspace, reviseVectorField3DDocument,
  serializeMath3DProject, vectorField3DExpression,
  type VectorField3DDocument } from "@math3d/core";
import { MeshDocumentAdapter } from "../mesh/meshDocumentAdapter";
import { projectDerivedScalarMeshStatus, promoteDerivedScalarIsosurfaceMesh } from
  "./derivedScalarIsosurfaceMesh";

const fixture = new URL("../../../tests/fixtures/derived-field/gf03-magnitude-slice-profile.math3d",
  import.meta.url);
const load = () => parseMath3DProject(readFileSync(fixture, "utf8"));

describe("GF-14 derived scalar Mesh lineage", () => {
  it("extracts a bounded saved scalar recipe and survives Project and Mesh reopen", () => {
    const project = load(), magnitude = project.workspace.derivedFields![0]!;
    const clipBounds = [[-1, 1], [-1, 1], [-1, 1]] as const;
    const surface = extractProjectDerivedScalarIsosurface(project,
      magnitude.identity.id, clipBounds, 1, 2000, 5000);
    expect(surface.triangleCount).toBeGreaterThan(0);
    expect(surface.triangleCount).toBeLessThanOrEqual(2000);
    expect(surface.sampledPoints).toBeLessThan(10_000);
    expect(surface.vectorSources).toEqual([surface.vectorSource]);
    const promoted = promoteDerivedScalarIsosurfaceMesh(project.workspace, project, surface);
    const reopened = parseMath3DProject(serializeMath3DProject(
      replaceMath3DProjectWorkspace(project, promoted.workspace)));
    const origin = promoted.adapter.document().source.origin;
    expect(origin.kind).toBe("derivedScalarFieldIsosurface");
    if (origin.kind !== "derivedScalarFieldIsosurface") return;
    expect(projectDerivedScalarMeshStatus(reopened, origin)).toEqual({
      status: "current", reason: null });
    expect(reopened.workspace.relations.at(-1)?.sources).toHaveLength(2);
    const mesh = MeshDocumentAdapter.restore(promoted.adapter.exportPackage());
    expect(mesh.document().source.origin).toEqual(origin);
    expect(mesh.mesh().indices.length).toBe(surface.indices.length);
    const entry = reopened.workspace.entries.find(item => item.module === "vector3d")!;
    const prior = entry.checkpoint as VectorField3DDocument;
    const revised = reviseVectorField3DDocument(prior, { ...prior.source,
      display: { ...prior.source.display, maxGlyphs: prior.source.display.maxGlyphs + 1 } });
    const changed = replaceMath3DProjectWorkspace(reopened, {
      ...reopened.workspace, entries: reopened.workspace.entries.map(item =>
        item.expected.id === prior.identity.id ?
          { ...item, checkpoint: revised, expected: revised.identity } : item) });
    expect(projectDerivedScalarMeshStatus(changed, origin)).toEqual({
      status: "withheld", reason: "vector-source-changed" });
  });

  it("enforces sampling time and triangle budgets", () => {
    const project = load(), magnitude = project.workspace.derivedFields![0]!;
    const clipBounds = [[-1, 1], [-1, 1], [-1, 1]] as const;
    let time = 0;
    expect(() => extractProjectDerivedScalarIsosurface(project,
      magnitude.identity.id, clipBounds, 1, 2000, 1, () => ++time))
      .toThrow(/time budget/);
    const bounded = extractProjectDerivedScalarIsosurface(project,
      magnitude.identity.id, clipBounds, 1, 1, 5000);
    expect(bounded.triangleCount).toBeLessThanOrEqual(1);
    expect(bounded.complete).toBe(false);
    expect(bounded.limitReason).toBe("triangle-budget");
  });

  it("pins both root generations for a binary scalar Mesh", () => {
    let project = load();
    const first = project.workspace.entries.find(item => item.module === "vector3d")!
      .checkpoint as VectorField3DDocument;
    const second = createVectorField3DDocument({ ...first.source,
      field: { kind: "expressions", components: [
        vectorField3DExpression("1", "m/s"),
        vectorField3DExpression("2", "m/s"),
        vectorField3DExpression("3", "m/s")] } },
    { stableKey: "gf14-binary-mesh-second", title: "Second source" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second, expected: second.identity, replay: null }] }));
    project = appendProjectDerivedField(project, first.identity.id,
      { kind: "vector-dot" }, { stableKey: "gf14-binary-mesh-dot",
        title: "Dot scalar", secondaryInputId: second.identity.id },
    source => source.source.field.kind === "expressions");
    const derived = project.workspace.derivedFields!.at(-1)!;
    const surface = extractProjectDerivedScalarIsosurface(project,
      derived.identity.id, [[-1, 1], [-1, 1], [-1, 1]], 1, 2000, 5000);
    expect(surface.vectorSources).toHaveLength(2);
    const promoted = promoteDerivedScalarIsosurfaceMesh(project.workspace, project, surface);
    expect(promoted.workspace.relations.at(-1)!.sources).toHaveLength(3);
    const origin = promoted.adapter.document().source.origin;
    if (origin.kind !== "derivedScalarFieldIsosurface") return;
    expect(projectDerivedScalarMeshStatus(project, origin).status).toBe("current");
    const revised = reviseVectorField3DDocument(second, { ...second.source,
      display: { ...second.source.display, maxGlyphs: second.source.display.maxGlyphs + 1 } });
    const changed = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: project.workspace.entries.map(item =>
        item.expected.id === second.identity.id ?
          { ...item, checkpoint: revised, expected: revised.identity } : item) }));
    expect(projectDerivedScalarMeshStatus(changed, origin)).toEqual({
      status: "withheld", reason: "vector-source-changed" });
  });
});
