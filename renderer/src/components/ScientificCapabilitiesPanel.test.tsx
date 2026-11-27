import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCIENTIFIC_MODULES } from "@math3d/core";
import { ScientificCapabilitiesPanel, scientificCapabilityGroups } from "./ScientificCapabilitiesPanel";

describe("module scientific capabilities", () => {
  it("offers discovery for every scientific module while requiring a host binding to run", () => {
    for (const module of SCIENTIFIC_MODULES) {
      const groups = scientificCapabilityGroups(module, "browser", []);
      expect(groups.available).toHaveLength(0);
      expect(groups.registered.length + groups.planned.length).toBeGreaterThan(0);
    }
    const surfaces = scientificCapabilityGroups("surface", "browser", ["math3d.surface.curvature-field"]);
    expect(surfaces.available.map(operation => operation.id)).toContain("surface.curvature.compute");
    expect(surfaces.registered.some(capability => capability.id === "surface.curvature.gaussian")).toBe(false);
    expect(scientificCapabilityGroups("surface", "mobile", ["math3d.surface.curvature-field"]).available)
      .toHaveLength(0);
  });

  it("shows the selected module, all module choices, and a working operation route", () => {
    const html = renderToStaticMarkup(<ScientificCapabilitiesPanel initialModule="surface"
      environment="browser" implementations={["math3d.surface.curvature-field"]}
      onOpenOperation={() => {}} onClose={() => {}} />);
    expect(html).toContain("scientific-capabilities-panel");
    expect(html).toContain("Compute Surface curvature field");
    expect(html).toContain("Open computation");
    expect((html.match(/<option/g) ?? []).length).toBe(SCIENTIFIC_MODULES.length);
    expect(html).toContain("Graph 3D");
    expect(html).toContain("Quantum");
  });
});
