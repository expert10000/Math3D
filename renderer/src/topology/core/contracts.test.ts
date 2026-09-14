import { describe, expect, it } from "vitest";
import { TOPOLOGY_PRESET_BY_ID } from "../presets";
import { buildQuotientPipeline } from "../quotientBuilder";
import { createTopologyResult, hashTopologyValue } from "./index";

describe("canonical topology contracts", () => {
  it("separates the authoritative source, canonical cells, and realizations", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const result = buildQuotientPipeline(diagram);
    const object = result.topologyObject;

    expect(object.source.kind).toBe("fundamental-diagram");
    expect(object.source.value).not.toBe(diagram);
    expect(object.canonical.schemaVersion).toBe(1);
    expect(object.canonical.dimension).toBe(2);
    expect(object.canonical.vertices).toHaveLength(result.quotient.vertices.length);
    expect(object.canonical.edges.every((edge) => edge.endpoints.length === 2)).toBe(true);
    expect(object.canonical.faces.every((face) => Array.isArray(face.attachment))).toBe(true);
    expect(object.canonical.faces.some((face) => face.sourceRefs.some((ref) => ref.stage === "source"))).toBe(true);
    expect(object.canonical.faces.some((face) => face.sourceRefs.some((ref) => ref.stage === "refinement"))).toBe(true);
    expect(object.realizations).toHaveLength(result.realizations.length);
  });

  it("produces stable fingerprints and invalidates them when source content changes", () => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("cylinder")!.buildDiagram();
    const first = buildQuotientPipeline(diagram).topologyObject;
    const second = buildQuotientPipeline(diagram).topologyObject;
    const changed = buildQuotientPipeline({ ...diagram, name: `${diagram.name} changed` }).topologyObject;

    expect(first.provenance).toEqual(second.provenance);
    expect(first.provenance.source.hash).not.toBe(changed.provenance.source.hash);
    expect(first.provenance.source.revision).toBe(first.provenance.source.hash);
    expect(first.provenance.canonicalization.algorithmVersion).toBe("fundamental-diagram-quotient@1");
    expect(hashTopologyValue({ b: 2, a: 1 })).toBe(hashTopologyValue({ a: 1, b: 2 }));
  });

  it("creates explicit result envelopes without inventing a value", () => {
    const exact = createTopologyResult({
      status: "exact",
      value: 2,
      method: "cell count",
      sourceRevision: "source:1",
      algorithmVersion: "test@1",
    });
    const unsupported = createTopologyResult<number>({
      status: "unsupported",
      method: "integral homology",
      assumptions: ["finite 2-complex"],
      sourceRevision: "source:1",
      algorithmVersion: "test@1",
      diagnostics: [{ code: "unsupported/input", severity: "warning", message: "Not available." }],
    });

    expect(exact.value).toBe(2);
    expect(unsupported).not.toHaveProperty("value");
    expect(unsupported.assumptions).toEqual(["finite 2-complex"]);
    expect(unsupported.diagnostics[0]?.severity).toBe("warning");
  });
});
