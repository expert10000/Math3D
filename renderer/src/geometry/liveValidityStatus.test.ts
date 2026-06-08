import { describe, expect, it } from "vitest";
import { getGeometryLiveValidityMeta } from "./liveValidityStatus";

describe("geometry live validity status", () => {
  it("maps evaluator outcomes to clear user-facing states", () => {
    expect(getGeometryLiveValidityMeta("valid", null).kind).toBe("valid");
    expect(getGeometryLiveValidityMeta("invalid", "Normal needs a surface object and a point object.").kind).toBe(
      "needs-point"
    );
    expect(getGeometryLiveValidityMeta("broken-source", "Midpoint source is unavailable.").kind).toBe(
      "missing-source"
    );
    expect(getGeometryLiveValidityMeta("invalid", "Construction dependency cycle detected.").kind).toBe(
      "broken-dependency"
    );
  });

  it("uses the requested labels and green-yellow-orange-red colors", () => {
    expect(getGeometryLiveValidityMeta("valid").label).toBe("Valid");
    expect(getGeometryLiveValidityMeta("invalid", "Needs a point.").label).toBe("Needs point");
    expect(getGeometryLiveValidityMeta("broken-source").label).toBe("Missing source");
    expect(getGeometryLiveValidityMeta("invalid").label).toBe("Broken dependency");

    expect(getGeometryLiveValidityMeta("valid").color).toBe("#16a34a");
    expect(getGeometryLiveValidityMeta("invalid", "Needs a point.").color).toBe("#ca8a04");
    expect(getGeometryLiveValidityMeta("broken-source").color).toBe("#ea580c");
    expect(getGeometryLiveValidityMeta("invalid").color).toBe("#dc2626");
  });
});
