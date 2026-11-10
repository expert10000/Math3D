import { describe, expect, it } from "vitest";
import { createSdfMetadata } from "./sdf";
import { exportScientificVolume, importScientificVolume, type ScientificVolumeMetadata } from "./scientificIO";

const spatial: ScientificVolumeMetadata = {
  dimensions: [2, 2, 1], origin: [1, 2, 3], spacing: [0.5, 2, 1],
  direction: [0, -1, 0, 1, 0, 0, 0, 0, 1], centering: "point",
  scalarType: "float32", components: 1, coordinateSystem: "world-cartesian",
  positionUnits: "mm", valueUnits: "mm", missingValuePolicy: "none", missingValueSentinel: null,
  byteOrder: "little-endian",
};

describe("SDF scientific sidecar", () => {
  it.each(["raw", "npy", "vti"] as const)("round-trips %s source and sign provenance with exact samples", (format) => {
    const values = new Float32Array([-1, 0, 1, 2]);
    const grid = { dims: spatial.dimensions, origin: spatial.origin, spacing: spatial.spacing,
      direction: spatial.direction, centering: spatial.centering, scalars: values };
    const sdf = createSdfMetadata({ grid, output: "signed-distance", operation: "distance", sources: [{
      module: "mesh", objectId: "source-mesh", revision: 4, label: "Mesh", transform: [], positionUnits: "mm",
    }], sign: { reliable: true, confidence: "high", watertight: true, orientation: "outward",
      boundaryEdgeCount: 0, nonManifoldEdgeCount: 0, signedVolume: 3, message: "closed" },
      sourceMeshFingerprint: "mesh-bytes", backend: "vtk-distance" });
    const artifacts = exportScientificVolume("distance", format, values, spatial, sdf);
    const imported = importScientificVolume(artifacts);
    expect(Array.from(imported.values)).toEqual(Array.from(values));
    expect(imported.sdf).toMatchObject({ sourceMeshFingerprint: "mesh-bytes", sourceEvidence: "imported", output: "signed-distance", sources: [{ objectId: "source-mesh", revision: 4 }] });
    const changed = artifacts.map((artifact) => artifact.fileName.endsWith(".sdf.json") ?
      { ...artifact, bytes: new TextEncoder().encode(new TextDecoder().decode(artifact.bytes).replace("mesh-bytes", "other-mesh")) } : artifact);
    expect(importScientificVolume(changed).sdf?.sourceMeshFingerprint).toBe("other-mesh");
    const tampered = artifacts.map((artifact) => {
      if (!artifact.fileName.endsWith(".sdf.json")) return artifact;
      const sidecar = JSON.parse(new TextDecoder().decode(artifact.bytes));
      sidecar.fingerprint = "wrong-grid";
      return { ...artifact, bytes: new TextEncoder().encode(JSON.stringify(sidecar)) };
    });
    expect(() => importScientificVolume(tampered)).toThrow(/does not match/);
  });
});
