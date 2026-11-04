import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { projectVerifiedHofstadterStudySample } from "../src/main/quantumScene/studySelection";
import type { ImportedQuantumScene } from "../src/main/quantumScene/importer";

const runId = "run", resultSha256 = "a".repeat(64);
const bulk = { source: { provenance: { runId, resultSha256, model: "hofstadter" },
  coordinates: { units: ["rad", "rad", "eV"] }, bands: { objects: ["band-0"] },
  objects: [{ id: "band-0", positions: "points" }] },
  arrays: new Map([["points", Float64Array.from([0, 0.3, 1, 1, 0.3, 2])]]) } as unknown as ImportedQuantumScene;
const strip = { source: { provenance: { runId, resultSha256, model: "hofstadter" },
  coordinates: { units: ["rad", "state", "eV"] }, objects: [{ id: "strip-left", positions: "points" }] },
  arrays: new Map([["points", Float64Array.from([0.3, 0, 1, 0.3, 1, 2, 0.6, 0, 3])]]) } as unknown as ImportedQuantumScene;

describe("Hofstadter study linked selection", () => {
  it("keeps many sorted strip states ambiguous at the shared ky", () => {
    assert.deepEqual(projectVerifiedHofstadterStudySample(bulk, strip, "band-0", 0, "strip-left"),
      { axis: "ky", value: 0.3, unit: "rad", candidateCount: 2, status: "ambiguous", sampleIndex: null });
  });
  it("links a unique ky sample without inferring branch continuity", () => {
    const unique = { ...bulk, arrays: new Map([["points", Float64Array.from([0, 0.6, 1])]]) } as unknown as ImportedQuantumScene;
    assert.equal(projectVerifiedHofstadterStudySample(unique, strip, "band-0", 0, "strip-left").sampleIndex, 2);
  });
  it("rejects changed run identity and out of range indices", () => {
    assert.throws(() => projectVerifiedHofstadterStudySample(bulk, { ...strip,
      source: { ...strip.source, provenance: { ...strip.source.provenance, runId: "different" } } }, "band-0", 0, "strip-left"), /exact saved/);
    assert.throws(() => projectVerifiedHofstadterStudySample(bulk, strip, "band-0", 9, "strip-left"), /outside/);
  });
});
