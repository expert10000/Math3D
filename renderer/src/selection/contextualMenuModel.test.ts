import { describe, expect, it } from "vitest";
import { contextualSelectionMenuTitle, formatContextualSelectionBreadcrumb } from "./contextualMenuModel";

describe("contextualMenuModel", () => {
  it("formats full object-to-topology breadcrumbs", () => {
    expect(
      formatContextualSelectionBreadcrumb({
        workspace: "geometry",
        targetMode: "edge",
        objectLabel: "Box A",
        entityLabel: "Edge 2-5",
      })
    ).toBe("Geometry > Object: Box A > Edge 2-5");
    expect(
      formatContextualSelectionBreadcrumb({
        workspace: "mesh",
        targetMode: "face",
        objectLabel: "Wavy torus",
        entityLabel: 12,
      })
    ).toBe("Mesh > Object: Wavy torus > Face 12");
  });

  it("keeps object-level breadcrumbs compact", () => {
    expect(
      formatContextualSelectionBreadcrumb({
        workspace: "geometry",
        targetMode: "object",
        objectLabel: "Sphere",
        entityLabel: "Face 4",
      })
    ).toBe("Geometry > Object: Sphere");
  });

  it("labels context menus by workspace and target", () => {
    expect(contextualSelectionMenuTitle("mesh", "vertex")).toBe("Mesh Vertex menu");
  });
});
