import { describe, expect, it } from "vitest";
import {
  deriveMeshHealthState,
  getMeshHealthBlockers,
  mergeCgalMeshHealthResult,
  type MeshHealthResult,
  type MeshHealthValidation,
} from "./meshHealth";

const makeHealth = (overrides: Partial<MeshHealthResult> = {}): MeshHealthResult => ({
  state: "Healthy",
  backend: "math3d",
  cleanMesh: true,
  trianglesValid: true,
  vertexCount: 4,
  faceCount: 4,
  edgeCount: 6,
  componentCount: 1,
  invalidVertexCount: 0,
  invalidFaceCount: 0,
  degenerateTriangleCount: 0,
  boundaryEdgeCount: 0,
  boundaryLoopCount: 0,
  nonManifoldEdgeCount: 0,
  duplicateVertexCount: 0,
  duplicateVertexGroups: [],
  duplicateFaceCount: 0,
  eulerCharacteristic: 2,
  manifold: true,
  watertight: true,
  orientable: true,
  orientationConsistent: true,
  selfIntersection: { checked: true, suspectedPairs: 0, sampledFaces: 4, truncated: false },
  selfIntersectionPairs: 0,
  weldTolerance: 1e-4,
  diagnostics: [],
  warnings: [],
  sphereSeamWarning: false,
  ...overrides,
});

const makeValidation = (overrides: Partial<MeshHealthValidation> = {}): MeshHealthValidation => ({
  vertexCount: 4,
  faceCount: 4,
  edgeCount: 6,
  componentCount: 1,
  boundaryEdgeCount: 0,
  nonManifoldEdgeCount: 0,
  invalidFaceCount: 0,
  degenerateFaceCount: 0,
  duplicateFaceCount: 0,
  watertight: true,
  manifold: true,
  oriented: true,
  selfIntersection: { checked: true, suspectedPairs: 0, sampledFaces: 4, truncated: false },
  diagnostics: ["CGAL validation complete"],
  warnings: [],
  ...overrides,
});

describe("canonical mesh health", () => {
  it("requires a complete self-intersection check before declaring a clean mesh healthy", () => {
    expect(deriveMeshHealthState(makeHealth())).toBe("Healthy");
    expect(
      deriveMeshHealthState(
        makeHealth({ selfIntersection: { checked: false, suspectedPairs: 0, sampledFaces: 4, truncated: false } })
      )
    ).toBe("Unverified");
    expect(
      deriveMeshHealthState(
        makeHealth({ selfIntersection: { checked: true, suspectedPairs: 0, sampledFaces: 4, truncated: true } })
      )
    ).toBe("Unverified");
  });

  it("classifies structural defects and non-orientable topology as invalid", () => {
    expect(deriveMeshHealthState(makeHealth({ boundaryEdgeCount: 1, watertight: false }))).toBe("Invalid");
    expect(deriveMeshHealthState(makeHealth({ nonManifoldEdgeCount: 1, manifold: false }))).toBe("Invalid");
    expect(deriveMeshHealthState(makeHealth({ orientable: false }))).toBe("Invalid");
  });

  it("classifies repairable orientation, duplicate, and intersection findings as warnings", () => {
    expect(deriveMeshHealthState(makeHealth({ orientationConsistent: false }))).toBe("Warning");
    expect(deriveMeshHealthState(makeHealth({ duplicateFaceCount: 1 }))).toBe("Warning");
    expect(
      deriveMeshHealthState(
        makeHealth({ selfIntersection: { checked: true, suspectedPairs: 2, sampledFaces: 4, truncated: false } })
      )
    ).toBe("Warning");
  });

  it("merges CGAL validation as the authoritative integrity result", () => {
    const local = makeHealth({
      state: "Unverified",
      cleanMesh: false,
      selfIntersection: { checked: false, suspectedPairs: 0, sampledFaces: 4, truncated: false },
    });
    const result = mergeCgalMeshHealthResult(local, makeValidation({ duplicateFaceCount: 2, oriented: false }));

    expect(result.backend).toBe("hybrid");
    expect(result.duplicateFaceCount).toBe(2);
    expect(result.orientationConsistent).toBe(false);
    expect(result.state).toBe("Warning");
    expect(result.cleanMesh).toBe(false);
    expect(result.diagnostics).toEqual(["CGAL validation complete"]);
  });

  it("reports blockers from the same canonical result shown in the Inspector", () => {
    const blockers = getMeshHealthBlockers(
      makeHealth({
        state: "Invalid",
        cleanMesh: false,
        boundaryEdgeCount: 3,
        watertight: false,
        orientationConsistent: false,
        selfIntersection: { checked: false, suspectedPairs: 0, sampledFaces: 4, truncated: false },
      })
    );
    expect(blockers).toContain("not watertight");
    expect(blockers).toContain("3 boundary edges");
    expect(blockers).toContain("inconsistent orientation");
    expect(blockers).toContain("full self-intersection check required");
  });
});
