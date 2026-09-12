import { describe, expect, it } from "vitest";
import { adaptSurfaceDefinition } from "./infrastructure";
import { compactDerivedSurfaceMesh, createDerivedSurfaceMeshPayload } from "./derivedSurfaceMesh";
import { buildDerivedSurfaceMeshBackendSummary, createDerivedSurfaceMeshBackendRoute, validateDerivedSurfaceMeshTopology } from "./derivedMeshBackendBridge";

const definition = adaptSurfaceDefinition({ id: "sphere", revision: 4, label: "Sphere", representation: "parametric", familyId: "sphere", expressions: { x: "x", y: "y", z: "z" }, domain: { kind: "parameter", u: { min: 0, max: 6.28 }, v: { min: 0, max: 3.14 } } });
const record = compactDerivedSurfaceMesh(createDerivedSurfaceMeshPayload({ definition, label: "Sphere mesh", vertexCount: 4, faceCount: 4, method: "parameter-grid", settings: { resolution: 24 }, backend: { id: "threejs-native", version: "180" } }), "Sphere mesh");
const tetrahedron = { positions: new Float32Array([1, 1, 1, -1, -1, 1, -1, 1, -1, 1, -1, -1]), indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]) };

describe("Surface derived-mesh backend bridge", () => {
  it("reports compact topology and provenance without backend-control duplication", () => {
    expect(validateDerivedSurfaceMeshTopology(tetrahedron)).toEqual({ watertight: true, manifold: true, boundaryEdgeCount: 0, nonManifoldEdgeCount: 0 });
    expect(buildDerivedSurfaceMeshBackendSummary({ record, geometry: tetrahedron })).toMatchObject({ variant: "native-tessellation", backend: "threejs-native", backendVersion: "180", sourceRevision: 4, vertexCount: 4, faceCount: 4, validation: { watertight: true } });
  });

  it("keeps missing geometry and missing backends explicit", () => {
    expect(buildDerivedSurfaceMeshBackendSummary({ record, backendAvailability: "browser-limited", backendAvailabilityMessage: "Native workers require desktop Math3D." })).toMatchObject({ validation: null, availability: "browser-limited", availabilityMessage: expect.stringContaining("desktop") });
  });

  it("routes shortcuts to shared Mesh operations", () => {
    expect(createDerivedSurfaceMeshBackendRoute({ record, workflow: "remesh", sourceRepresentation: "parametric" })).toMatchObject({ workspace: "mesh-analysis", panel: "operations", operation: "cgal-remesh", backend: "cgal", sourceRevision: 4 });
    expect(createDerivedSurfaceMeshBackendRoute({ record, workflow: "robust-mesh", sourceRepresentation: "implicit" }).operation).toBe("implicit-mesh");
    expect(createDerivedSurfaceMeshBackendRoute({ record, workflow: "robust-mesh", sourceRepresentation: "parametric" }).operation).toBe("cgal-repair-validate");
  });
});
