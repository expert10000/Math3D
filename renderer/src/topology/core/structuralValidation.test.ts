import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESETS } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import { validateCanonicalTopologyObject } from "./structuralValidation";

describe("canonical 2-complex structural validation", () => {
  it("certifies every shipped preset within the finite canonical model", () => {
    for (const preset of TOPOLOGY_PRESETS) {
      const result = buildQuotientPipeline(preset.buildDiagram());
      expect(
        result.structuralValidation.status,
        `${preset.id}: ${JSON.stringify(result.structuralValidation.diagnostics)}`
      ).toBe("certified-within-model");
      expect(result.structuralValidation.value?.structurallyValid, preset.id).toBe(true);
      expect(result.structuralValidation.sourceRevision, preset.id).toBe(
        result.topologyObject.provenance.source.revision
      );
    }
  });

  it("returns focused errors for dangling endpoints and attachments", () => {
    const built = buildQuotientPipeline(TOPOLOGY_PRESETS[0].buildDiagram());
    const object = structuredClone(built.topologyObject);
    object.canonical.edges[0].endpoints[0] = "missing-vertex";
    object.canonical.faces[0].attachment.push({ edgeId: "missing-edge", direction: 1 });

    const result = validateCanonicalTopologyObject(object);

    expect(result.status).toBe("failed");
    expect(result.value?.canComputeCellularAlgebra).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "edge/dangling-endpoint", cellRef: { dimension: 1, cellId: object.canonical.edges[0].id } }),
        expect.objectContaining({ code: "attachment/dangling-edge", cellRef: { dimension: 2, cellId: object.canonical.faces[0].id } }),
      ])
    );
  });

  it("detects duplicate cells, source-map mismatches, incidence drift, and open walks", () => {
    const built = buildQuotientPipeline(TOPOLOGY_PRESETS[0].buildDiagram());
    const object = structuredClone(built.topologyObject);
    const vertex = object.canonical.vertices[0];
    const edge = object.canonical.edges[0];
    const face = object.canonical.faces[0];
    object.canonical.vertices.push(structuredClone(vertex));
    edge.sourceRefs[0].dimension = 0;
    object.canonical.incidences.vertexToEdges[vertex.id] = [];
    face.attachment = [];

    const result = validateCanonicalTopologyObject(object);
    const codes = result.diagnostics.map((entry) => entry.code);

    expect(result.status).toBe("failed");
    expect(codes).toContain("cells/duplicate-id");
    expect(codes).toContain("source-map/dimension-mismatch");
    expect(codes).toContain("incidence/vertex-edge-mismatch");
    expect(codes.some((code) => code === "attachment/non-contiguous" || code === "attachment/empty")).toBe(true);
  });

  it("reports boundary and unsupported link candidates without rejecting general CW algebra", () => {
    const built = buildQuotientPipeline(TOPOLOGY_PRESETS[0].buildDiagram());
    const report = built.structuralValidation.value;

    expect(report?.edgeLinks.length).toBe(built.topologyObject.canonical.edges.length);
    expect(report?.expectedBoundaryOperatorDimensions.boundary1).toEqual([
      built.topologyObject.canonical.vertices.length,
      built.topologyObject.canonical.edges.length,
    ]);
    expect(report?.expectedBoundaryOperatorDimensions.boundary2).toEqual([
      built.topologyObject.canonical.edges.length,
      built.topologyObject.canonical.faces.length,
    ]);
  });
});
