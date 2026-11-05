import { describe, expect, it } from "vitest";
import { clipOverlayLines, clipOverlayMesh, clipOverlayPoints, qualifyQuantumNativeOverlay } from "./quantumNativeOverlay";

const native = { status: "declared" as const, value: { format: "math3d.coordinate-frame/v1" as const,
  frame: "lab xyz", unit: "m", axes: ["x", "y", "z"] as const, handedness: "right" as const } };
const quantum = { axes: ["x", "y", "z"], units: ["m", "m", "m"], handedness: "right" };

describe("QI-34 quantum and native overlay", () => {
  it("requires an asserted identity frame and exact axes, units and handedness", () => {
    expect(qualifyQuantumNativeOverlay(quantum, native, "lab xyz")).toEqual({ ok: true, frame: "lab xyz", unit: "m" });
    expect(qualifyQuantumNativeOverlay(quantum, native, "other").ok).toBe(false);
    expect(qualifyQuantumNativeOverlay({ ...quantum, units: ["m", "m", "cm"] }, native, "lab xyz").ok).toBe(false);
    expect(qualifyQuantumNativeOverlay({ ...quantum, axes: ["y", "x", "z"] }, native, "lab xyz").ok).toBe(false);
    expect(qualifyQuantumNativeOverlay({ ...quantum, handedness: "left" }, native, "lab xyz").ok).toBe(false);
    expect(qualifyQuantumNativeOverlay(quantum, { status: "missing" }, "lab xyz").ok).toBe(false);
  });
  it("clips both mesh triangles and line/point layers to the same z slab", () => {
    const mesh = { label: "triangle", positions: Float32Array.from([0, 0, -1, 2, 0, 0, 0, 2, 1]), indices: null,
      source: { kind: "polyhedronPreset" as const, label: "triangle" } };
    const result = clipOverlayMesh(mesh, 0, 0.5);
    expect(result.positions.length).toBeGreaterThan(0);
    expect([...result.positions].filter((_, index) => index % 3 === 2).every(z => z >= 0 && z <= 0.5)).toBe(true);
    expect(clipOverlayPoints([{ points: [{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 0.25 }] }], 0, 0.5)[0]!.points).toHaveLength(1);
    const lines = clipOverlayLines([{ lines: [[{ x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }]], color: 1 }], 0, 0.5);
    expect(lines[0]!.lines[0]!.map(point => point.z)).toEqual([0, 0.5]);
  });
});
