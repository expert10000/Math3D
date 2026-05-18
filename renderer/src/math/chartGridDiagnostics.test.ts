import { describe, expect, it } from "vitest";
import {
  buildChartCellId,
  computeChartGridDiagnostics,
} from "./chartGridDiagnostics";

describe("chartGridDiagnostics", () => {
  it("builds stable cell ids", () => {
    expect(buildChartCellId(2, 5)).toBe("2:5");
  });

  it("computes seam/invalid/masked counts", () => {
    const diagnostics = computeChartGridDiagnostics({
      cells: [
        { id: "0:0", area: 1, seamU: true, seamV: true },
        { id: "1:0", area: 2, seamU: false, seamV: true },
        { id: "2:0", area: 3, seamU: true, seamV: false },
      ],
      maskedIds: new Set(["1:0"]),
      skippedNonFinite: 2,
      skippedDegenerate: 1,
    });

    expect(diagnostics.validCells).toBe(3);
    expect(diagnostics.seamUCells).toBe(2);
    expect(diagnostics.seamVCells).toBe(2);
    expect(diagnostics.maskedCells).toBe(1);
    expect(diagnostics.invalidCells).toBe(4);
    expect(diagnostics.minArea).toBe(1);
    expect(diagnostics.maxArea).toBe(3);
    expect(diagnostics.avgArea).toBe(2);
  });
});
