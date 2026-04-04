import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";

describe("buildQuotientPipeline", () => {
  it("builds the canonical dunce-cap quotient", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("dunce_cap");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    expect(result.quotient.vertices).toHaveLength(1);
    expect(result.quotient.edges).toHaveLength(1);
    expect(result.quotient.faces).toHaveLength(1);
    expect(result.quotient.invariants?.eulerCharacteristic).toBe(1);
    expect(result.quotient.attachmentMap[result.quotient.faces[0].attachmentId]?.boundaryWord).toContain("a");
  });

  it("triangulates non-triangular faces before quotienting", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("torus_square");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    expect(result.normalizedDiagram.faces).toHaveLength(1);
    expect(result.subdivision.applied).toBe(true);
    expect(result.subdivision.triangulatedFaceIds).toContain("f0");
    expect(result.subdivision.createdEdgeIds.length).toBeGreaterThan(0);
    expect(result.subdividedDiagram.faces.length).toBeGreaterThan(1);
  });

  it("adds smooth and cut-open torus realizations for torus-square quotient", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("torus_square");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    const realizationIds = result.realizations.map((entry) => entry.id);
    expect(realizationIds.some((id) => id.endsWith("/realization/torus-smooth"))).toBe(true);
    expect(realizationIds.some((id) => id.endsWith("/realization/torus-cut-open"))).toBe(true);
  });

  it("adds smooth and cut-open Mobius realizations for mobius rectangle preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("mobius_from_rectangle");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    const realizationIds = result.realizations.map((entry) => entry.id);
    expect(realizationIds.some((id) => id.endsWith("/realization/mobius-smooth"))).toBe(true);
    expect(realizationIds.some((id) => id.endsWith("/realization/mobius-cut-open"))).toBe(true);
  });

  it("adds immersed projective-plane realization for projective plane preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("projective_plane");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    const realizationIds = result.realizations.map((entry) => entry.id);
    const projectiveRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/projective-immersed"));
    expect(projectiveRealization).toBeTruthy();
    expect(projectiveRealization?.name).toContain("RP^2");
    expect(realizationIds.some((id) => id.endsWith("/realization/torus-smooth"))).toBe(false);
    expect(result.quotient.invariants?.eulerCharacteristic).toBe(1);
  });

  it("adds immersed Klein bottle realization for klein-bottle preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("klein_bottle_square");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    const realizationIds = result.realizations.map((entry) => entry.id);
    const kleinRealization = result.realizations.find((entry) => entry.id.endsWith("/realization/klein-immersed"));
    expect(kleinRealization).toBeTruthy();
    expect(kleinRealization?.name.toLowerCase()).toContain("klein");
    expect(realizationIds.some((id) => id.endsWith("/realization/torus-smooth"))).toBe(false);
  });

  it("adds smooth cylinder realization for cylinder preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("cylinder");
    expect(preset).toBeTruthy();
    const result = buildQuotientPipeline(preset!.buildDiagram());
    expect(result.realizations.some((entry) => entry.id.endsWith("/realization/cylinder-smooth"))).toBe(true);
  });

  it("adds smooth cone realization for cone preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("cone");
    expect(preset).toBeTruthy();
    const result = buildQuotientPipeline(preset!.buildDiagram());
    expect(result.realizations.some((entry) => entry.id.endsWith("/realization/cone-smooth"))).toBe(true);
  });

  it("adds smooth sphere realization for sphere-boundary preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("sphere_boundary_contraction");
    expect(preset).toBeTruthy();
    const result = buildQuotientPipeline(preset!.buildDiagram());
    expect(result.realizations.some((entry) => entry.id.endsWith("/realization/sphere-smooth"))).toBe(true);
  });

  it("adds suspension bicone realization for suspension preset", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("suspension");
    expect(preset).toBeTruthy();
    const result = buildQuotientPipeline(preset!.buildDiagram());
    expect(result.realizations.some((entry) => entry.id.endsWith("/realization/suspension-bicone"))).toBe(true);
  });

  it("treats unpaired source edges as boundary info, not warnings", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("mobius_from_rectangle");
    expect(preset).toBeTruthy();
    const diagram = preset!.buildDiagram();
    const result = buildQuotientPipeline(diagram);

    const boundaryInfos = result.warnings.filter((w) => w.code === "equivalence/boundary-edge-retained");
    expect(boundaryInfos.length).toBeGreaterThan(0);
    expect(boundaryInfos.every((w) => w.level === "info")).toBe(true);
    expect(result.warnings.some((w) => w.code === "equivalence/unpaired-edge")).toBe(false);
  });
});
