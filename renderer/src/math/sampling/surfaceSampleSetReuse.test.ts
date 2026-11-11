import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { sameSurfaceSampleSet, type SurfaceSampleSet } from "./surfaceSampling";

const sampleSet = (): SurfaceSampleSet => ({
  samples: [{ id: 0, position: new THREE.Vector3(1, 2, 3),
    normal: new THREE.Vector3(0, 0, 1), uv: { u: 0.25, v: 0.5 },
    vertexIndex: 0, meshKey: "surface-a", meta: { surfaceKind: "param" } }],
  center: new THREE.Vector3(1, 2, 3),
  bbox: new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 4, 6)),
  meshData: [{ key: "surface-a", positions: new Float32Array([1, 2, 3]),
    indices: new Uint32Array([0, 0, 0]) }],
  curvatures: { K: new Float32Array([1]), H: new Float32Array([2]),
    k1: new Float32Array([3]), k2: new Float32Array([4]) },
});

describe("Surface sample reuse", () => {
  it("reuses exact recomputations but rejects changed charts and mesh bytes", () => {
    const first = sampleSet(), identical = sampleSet();
    expect(sameSurfaceSampleSet(first, identical)).toBe(true);
    identical.samples[0]!.uv!.u = 0.75;
    expect(sameSurfaceSampleSet(first, identical)).toBe(false);
    const changedMesh = sampleSet();
    changedMesh.meshData![0]!.positions[0] = 9;
    expect(sameSurfaceSampleSet(first, changedMesh)).toBe(false);
    const changedCurvature = sampleSet();
    changedCurvature.curvatures!.K[0] = -1;
    expect(sameSurfaceSampleSet(first, changedCurvature)).toBe(false);
  });
});
