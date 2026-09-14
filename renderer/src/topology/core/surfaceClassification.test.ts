import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESETS } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import type { CWComplexInput, TopologyObject } from "./contracts";
import { buildExactCellularBoundaryOperators } from "./cellularBoundary";
import { computeExactHomology } from "./homology";
import { computeEulerHomologyConsistency } from "./algebraicConsistency";
import { certifyAndClassifySurface } from "./surfaceClassification";
import { validateCanonicalTopologyObject } from "./structuralValidation";

const buildPreset = (id: string) =>
  buildQuotientPipeline(TOPOLOGY_PRESETS.find((preset) => preset.id === id)!.buildDiagram());

describe("finite surface eligibility and classification", () => {
  it.each([
    ["torus_square", true, 0, "Torus (orientable genus 1)"],
    ["cylinder", true, 2, "Cylinder / annulus (orientable genus 0, boundary 2)"],
    ["mobius_from_rectangle", false, 1, "Möbius band (non-orientable crosscap 1, boundary 1)"],
    ["projective_plane", false, 0, "Projective plane (non-orientable crosscap 1)"],
    ["klein_bottle_square", false, 0, "Klein bottle (non-orientable crosscap 2)"],
  ])("certifies and classifies %s from canonical incidence", (presetId, orientable, boundaryComponents, label) => {
    const result = buildPreset(presetId as string);
    const report = result.surfaceClassification;
    expect(report.status).toBe("certified-within-model");
    expect(report.value?.eligible).toBe(true);
    expect(report.value?.orientability?.orientable).toBe(orientable);
    expect(report.value?.boundaryComponents).toBe(boundaryComponents);
    expect(report.value?.classification?.label).toBe(label);
    expect(report.value?.eligibilityChecks.every((check) => check.holds)).toBe(true);
  });

  it.each(["dunce_cap", "dunce_map", "cone", "sphere_boundary_contraction"])(
    "withholds a formal surface name for singular preset %s",
    (presetId) => {
      const result = buildPreset(presetId);
      expect(result.surfaceClassification.status).toBe("certified-within-model");
      expect(result.surfaceClassification.value?.eligible).toBe(false);
      expect(result.surfaceClassification.value?.classification).toBeNull();
      expect(result.surfaceClassification.diagnostics.length).toBeGreaterThan(0);
    }
  );

  it("classifies an independently authored two-cell sphere", () => {
    const source: CWComplexInput = {
      id: "fixture/sphere-source",
      name: "Two-bigon sphere source",
      vertices: [{ id: "v0" }, { id: "v1" }],
      edges: [
        { id: "a", endpoints: ["v0", "v1"] },
        { id: "b", endpoints: ["v0", "v1"] },
      ],
      faces: [
        { id: "north", attachment: [{ edgeId: "a", direction: 1 }, { edgeId: "b", direction: -1 }] },
        { id: "south", attachment: [{ edgeId: "b", direction: 1 }, { edgeId: "a", direction: -1 }] },
      ],
    };
    const seed = buildPreset("torus_square").topologyObject;
    const object: TopologyObject = {
      ...seed,
      id: "fixture/sphere",
      name: "Two-bigon sphere",
      source: { kind: "cw-complex", value: source },
      canonical: {
        schemaVersion: 1,
        dimension: 2,
        id: "fixture/sphere/canonical",
        name: "Two-bigon sphere",
        vertices: source.vertices.map((cell) => ({ id: cell.id, name: cell.id, sourceRefs: [{ stage: "source", dimension: 0, cellId: cell.id }] })),
        edges: source.edges.map((cell) => ({ id: cell.id, name: cell.id, endpoints: cell.endpoints, sourceRefs: [{ stage: "source", dimension: 1, cellId: cell.id }] })),
        faces: source.faces.map((cell) => ({ id: cell.id, name: cell.id, attachment: cell.attachment, boundaryWord: cell.attachment.map((entry) => `${entry.edgeId}${entry.direction < 0 ? "^-1" : ""}`).join(" "), sourceRefs: [{ stage: "source", dimension: 2, cellId: cell.id }] })),
        incidences: { vertexToEdges: { v0: ["a", "b"], v1: ["a", "b"] }, edgeToFaces: { a: ["north", "south"], b: ["north", "south"] } },
      },
      provenance: {
        ...seed.provenance,
        source: { ...seed.provenance.source, kind: "cw-complex", revision: "fixture-sphere-r1" },
      },
      analysis: {},
      realizations: [],
    };
    const structural = validateCanonicalTopologyObject(object);
    const boundaries = buildExactCellularBoundaryOperators(object, structural);
    const homology = computeExactHomology(object, boundaries);
    const algebra = computeEulerHomologyConsistency(object, homology);
    const result = certifyAndClassifySurface(object, structural, algebra);

    expect(structural.status).toBe("certified-within-model");
    expect(homology.value?.integer.groups.map((group) => group.notation)).toEqual(["Z", "0", "Z"]);
    expect(result.value?.classification).toMatchObject({ family: "orientable", genus: 0, label: "Sphere (orientable genus 0)" });
  });

  it("retains cell-focused reasons when eligibility fails", () => {
    const result = buildPreset("dunce_cap");
    const failedEdge = result.surfaceClassification.value?.eligibilityChecks.find((check) => check.id === "edge-links");
    expect(failedEdge?.holds).toBe(false);
    expect(failedEdge?.cellRefs[0]?.dimension).toBe(1);
    expect(result.surfaceClassification.value?.classification).toBeNull();
  });
});
