import { describe, expect, it } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createVectorField3DDocument,
  defaultVectorField3DWorkspace, extractVectorField3DSpeedIsosurface,
  planVectorField3DIsosurface, vectorField3DExpression,
  type VectorField3DSource } from "@math3d/core";
import { captureProjectResources, exportProjectPackage,
  parseProjectPackage } from "./projectResources";
import { verifyMixedWorkspaceReplay } from "../kernel/mixedWorkspaceReplay";
import { promoteScientificIsosurfaceMesh,
  reverifyScientificIsosurfaceMesh } from "./scientificIsosurfaceMesh";
import { meshDocumentEditable } from "./nativeMeshRestore";

const axes = (["x", "y", "z"] as const).map(role =>
  ({ role, label: role, unit: "m", min: -2, max: 2 })) as VectorField3DSource["axes"];
const field = createVectorField3DDocument({ axes, timeUnit: "s",
  field: { kind: "expressions", components: ["x", "y", "z"].map(source =>
    vectorField3DExpression(source, "m/s")) as Extract<VectorField3DSource["field"],
      { kind: "expressions" }>["components"] },
  seeds: [], display: { density: [5, 5, 5], maxGlyphs: 512,
    magnitudeScale: 1, colorBy: "speed" },
  solver: { absoluteTolerance: 1e-7, relativeTolerance: 1e-7,
    maxSteps: 1000, maxTime: 2 } }, { stableKey: "sci09-mesh-promotion-sphere" });
const workspace = createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
  relations: [], results: [], artifacts: [], constructions: [], committedSelection: null });
const surface = (clip: readonly (readonly [number, number])[]) => {
  const plan = planVectorField3DIsosurface(field,
    clip as ReturnType<typeof defaultVectorField3DWorkspace>["clipBounds"]);
  const speeds = Float64Array.from(plan.coordinates[0].flatMap(x =>
    plan.coordinates[1].flatMap(y => plan.coordinates[2].map(z =>
      Math.hypot(x, y, z)))));
  return extractVectorField3DSpeedIsosurface(field, plan, speeds, 1);
};

describe("SCI-09 source-linked Project Mesh", () => {
  it("preserves indexed sphere geometry, outward normals, topology and source relation through Project package", async () => {
    const sphere = surface(defaultVectorField3DWorkspace(field.source).clipBounds);
    const promoted = promoteScientificIsosurfaceMesh(workspace, field, sphere);
    const mesh = promoted.adapter.document();
    expect(meshDocumentEditable(mesh)).toBe(true);
    expect(mesh.source.origin).toMatchObject({ kind: "derivedVectorFieldIsosurface",
      source: sphere.source, recipe: { level: 1, unit: "m/s" },
      topology: { watertight: true, boundaryEdgeCount: 0 } });
    expect(promoted.workspace.relations).toHaveLength(1);
    expect(promoted.workspace.relations[0]).toMatchObject({
      operation: "vector3d.speed-isosurface-mesh",
      sources: [{ documentId: field.identity.id }] });
    const project = createMath3DProject(promoted.workspace,
      { stableKey: "sci09-source-linked-sphere" });
    const resources = captureProjectResources(project, item =>
      promoted.adapter.resources.bytes(item.reference as never));
    const reopened = parseProjectPackage(exportProjectPackage(project, resources));
    const resolved = verifyMixedWorkspaceReplay(reopened.project.workspace);
    expect(resolved.get(mesh.identity.id)).toEqual(mesh);
    expect(meshDocumentEditable(resolved.get(mesh.identity.id) as typeof mesh)).toBe(true);
    const buffers = reopened.resources.meshStore(reopened.project).resolve(mesh.source.resource)!;
    expect(buffers.indices).toEqual(sphere.indices);
    expect(buffers.normals).toEqual(sphere.normals);
    for (let i = 0; i < buffers.positions.length; i += 81) {
      const p = buffers.positions.slice(i, i + 3), n = buffers.normals!.slice(i, i + 3);
      expect(Math.hypot(...p)).toBeCloseTo(1, 1);
      expect(p[0]! * n[0]! + p[1]! * n[1]! + p[2]! * n[2]!).toBeGreaterThan(0.75);
    }
    const origin = promoted.adapter.mesh().source;
    if (origin.kind !== "derivedVectorFieldIsosurface") throw Error();
    expect(await reverifyScientificIsosurfaceMesh(origin, field)).toBe("current");
    expect(await reverifyScientificIsosurfaceMesh(origin,
      { ...field, identity: { ...field.identity, revision: field.identity.revision + 1 } }))
      .toBe("stale");
  });

  it("retains open clipping boundaries and their counts", () => {
    const clipped = surface([[-0.5, 0.5], [-2, 2], [-2, 2]]);
    const promoted = promoteScientificIsosurfaceMesh(workspace, field, clipped);
    expect(promoted.adapter.mesh().source).toMatchObject({ clipped: true,
      topology: { watertight: false, nonManifoldEdgeCount: 0,
        boundaryEdgeCount: clipped.topology.boundaryEdgeCount,
        clipBoundaryEdgeCount: clipped.topology.clipBoundaryEdgeCount } });
    expect(clipped.topology.boundaryEdgeCount).toBeGreaterThan(0);
  });
});
