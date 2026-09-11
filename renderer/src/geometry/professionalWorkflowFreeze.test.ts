import { describe, expect, it } from "vitest";
import {
  GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE,
  validateGeometryProfessionalWorkflowFreeze,
} from "./professionalWorkflowFreeze";

describe("Geometry professional workflow freeze", () => {
  it("freezes the seven accepted end-to-end journeys", () => {
    expect(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.journeys.map((entry) => entry.id)).toEqual([
      "construct-inspect-analyze",
      "modify-compare",
      "validate-repair",
      "geometry-mesh-compare",
      "mesh-open-geometry",
      "saved-result-stale",
      "workspace-roundtrip",
    ]);
  });

  it("freezes distinct left, center, and right responsibilities", () => {
    expect(Object.keys(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.regions)).toEqual(["left", "center", "right"]);
    expect(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.regions.left).toContain("Choose");
    expect(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.regions.center).toContain("scene");
    expect(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.regions.right).toContain("provenance");
  });

  it("records additive legacy-entry decisions without silently removing controls", () => {
    expect(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.decisions.modeStrip).toBe("retained-secondary-navigation");
    expect(GEOMETRY_PROFESSIONAL_WORKFLOW_FREEZE.decisions.duplicateControls).toContain("retained");
  });

  it("validates frozen journeys and entry-point reachability", () => {
    expect(validateGeometryProfessionalWorkflowFreeze()).toEqual({ ok: true, errors: [] });
  });
});
