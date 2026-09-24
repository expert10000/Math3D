import { describe, expect, it } from "vitest";
import {
  admitMobileMeshForRendering,
  createReducedMobileMeshPreview,
  decideMobileMeshAdmission,
  estimateMobileMeshBytes,
} from "../../apps/mobile/src/models/mobileMeshAdmission";
import type { MobileMeshPayload } from "../../apps/mobile/src/viewer/mobileSurfacePreview";

const makeMesh = (triangles: number, sharedVertices = false): MobileMeshPayload => {
  const vertexCount = sharedVertices ? triangles + 2 : triangles * 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = vertexCount <= 65_535 ? new Uint16Array(triangles * 3) : new Uint32Array(triangles * 3);
  for (let triangle = 0; triangle < triangles; triangle += 1) {
    indices[triangle * 3] = sharedVertices ? triangle : triangle * 3;
    indices[triangle * 3 + 1] = sharedVertices ? triangle + 1 : triangle * 3 + 1;
    indices[triangle * 3 + 2] = sharedVertices ? triangle + 2 : triangle * 3 + 2;
  }
  return { positions, normals, indices, vertexCount, triCount: triangles };
};

describe("mobile mesh admission", () => {
  it("admits a mesh that fits the active render budget", () => {
    const mesh = makeMesh(8_000, true);
    const result = admitMobileMeshForRendering(mesh, "balanced", true);
    expect(result.admission).toMatchObject({ action: "full", sourceTriangles: 8_000 });
    expect(result.mesh).toBe(mesh);
    expect(estimateMobileMeshBytes(mesh)).toBe(mesh.positions.byteLength + mesh.normals!.byteLength + mesh.indices.byteLength);
  });

  it("compacts a medium mesh into a deterministic local preview", () => {
    const mesh = makeMesh(80_000, true);
    const decision = decideMobileMeshAdmission(mesh, "balanced", true);
    expect(decision).toMatchObject({ action: "reduced", targetTriangles: 32_000 });
    const reduced = createReducedMobileMeshPreview(mesh, decision.targetTriangles);
    expect(reduced.triCount).toBe(32_000);
    expect(reduced.indices.length).toBe(96_000);
    expect(reduced.vertexCount).toBeLessThan(mesh.vertexCount);
    expect(Math.max(...reduced.indices.subarray(0, 2_000))).toBeLessThan(reduced.vertexCount);
  });

  it("requests remote simplification when local compaction would exceed the memory budget", () => {
    const mesh = makeMesh(500_000, true);
    expect(decideMobileMeshAdmission(mesh, "balanced", true)).toMatchObject({
      action: "remote-simplify",
      targetTriangles: 32_000,
    });
    expect(decideMobileMeshAdmission(mesh, "balanced", false).action).toBe("reject");
  });

  it("rejects malformed and hard-limit payloads before rendering", () => {
    const malformed = makeMesh(1);
    malformed.indices[2] = 99;
    expect(decideMobileMeshAdmission(malformed, "quality", true)).toMatchObject({ action: "reject" });
    expect(decideMobileMeshAdmission(makeMesh(2_000_001, true), "quality", true)).toMatchObject({ action: "reject" });
  });
});
