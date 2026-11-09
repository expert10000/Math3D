import { describe, expect, it } from "vitest";
import { presentMeshVisualReadout } from "./meshVisualReadout";
import type { MeshResultEvidencePresentation } from "./meshResultPresentation";

const evidence = (status: MeshResultEvidencePresentation["status"]): MeshResultEvidencePresentation => ({
  status, reason: `${status} reason`, claim: "", independentCheck: "", source: "mesh",
});

describe("Mesh floating readout qualification", () => {
  it("shows only the current focused field", () => {
    expect(presentMeshVisualReadout("mesh-quality", evidence("current"))).toMatchObject({ canShowQuality: true, canShowCurvature: false });
    expect(presentMeshVisualReadout("differential-geometry", evidence("current"))).toMatchObject({ canShowQuality: false, canShowCurvature: true });
    expect(presentMeshVisualReadout("chart-analysis", evidence("session-local"))).toMatchObject({ canShowCurvature: true, label: "Session-local values" });
    expect(presentMeshVisualReadout("diagnostics", evidence("current"))).toMatchObject({ canShowQuality: false, canShowCurvature: false });
  });

  it("withholds both numerical overlays when the result is historical, computing or unavailable", () => {
    for (const status of ["historical", "computing", "failed", "unavailable"] as const) {
      expect(presentMeshVisualReadout("mesh-quality", evidence(status))).toMatchObject({ canShowQuality: false, label: "Values withheld" });
      expect(presentMeshVisualReadout("differential-geometry", evidence(status))).toMatchObject({ canShowCurvature: false, reason: `${status} reason` });
    }
  });
});
