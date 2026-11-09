import { describe, expect, it } from "vitest";
import { ANALYSIS_RESULT_STATUSES, presentAnalysisResultClaim } from "@math3d/core";

describe("saved result claims", () => {
  it("keeps producer certainty separate from independent verification", () => {
    for (const status of ANALYSIS_RESULT_STATUSES) {
      const claim = presentAnalysisResultClaim(status);
      expect(claim.label).toBeTruthy();
      expect(claim.meaning).toBeTruthy();
      expect(claim.meaning).not.toMatch(/verified by Project/i);
    }
    expect(presentAnalysisResultClaim("exact").label).toMatch(/^Recorded /);
    expect(presentAnalysisResultClaim("certified").meaning).toMatch(/does not independently verify/);
    expect(presentAnalysisResultClaim("numerical").meaning).toMatch(/approximation/);
  });

  it("does not describe unsupported, failed or cancelled work as a result", () => {
    for (const status of ["unsupported", "failed", "cancelled"] as const)
      expect(presentAnalysisResultClaim(status).outcome).toBe("none");
  });
});
