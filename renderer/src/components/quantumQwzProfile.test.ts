import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { qwzSceneRole, reviewedQwzPair } from "./quantumQwzProfile";
import type { QuantumSceneOpenResponse } from "./QuantumScenePreview";

type Opened = Extract<QuantumSceneOpenResponse, { ok: true }>;
const fixture = (suffix: string, fingerprint: string): Opened => {
  const scene = JSON.parse(readFileSync(resolve(__dirname, "../../../tests/fixtures/quantum-scene",
    `run-97a132d1d712414bb62bb8c9212f517e${suffix}.qscene/scene.json`), "utf8"));
  return { ok: true, canceled: false, directory: suffix, reference: { directory: suffix, sceneFingerprint: fingerprint },
    document: { title: scene.title, geometry: {}, cameras: [], extensions: { "quantum-scene/v1": { scene } } },
    remembered: false, mappedObjectIds: [], deferredObjectIds: [], deferredFieldIds: [] } as Opened;
};

describe("M3D-Q08 source-backed QWZ profile", () => {
  it("links only the two supplied views of the same exact numerical result", () => {
    const bands = fixture("-bands", "bands"), curvature = fixture("", "curvature");
    expect(qwzSceneRole(bands)).toBe("bands");
    expect(qwzSceneRole(curvature)).toBe("curvature");
    const study = reviewedQwzPair(bands, curvature);
    expect(study.resultSha256).toBe("abbcae23a0bb3fe113205cab2ffd769c8c22c79f83cd4369215aba24328d9713");
    expect(study.bandLabels).toEqual(["Lower band", "Upper band"]);
    expect(study.bulkGap).toBe(2);
    expect(study.curvature[0]).toMatchObject({ dataset: "curvature", label: "Lower-band Berry curvature" });
    expect(study.invariants[0]).toMatchObject({ label: "Chern number", value: -1, status: "verified" });
    const reordered = (curvature.document.extensions["quantum-scene/v1"] as { scene: any }).scene.provenance.parameters;
    (curvature.document.extensions["quantum-scene/v1"] as { scene: any }).scene.provenance.parameters =
      Object.fromEntries(Object.entries(reordered).reverse());
    expect(reviewedQwzPair(bands, curvature).runId).toBe(study.runId);
  });

  it("refuses role, run, hash and parameter mismatch instead of inferring a relationship", () => {
    const bands = fixture("-bands", "bands"), curvature = fixture("", "curvature");
    expect(() => reviewedQwzPair(curvature, bands)).toThrow(/requires supplied/i);
    const scene = (curvature.document.extensions["quantum-scene/v1"] as { scene: any }).scene;
    scene.provenance.runId = "other-run";
    expect(() => reviewedQwzPair(bands, curvature)).toThrow(/same exact source/i);
    scene.provenance.runId = (bands.document.extensions["quantum-scene/v1"] as { scene: any }).scene.provenance.runId;
    scene.provenance.resultSha256 = "0".repeat(64);
    expect(() => reviewedQwzPair(bands, curvature)).toThrow(/same exact source/i);
    scene.provenance.resultSha256 = (bands.document.extensions["quantum-scene/v1"] as { scene: any }).scene.provenance.resultSha256;
    scene.provenance.parameters.mass = 1;
    expect(() => reviewedQwzPair(bands, curvature)).toThrow(/same exact source/i);
  });
});
