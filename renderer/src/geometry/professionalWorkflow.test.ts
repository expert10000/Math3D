import { describe, expect, it } from "vitest";
import {
  GEOMETRY_PROFESSIONAL_ACTIONS,
  GEOMETRY_PROFESSIONAL_EXPANDED_GROUPS,
  GEOMETRY_PROFESSIONAL_PANELS,
  GEOMETRY_PROFESSIONAL_TOOLS,
  geometryProfessionalActiveIds,
  type GeometryProfessionalDestination,
} from "./professionalWorkflow";

describe("Geometry professional workflow", () => {
  it("exposes the planned panels, actions, and tool groups", () => {
    expect(GEOMETRY_PROFESSIONAL_PANELS.map((entry) => entry.label)).toEqual([
      "Scene",
      "Object",
      "View",
      "Analysis",
      "Services",
      "Theory",
    ]);
    expect(GEOMETRY_PROFESSIONAL_ACTIONS.map((entry) => entry.label)).toEqual([
      "Gallery",
      "New",
      "Demo",
      "Compare",
      "More",
    ]);
    expect(GEOMETRY_PROFESSIONAL_TOOLS.map((entry) => entry.label)).toEqual([
      "Construct",
      "Modify",
      "Analyze",
      "Navigate",
    ]);
  });

  it("keeps every existing Geometry workspace and Scene Script reachable", () => {
    const destinations = GEOMETRY_PROFESSIONAL_EXPANDED_GROUPS.flatMap((group) => group.entries)
      .map((entry) => entry.destination as GeometryProfessionalDestination);
    const modes = destinations.flatMap((destination) => destination.kind === "mode" ? [destination.mode] : []);
    const panels = destinations.flatMap((destination) => destination.kind === "procedural-panel" ? [destination.panel] : []);

    expect(new Set(modes)).toEqual(new Set(["procedural", "demo", "scratch", "workbook"]));
    expect(panels).toContain("script");
    expect(panels).toContain("history");
    expect(panels).toContain("debug");
  });

  it("derives active shell state from the existing mode and panel state", () => {
    expect(geometryProfessionalActiveIds("procedural", "construct")).toEqual({
      panel: null,
      action: null,
      tool: "construct",
    });
    expect(geometryProfessionalActiveIds("procedural", "analysis")).toEqual({
      panel: "analysis",
      action: "compare",
      tool: "analyze",
    });
    expect(geometryProfessionalActiveIds("scratch", "create")).toEqual({
      panel: null,
      action: "new",
      tool: null,
    });
  });
});
