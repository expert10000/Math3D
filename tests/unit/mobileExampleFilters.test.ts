import { describe, expect, it } from "vitest";
import { mobileExamples } from "../../apps/mobile/src/data/mobileSeedData";
import { filterMobileExamples, mobileExampleIsAvailable } from "../../apps/mobile/src/models/mobileExampleCatalog";

const filters = (overrides: Partial<Parameters<typeof filterMobileExamples>[1]> = {}) => ({
  query: "",
  category: "all" as const,
  capability: "all" as const,
  availableCapabilities: [],
  ...overrides,
});

describe("mobile example filters", () => {
  it("searches titles, descriptions, categories, surface types, and learn topics", () => {
    expect(filterMobileExamples(mobileExamples, filters({ query: "Gaussian curvature" })).map((item) => item.id)).toEqual(["graph-saddle"]);
    expect(filterMobileExamples(mobileExamples, filters({ query: "parametric" })).every((item) => item.surfaceType === "parametric")).toBe(true);
  });

  it("combines category and offline capability filters", () => {
    const results = filterMobileExamples(mobileExamples, filters({ category: "minimal", capability: "offline" }));
    expect(results.map((item) => item.id)).toEqual(["catenoid", "helicoid", "enneper"]);
  });

  it("uses negotiated capabilities for ready-now results", () => {
    const sphere = mobileExamples.find((item) => item.id === "sphere")!;
    expect(mobileExampleIsAvailable(sphere, [])).toBe(false);
    expect(mobileExampleIsAvailable(sphere, ["vtk.preview-implicit"])).toBe(true);
    expect(filterMobileExamples(mobileExamples, filters({ capability: "ready" }))).not.toContainEqual(sphere);
    expect(filterMobileExamples(mobileExamples, filters({ capability: "vtk.preview-implicit" })).every((item) => item.surfaceType === "implicit")).toBe(true);
  });
});
