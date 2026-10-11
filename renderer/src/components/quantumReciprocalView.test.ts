import { describe, expect, it } from "vitest";
import { buildQuantumPrimitiveMeshes } from "./quantumPrimitiveMeshes";
import { buildQuantumReciprocalView, reciprocalPathFromPrimitive, reciprocalPointFromPrimitive,
  type ReciprocalDefinition } from "./quantumReciprocalView";

const reciprocal: ReciprocalDefinition = {
  directBasis: [[1, 0, 0], [0, 1, 0]], basis: [[2 * Math.PI, 0, 0], [0, 2 * Math.PI, 0]],
  directUnit: "spacing", reciprocalUnit: "rad / spacing", pointObject: "k-points",
  points: [{ id: "Gamma", label: "Γ", position: [0, 0, 0] },
    { id: "X", label: "X", position: [Math.PI, 0, 0] }],
  paths: [{ object: "k-path", label: "Γ → X", points: ["Gamma", "X"] }],
  boundaryObjects: ["bz"],
};
const objects = ["k-points", "k-path", "bz", "real-site"].map(id => ({ id, label: id,
  kind: id === "k-points" || id === "real-site" ? "point-cloud" : "polyline",
  style: { color: "#79d9c1", opacity: 1, size: 1 } }));
const geometry = {
  points: [{ x: 0, y: 0, z: 0, id: "k-points:site:0" },
    { x: Math.PI, y: 0, z: 0, id: "k-points:site:1" },
    { x: 100, y: 100, z: 100, id: "real-site:site:0" }],
  segments: [
    { a: { x: 0, y: 0, z: 0, id: "k-path:link:0:a" },
      b: { x: Math.PI, y: 0, z: 0, id: "k-path:link:0:b" } },
    { a: { x: -Math.PI, y: 0, z: 0, id: "bz:link:0:a" },
      b: { x: Math.PI, y: 0, z: 0, id: "bz:link:0:b" } },
  ],
};

describe("source-backed reciprocal geometry", () => {
  it("isolates declared k-space objects and adds only supplied basis guides", () => {
    const view = buildQuantumReciprocalView(geometry, reciprocal, objects, objects.map(object => object.id));
    expect(view.mappedObjectIds).toEqual(["k-points", "k-path", "bz"]);
    expect(view.geometry.points).toHaveLength(2);
    expect(view.geometry.segments).toHaveLength(4);
    expect(view.geometry.segments?.at(-1)?.b).toMatchObject({ x: 0, y: 2 * Math.PI, z: 0 });
    expect(JSON.stringify(view.geometry)).not.toContain("real-site");
    expect(view.labels.map(label => label.text)).toEqual(["Γ", "X", "b1", "b2"]);
  });

  it("maps picked k-point and path faces to exact source IDs and indices", () => {
    const view = buildQuantumReciprocalView(geometry, reciprocal, objects, objects.map(object => object.id));
    const meshes = buildQuantumPrimitiveMeshes(view.geometry, view.objects, view.mappedObjectIds);
    const site = meshes.find(mesh => mesh.id === "k-points")!.primitivesByFace[8];
    const path = meshes.find(mesh => mesh.id === "k-path")!.primitivesByFace[0];
    expect(reciprocalPointFromPrimitive(reciprocal, site)).toEqual({ ...reciprocal.points[1],
      sourceObjectId: "k-points", sourceSampleIndex: 1 });
    expect(reciprocalPathFromPrimitive(reciprocal, path)).toMatchObject({
      objectId: "k-path", segmentIndex: 0, fromId: "Gamma", toId: "X" });
    expect(reciprocalPointFromPrimitive(reciprocal, path)).toBeNull();
    expect(reciprocalPathFromPrimitive(reciprocal, site)).toBeNull();
  });
});
