import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCIENTIFIC_MODULES } from "@math3d/core";
import { ScientificCapabilitiesPanel, scientificCapabilityGroups } from "./ScientificCapabilitiesPanel";
import { DEFAULT_CURVE_ANALYSIS_DEFINITIONS } from "../curveAnalysis/infrastructure";
import { DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS } from "../geometry/analysisInfrastructure";
import { DEFAULT_MESH_ANALYSIS_DEFINITIONS } from "../mesh/analysisRegistry";
import { DEFAULT_SURFACE_ANALYSIS_DEFINITIONS } from "../surfaceAnalysis/infrastructure";

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
    expect(scientificCapabilityGroups("mesh", "browser", ["worker:mesh.normals.compute"]).available
      .map(operation => operation.id)).toContain("mesh.normals.compute");
    expect(scientificCapabilityGroups("surface", "browser", ["math3d.surface.curvature-field"])
      .unavailableOperations.map(operation => operation.id))
      .toContain("surface.curvature.analytic-reference");
    for (const [module, definitions] of [
      ["curve", DEFAULT_CURVE_ANALYSIS_DEFINITIONS],
      ["surface", DEFAULT_SURFACE_ANALYSIS_DEFINITIONS],
      ["mesh", DEFAULT_MESH_ANALYSIS_DEFINITIONS],
      ["geometry", DEFAULT_GEOMETRY_ANALYSIS_DEFINITIONS],
    ] as const) {
      expect(scientificCapabilityGroups(module, "browser", []).workspaceFeatures.map(item => item.title))
        .toEqual(expect.arrayContaining(definitions.map(item => item.label)));
    }
    for (const module of SCIENTIFIC_MODULES.filter(id => id !== "graph3d")) {
      const features = scientificCapabilityGroups(module, "browser", []).workspaceFeatures;
      expect(features.some(item => item.group === "Create")).toBe(true);
      expect(features.some(item => item.group === "View")).toBe(true);
    }
    expect(scientificCapabilityGroups("graph2d", "browser", []).workspaceFeatures)
      .toEqual(expect.arrayContaining([expect.objectContaining({ title: "Roots" })]));
    expect(scientificCapabilityGroups("number-theory", "browser", []).workspaceFeatures.length)
      .toBeGreaterThan(5);
  });

  it("shows the selected module, all module choices, and a working operation route", () => {
    const html = renderToStaticMarkup(<ScientificCapabilitiesPanel initialModule="surface"
      environment="browser" implementations={["math3d.surface.curvature-field"]}
      onOpenOperation={() => {}} onOpenWorkspace={() => {}} onClose={() => {}} />);
    expect(html).toContain("scientific-capabilities-panel");
    expect(html).toContain("Compute Surface curvature field");
    expect(html).toContain("Open computation");
    expect(html).toContain("Surface features");
    expect(html).toContain("Open workspace");
    expect(html).toContain("Create (");
    expect(html).toContain("Analyze (");
    expect((html.match(/<option/g) ?? []).length).toBeGreaterThanOrEqual(SCIENTIFIC_MODULES.length);
    expect(html).toContain("Graph 3D");
    expect(html).toContain("Quantum");
  });

  it("shows the parametric operation editor only with its verified host binding", () => {
    const html = renderToStaticMarkup(<ScientificCapabilitiesPanel initialModule="surface"
      environment="browser" implementations={["math3d.surface.curvature-parametric"]}
      onOpenOperation={() => {}} onOpenWorkspace={() => {}} onClose={() => {}} />);
    expect(html).toContain("parametric-curvature-panel");
    expect(html).toContain("x expression");
    expect(html).toContain("Compute curvature");
  });
});
