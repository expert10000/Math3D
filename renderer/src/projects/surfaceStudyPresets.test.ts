import { expect, it } from "vitest";
import { createSurfaceDocument, createMixedWorkspaceDocument } from "@math3d/core";
import { SurfaceDocumentAdapter } from "../surfaceAnalysis/surfaceDocumentAdapter";
import { surfaceStudySource } from "./surfaceStudyPresets";
import { createSavedSurfaceMesh } from "./savedSurfaceMesh";

it("Helicoid and Catenoid setups sample their suggested ranges and retain undoable source generations", () => {
  const document = createSurfaceDocument({ stableKey: "preset-study", source: { representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, label: "u", periodic: false }, v: { min: -1, max: 1, label: "v", periodic: false } }, units: { length: "m" }, orientation: { sign: 1 }, parameters: { retained: true }, branchPolicy: null, definition: { familyId: "custom", expressions: { x: "u", y: "v", z: "0" } } } });
  for (const id of ["helicoid", "catenoid"] as const) {
    const adapter = new SurfaceDocumentAdapter(document);
    adapter.commitSource(surfaceStudySource(document.source, id, 2));
    expect(adapter.document().source.units).toEqual(document.source.units);
    expect(adapter.document().source.parameters).toEqual(document.source.parameters);
    const current = adapter.document();
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: current, expected: current.identity, replay: null }], activeDocumentIds: [current.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null });
    const mesh = createSavedSurfaceMesh(workspace, current, { documents: new Map([[current.identity.id, current]]) }).adapter.mesh();
    expect(mesh.positions.length).toBe(1089 * 3);
    expect(Array.from(mesh.positions).every(Number.isFinite)).toBe(true);
    if (id === "catenoid") expect(Math.hypot(mesh.positions[16 * 33 * 3], mesh.positions[16 * 33 * 3 + 1])).toBeCloseTo(2, 5);
    adapter.undo(); expect(adapter.document().source).toEqual(document.source);
    adapter.redo(); expect(adapter.document().source).toEqual(current.source);
  }
  for (const value of [0, -1, NaN, Infinity, 101]) expect(() => surfaceStudySource(document.source, "helicoid", value)).toThrow();
});
