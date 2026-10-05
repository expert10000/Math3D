import { expect, it } from "vitest";
import { savedMeshCurvatureMap, pickedMeshVertex } from "./savedMeshExploration";
import type { SurfaceMeshData } from "../mesh/surfaceMesh";
import { IcosahedronGeometry } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";

const square: SurfaceMeshData = { label: "Square with centre", source: { kind: "bakedFromParam" }, positions: Float32Array.from([0,0,0, 1,0,0, 1,1,0, 0,1,0, .5,.5,0]), indices: Uint32Array.from([0,1,4, 1,2,4, 2,3,4, 3,0,4]) };
it("K/H colour fields mask boundaries, retain exact vertex ordering, and keep zero flat curvature neutral", () => {
  const original = square.positions.slice();
  for (const field of ["K", "H"] as const) {
    const map = savedMeshCurvatureMap(square, field);
    expect(Array.from(map.mask)).toEqual([0,0,0,0,1]);
    expect(map.count).toBe(1); expect(map.excluded).toBe(4);
    expect(map.values[4]).toBeCloseTo(0, 6);
    expect(map.colors.length).toBe(square.positions.length);
    expect(Array.from(map.colors).every(value => Number.isFinite(value) && value >= 0 && value <= 1)).toBe(true);
  }
  expect(square.positions).toEqual(original);
});
it("triangle picking keeps coincident sheets separate and rejects invalid hits", () => {
  const mesh = { ...square, positions: Float32Array.from([0,0,0,1,0,0,0,1,0, 0,0,0,1,0,0,0,1,0]), indices: Uint32Array.from([0,1,2, 3,4,5]) };
  expect(pickedMeshVertex(mesh, 0, {x:.02,y:.02,z:0})).toBe(0);
  expect(pickedMeshVertex(mesh, 1, {x:.02,y:.02,z:0})).toBe(3);
  expect(pickedMeshVertex(mesh, 1, {x:.98,y:0,z:0})).toBe(4);
  for (const index of [-1, 2, .5]) expect(() => pickedMeshVertex(mesh, index, {x:0,y:0,z:0})).toThrow();
});
it("closed convex meshes colour positive curvature and reject oversized fields before computation", () => {
  const geometry = new IcosahedronGeometry(1, 3); geometry.deleteAttribute("uv"); geometry.deleteAttribute("normal");
  const welded = mergeVertices(geometry), sphere = { ...square, positions: Float32Array.from(welded.getAttribute("position").array), indices: Uint32Array.from(welded.getIndex()!.array) };
  for (const field of ["K", "H"] as const) {
    const map = savedMeshCurvatureMap(sphere, field);
    expect(map.count).toBeGreaterThan(10); expect(map.min).toBeGreaterThan(0); expect(map.range.min).toBe(-map.range.max);
    expect(map.colors[0]).toBeGreaterThan(map.colors[2]);
  }
  expect(() => savedMeshCurvatureMap({ ...square, positions: new Float32Array(300_003) }, "K")).toThrow("100,000 vertices");
  geometry.dispose(); welded.dispose();
});
