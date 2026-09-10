import { describe, expect, it } from "vitest";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { buildGeometrySceneIdentities } from "./sceneIdentity";
import { createGeometryObject } from "./proceduralObjects";

const mesh = (kind: SurfaceMeshData["source"]): SurfaceMeshData => ({
  label: "mesh",
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
  indices: new Uint32Array([0, 1, 2]),
  normals: null,
  uvs: null,
  source: kind,
});

describe("Geometry scene identity adapter", () => {
  it("adapts procedural and dataset objects without changing their payloads", () => {
    const object = createGeometryObject("box", "box-a");
    const before = JSON.stringify(object);
    const identities = buildGeometrySceneIdentities({
      objects: [object],
      datasetObjects: [
        { id: "import-a", name: "Imported", visible: true, mesh: mesh({ kind: "import", format: "obj" }) },
      ],
      revisions: { "box-a": 4, "import-a": 2 },
    });

    expect(JSON.stringify(object)).toBe(before);
    expect(identities.map((identity) => [identity.id, identity.sourceKind, identity.revision])).toEqual([
      ["geometry:box-a", "procedural", 4],
      ["geometry:import-a", "import", 2],
    ]);
  });

  it("records a promoted mesh as a derived scene entity with its source dependency", () => {
    const identities = buildGeometrySceneIdentities({
      objects: [],
      datasetObjects: [
        {
          id: "derived-a",
          name: "Derived mesh",
          visible: false,
          mesh: mesh({ kind: "csg" }),
          promotion: {
            sourceGeometryId: "source-a",
            sourceOperationHistory: [],
            promotionMode: "editable_mesh_object",
            vertexCount: 3,
            faceCount: 1,
            bounds: null,
            validityReport: {
              state: "ready",
              checks: [],
              stats: {
                vertexCount: 3,
                faceCount: 1,
                degenerateFaceCount: 0,
                duplicateFaceCount: 0,
                duplicateVertexCount: 0,
                boundaryEdgeCount: 3,
                nonManifoldEdgeCount: 0,
                connectedComponentCount: 1,
                isolatedVertexCount: 0,
                inconsistentOrientationEdgeCount: 0,
              },
              suggestions: { dedupeTolerance: 1e-6, maxHoleEdges: 16 },
              notes: [],
            },
            createdAt: 1,
          },
        },
      ],
    });

    expect(identities[0]).toMatchObject({
      id: "geometry:derived-a",
      parentId: "geometry:source-a",
      sourceKind: "derived",
      derivedFromIds: ["geometry:source-a"],
      dependencyIds: ["geometry:source-a"],
    });
  });
});
