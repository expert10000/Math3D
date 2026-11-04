import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { inspectVerifiedTimeFrame } from "../src/main/quantumScene/timeFrame";
import type { ImportedQuantumScene } from "../src/main/quantumScene/importer";

const fixture = { source: { provenance: { runId: "run", resultSha256: "a".repeat(64) },
  time: { axis: "time", unit: "fs", frameIds: ["f0", "f1", "f2"],
    tracks: [{ id: "bloch", object: "trajectory", positions: "bloch" },
      { id: "sigma-z", object: "plot", positions: "plot" }] } },
  arrays: new Map([["time", Float64Array.from([0, 0.3, 1.1])],
    ["bloch", Float64Array.from([0, 0, 1, 0, 1, 0, 1, 0, 0])],
    ["plot", Float64Array.from([0, 1, 0, 0.3, 0, 0, 1.1, -1, 0])]]) } as unknown as ImportedQuantumScene;

describe("typed physical time frames", () => {
  it("resolves Bloch and expectation tracks at the same irregular physical time", () => {
    const frame = inspectVerifiedTimeFrame(fixture, "f1");
    assert.equal(frame.frameId, "f1"); assert.equal(frame.time, 0.3);
    assert.deepEqual(frame.tracks.map(track => track.xyz), [[0, 1, 0], [0.3, 0, 0]]);
  });
  it("refuses unknown frame identities without interpolating", () => {
    assert.throws(() => inspectVerifiedTimeFrame(fixture, "between"), /Unknown frame/);
  });
});
