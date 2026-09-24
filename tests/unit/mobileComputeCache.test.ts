import { describe, expect, it } from "vitest";
import {
  createMobileComputeCacheKey,
  isMobileComputeCacheStale,
  mobileComputeCacheMatchesLookup,
  type MobileComputeCacheProvenance,
} from "../../apps/mobile/src/models/mobileComputeCache";

const provenance: MobileComputeCacheProvenance = {
  operation: "vtk.preview-implicit",
  inputHash: "formula-and-resolution",
  sceneId: "scene-a",
  sceneSchemaVersion: 1,
  engine: { id: "math3d-python-worker", version: "1.0.0" },
  computedAt: 100,
  resolution: 72,
  serverVersion: "1.5.1",
};

describe("mobile compute cache identity", () => {
  it("changes the key for operation inputs scene schema and engine identity", () => {
    const base = createMobileComputeCacheKey(provenance);
    expect(createMobileComputeCacheKey({ ...provenance, inputHash: "other" })).not.toBe(base);
    expect(createMobileComputeCacheKey({ ...provenance, sceneSchemaVersion: 2 })).not.toBe(base);
    expect(createMobileComputeCacheKey({ ...provenance, engine: { ...provenance.engine, version: "2.0.0" } })).not.toBe(base);
  });

  it("matches input provenance independently and marks another engine stale", () => {
    expect(mobileComputeCacheMatchesLookup(provenance, {
      operation: provenance.operation,
      inputHash: provenance.inputHash,
      sceneId: provenance.sceneId,
      sceneSchemaVersion: provenance.sceneSchemaVersion,
    })).toBe(true);
    expect(isMobileComputeCacheStale(provenance, provenance.engine)).toBe(false);
    expect(isMobileComputeCacheStale(provenance, { id: provenance.engine.id, version: "2.0.0" })).toBe(true);
  });
});
