import { describe, expect, it } from "vitest";
import { Graph2DPointTableStore, decodeMeshBuffers } from "@math3d/core";
import { promoteQuantumNative } from "../../renderer/src/projects/quantumNativePromotion";
import type { QuantumSceneOpenResponse } from "../../renderer/src/components/QuantumScenePreview";

const source = (): Extract<QuantumSceneOpenResponse, { ok: true }> => ({
  ok: true, canceled: false, directory: "C:\\verified.qscene", remembered: false,
  reference: { directory: "C:\\verified.qscene", sceneFingerprint: "a".repeat(64) },
  mappedObjectIds: ["line", "patch"], deferredObjectIds: [], deferredFieldIds: [],
  document: { title: "Verified source", cameras: [{ position: { x: 0, y: 0, z: 4 },
    target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } }],
    extensions: { "quantum-scene/v1": { scene: { objects: [
      { id: "line", kind: "polyline", label: "Band path" },
      { id: "patch", kind: "mesh", label: "Curvature patch" }],
      coordinates: { units: ["rad", "rad", "energy"] },
      provenance: { runId: "run-1", resultSha256: "b".repeat(64) } } } },
    geometry: { segments: [
      { a: { id: "line:link:0:a", x: 0, y: 0, z: -1 }, b: { id: "line:link:0:b", x: 1, y: 0, z: 0 } },
      { a: { id: "line:link:1:a", x: 1, y: 0, z: 0 }, b: { id: "line:link:1:b", x: 2, y: 0, z: 1 } }],
      triangles: [{ a: { id: "patch:0", x: 0, y: 0, z: 0 },
        b: { id: "patch:1", x: 1, y: 0, z: 0 }, c: { id: "patch:2", x: 0, y: 1, z: 0 } }] } },
});

describe("QI-21 verified quantum source promotion", () => {
  it("creates independent native Geometry, Curve and Graph copies with a checked point sidecar", () => {
    const opened = source(), before = JSON.stringify(opened);
    const tables = new Graph2DPointTableStore();
    const geometry = promoteQuantumNative(opened, "geometry", rows => tables.publish(rows)).documents[0];
    const curve = promoteQuantumNative(opened, "curve", rows => tables.publish(rows)).documents[0];
    const graph = promoteQuantumNative(opened, "graph2d", rows => tables.publish(rows)).documents[0];
    expect(geometry.format).toBe("math3d.geometry-document");
    expect(curve.format).toBe("math3d.curve-document");
    expect(graph.format).toBe("math3d.graph2d-document");
    if (graph.format === "math3d.graph2d-document" && graph.source.objects[0].kind === "point-series")
      expect(tables.resolve(graph.source.objects[0].table)?.map(row => row.y)).toEqual([-1, 0, 1]);
    expect(JSON.stringify(opened)).toBe(before);
  });
  it("creates a native Mesh sidecar and a Surface linked to that Mesh without changing f64 source", () => {
    const opened = source();
    const mesh = promoteQuantumNative(opened, "mesh", () => { throw new Error("not needed"); });
    const surface = promoteQuantumNative(opened, "surface", () => { throw new Error("not needed"); });
    expect(mesh.documents[0].format).toBe("math3d.mesh-document");
    expect(surface.documents.map(document => document.format)).toEqual(["math3d.mesh-document", "math3d.surface-document"]);
    expect(decodeMeshBuffers(mesh.meshBytes!.bytes).positions).toHaveLength(9);
    expect(surface.meshBytes!.id).toBe(mesh.meshBytes!.id);
  });
  it("carries an exact shared coordinate frame into promoted Geometry and Mesh", () => {
    const opened = source();
    const extension = opened.document.extensions["quantum-scene/v1"] as { scene: { coordinates: unknown } };
    extension.scene.coordinates = { axes: ["x", "y", "z"], units: ["a0", "a0", "a0"], handedness: "right" };
    const geometry = promoteQuantumNative(opened, "geometry", () => { throw new Error("not needed"); }).documents[0];
    const mesh = promoteQuantumNative(opened, "mesh", () => { throw new Error("not needed"); }).documents[0];
    if (geometry.format !== "math3d.geometry-document" || mesh.format !== "math3d.mesh-document") throw new Error("Wrong native kind");
    expect(geometry.source.extensions.math3dCoordinateFrame).toEqual(mesh.source.origin.math3dCoordinateFrame);
    expect(geometry.source.extensions.math3dCoordinateFrame).toMatchObject({ frame: `quantum:${"a".repeat(64)}`, unit: "a0" });
  });
});
