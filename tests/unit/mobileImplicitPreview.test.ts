import { describe, expect, it } from "vitest";
import { buildSurfacePreviewGeometry } from "../../apps/mobile/src/viewer/mobileSurfacePreview";

const implicitSurface = {
  id: "implicit-test",
  kind: "implicit" as const,
  expression: "x*x + y*y + z*z - 1",
  domain: { xSpan: 2, ySpan: 2, zSpan: 2 },
};

describe("mobile implicit preview", () => {
  it("shows an explicit uncomputed state instead of proxy geometry", () => {
    const preview = buildSurfacePreviewGeometry(implicitSurface, "balanced");
    expect(preview.state).toBe("uncomputed");
    expect(preview.geometry).toBeNull();
    expect(preview.uncomputed).toEqual({
      formula: implicitSurface.expression,
      capability: "VTK implicit preview",
    });
  });

  it("uses worker mesh data when a computed result is available", () => {
    const preview = buildSurfacePreviewGeometry(implicitSurface, "balanced", {
      implicitMeshBySurfaceId: {
        [implicitSurface.id]: {
          positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          indices: new Uint16Array([0, 1, 2]),
          vertexCount: 3,
          triCount: 1,
        },
      },
    });
    expect(preview.state).toBe("ready");
    expect(preview.geometry).not.toBeNull();
    preview.geometry?.dispose();
  });
});
