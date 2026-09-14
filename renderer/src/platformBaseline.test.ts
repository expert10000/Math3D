import { describe, expect, it } from "vitest";
import manifest from "../../tests/fixtures/platform-v1.5.0/baseline-manifest.json";

describe("v1.5.0 platform baseline manifest", () => {
  it("keeps every suite owned, classified, and linked to a fixture or test", () => {
    expect(manifest.baselineId).toBe("platform-v1.5.0");
    expect(manifest.releaseTag).toBe("v1.5.0");
    expect(manifest.releaseCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.compatibilityBoundary).toContain("No production code");

    const ids = manifest.suites.map((suite) => suite.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const suite of manifest.suites) {
      expect(suite.owner.length).toBeGreaterThan(0);
      expect(["exact", "numerical", "illustrative"]).toContain(suite.oracle);
      expect("fixture" in suite || "test" in suite).toBe(true);
      expect(suite.preserves.length).toBeGreaterThan(0);
    }
  });

  it("explicitly excludes transient renderer state from scientific authority", () => {
    expect(manifest.excludedTransientState).toEqual(
      expect.arrayContaining(["timestamps", "camera and hover state", "animation phase", "screenshot pixels"])
    );
  });
});
