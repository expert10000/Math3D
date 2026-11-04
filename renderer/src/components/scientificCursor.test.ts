import { describe, expect, it } from "vitest";
import { ScientificCursorBus, projectQwzCursor, projectSpatialCursor } from "./scientificCursor";
import { importQuantumSceneBundle } from "../../../src/main/quantumScene/importer";
import { projectVerifiedQwzCursor } from "../../../src/main/quantumScene/cursorProjection";
import { fileURLToPath } from "node:url";

const hash = "a".repeat(64);

describe("Scientific Cursor", () => {
  it("publishes one ordered event and replays it without subscriber feedback", () => {
    const bus = new ScientificCursorBus();
    const seen: number[] = [];
    const unsubscribe = bus.subscribe(cursor => seen.push(cursor.sequence));
    bus.publish({ runId: "qwz", resultSha256: hash, datasetId: "k-grid",
      reciprocalPoint: { k: [0, 0], basisId: "qwz:rad/a", sampleIndex: 0 }, originViewId: "bands" });
    unsubscribe();
    bus.subscribe(cursor => seen.push(cursor.sequence));
    expect(seen).toEqual([1, 1]);
    expect(bus.snapshot()?.originViewId).toBe("bands");
  });
  it("requires aligned physical k coordinates and source identity", () => {
    const cursor = new ScientificCursorBus().publish({ runId: "qwz", resultSha256: hash, datasetId: "k-grid",
      reciprocalPoint: { k: [0.2, -0.4], basisId: "qwz:rad/a", sampleIndex: 12 }, originViewId: "bands" });
    const target = { runId: "qwz", resultSha256: hash, basisId: "qwz:rad/a", sampleCount: 441,
      sample: { index: 12, k: [0.2, -0.4] as [number, number] } };
    expect(projectQwzCursor(cursor, target)).toEqual({ status: "matched", value: 12 });
    expect(projectQwzCursor(cursor, { ...target, sample: { index: 12, k: [0.3, -0.4] } }).status).toBe("mismatched-grid");
    expect(projectQwzCursor(cursor, { ...target, basisId: "different" }).status).toBe("incompatible-source");
  });
  it("projects hydrogen coordinates to exact samples and exposes ambiguity", () => {
    const cursor = new ScientificCursorBus().publish({ runId: "hydrogen", resultSha256: hash, datasetId: "psi",
      spatialPoint: { xyz: [0, 1.6, 3.2], coordinateSystemId: "field-grid" }, originViewId: "slice-z" });
    const target = { runId: "hydrogen", resultSha256: hash, coordinateSystemId: "field-grid",
      shape: [21, 21, 21] as [number, number, number], origin: [-16, -16, -16] as [number, number, number],
      spacing: [1.6, 1.6, 1.6] as [number, number, number] };
    expect(projectSpatialCursor(cursor, target)).toEqual({ status: "matched", value: [10, 11, 12] });
    expect(projectSpatialCursor({ ...cursor, spatialPoint: { xyz: [0.8, 1.6, 3.2], coordinateSystemId: "field-grid" } }, target).status)
      .toBe("ambiguous");
    expect(projectSpatialCursor(cursor, { ...target, spacing: [2, 2, 2] }).status).toBe("mismatched-grid");
  });
  it("projects QWZ vertex k to the independently verified curvature cell grid", async () => {
    const bands = await importQuantumSceneBundle(fileURLToPath(new URL(
      "../../../tests/fixtures/quantum-scene/run-97a132d1d712414bb62bb8c9212f517e-bands.qscene", import.meta.url)));
    const curvature = await importQuantumSceneBundle(fileURLToPath(new URL(
      "../../../tests/fixtures/quantum-scene/run-97a132d1d712414bb62bb8c9212f517e.qscene", import.meta.url)));
    const vertex = bands.arrays.get(bands.source.bands!.coordinates)!;
    const projected = projectVerifiedQwzCursor(curvature, { fingerprint: "a".repeat(64),
      runId: bands.source.provenance.runId, resultSha256: bands.source.provenance.resultSha256,
      k: [vertex[0], vertex[1]], basisId: `qwz:${bands.source.coordinates.units[0]}` });
    expect(projected.target).toBe("curvature");
    expect(projected.candidateCount).toBeGreaterThanOrEqual(1);
    expect(projected.distance).toBeGreaterThan(0);
    expect(projected.strategy).toBe("nearest-lowest-index");
    expect(() => projectVerifiedQwzCursor(curvature, { fingerprint: "a".repeat(64),
      runId: "other", resultSha256: bands.source.provenance.resultSha256,
      k: [vertex[0], vertex[1]], basisId: `qwz:${bands.source.coordinates.units[0]}` })).toThrow();
  });
});
