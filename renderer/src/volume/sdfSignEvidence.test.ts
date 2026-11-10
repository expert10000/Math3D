import { describe, expect, it } from "vitest";
import { analyzeMeshForSignedDistance } from "./sdf";
import { fingerprintSdfSourceMesh, qualifySdfSignEvidence } from "./sdfSignEvidence";

describe("SDF sign evidence", () => {
  it("binds sign diagnostics to every source mesh byte", () => {
    const mesh = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), indices: new Uint32Array([0, 1, 2, 0, 2, 3]), source: { kind: "csg" as const } };
    const pin = fingerprintSdfSourceMesh(mesh);
    const diagnostics = analyzeMeshForSignedDistance(mesh.positions, mesh.indices);
    expect(qualifySdfSignEvidence(diagnostics, pin, pin).status).toBe("current");
    mesh.positions[4] = 2;
    expect(qualifySdfSignEvidence(diagnostics, pin, fingerprintSdfSourceMesh(mesh))).toMatchObject({ status: "historical", diagnostics: null });
    expect(qualifySdfSignEvidence(diagnostics, null, pin).status).toBe("unavailable");
  });
});
