import { describe, expect, it } from "vitest";
import { quantumSceneValidation } from "./quantumSceneValidation";

describe("verified scene validation dashboard", () => {
  it("reports producer invariant status and refuses unsupported physical claims", () => {
    const checks = quantumSceneValidation({ datasets: [{ id: "bands" }], objects: [{ id: "band-0" }],
      topology: { invariants: [{ label: "Chern", value: null, status: "gap-closed", method: "FHS" }],
        limitations: ["Gap closure prevents an occupied-band invariant."] } },
    { fingerprint: "a".repeat(64), mappedObjectIds: ["band-0"], deferredObjectIds: [], deferredFieldIds: [] });
    expect(checks.find(check => check.name === "Chern")?.status).toBe("warning");
    expect(checks.find(check => check.name === "Hermiticity")?.status).toBe("unavailable");
    expect(checks.find(check => check.name === "Source warning")?.detail).toContain("Gap closure");
  });
});
