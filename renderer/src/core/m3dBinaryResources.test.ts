import { describe, expect, it } from "vitest";
import { decodeM3DMeshResource, encodeM3DMeshResource, isM3DResourceReference, verifyM3DMeshResource } from "@math3d/core";

describe("math3d.mesh.v1 binary resource", () => {
  it("round-trips indexed typed arrays with a verified checksum", () => {
    const resource = encodeM3DMeshResource({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    });
    const decoded = decodeM3DMeshResource(resource.bytes);

    expect(resource).toMatchObject({ vertexCount: 3, triangleCount: 1, descriptor: { format: "math3d.mesh.v1" } });
    expect(decoded.positions).toEqual(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]));
    expect(decoded.indices).toEqual(new Uint32Array([0, 1, 2]));
    expect(verifyM3DMeshResource(resource)).toBe(true);
    expect(isM3DResourceReference({ resourceId: `m3d:${resource.descriptor.checksum.slice(7)}`, descriptor: resource.descriptor })).toBe(true);
  });

  it("rejects corrupted or non-finite mesh resources", () => {
    const resource = encodeM3DMeshResource({
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      indices: new Uint32Array([0, 1, 2]),
    });
    const corrupted = new Uint8Array(resource.bytes);
    corrupted[0] = 0;
    expect(() => decodeM3DMeshResource(corrupted)).toThrow(/magic/);
    expect(() => encodeM3DMeshResource({ positions: new Float32Array([Number.NaN, 0, 0]), indices: new Uint32Array() })).toThrow(/finite/);
  });
});
