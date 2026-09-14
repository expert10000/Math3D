import { describe, expect, it } from "vitest";
import baseline from "../../../tests/fixtures/platform-v1.5.0/topology/baseline.json";
import { createTopologyDocument, migrateTopologyDocument } from "./documentFormat";
import { TOPOLOGY_PRESET_BY_ID } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";

type PresetExpectation = (typeof baseline.presets)[number];

const buildPreset = (fixture: PresetExpectation) => {
  const preset = TOPOLOGY_PRESET_BY_ID.get(fixture.presetId);
  if (!preset) throw new Error(`Missing baseline preset: ${fixture.presetId}`);
  return buildQuotientPipeline(preset.buildDiagram());
};

describe("v1.5.0 Topology compatibility baseline", () => {
  it.each(baseline.presets)("preserves exact $presetId semantics", (fixture) => {
    const first = buildPreset(fixture);
    const second = buildPreset(fixture);
    const canonical = first.topologyObject.canonical;
    const homology = first.homology.value;
    const classification = first.surfaceClassification.value;

    expect(first.topologyObject.provenance.canonicalization.hash).toBe(
      second.topologyObject.provenance.canonicalization.hash
    );
    expect([canonical.vertices.length, canonical.edges.length, canonical.faces.length]).toEqual(
      fixture.canonicalCellCounts
    );
    expect(first.quotient.invariants?.eulerCharacteristic).toBe(fixture.eulerCharacteristic);
    expect(first.structuralValidation.value?.structurallyValid).toBe(true);
    expect(first.cellularBoundaryOperators.value?.chainCondition.holds).toBe(true);
    expect(homology?.integer.groups.map((group) => group.bettiNumber)).toEqual(fixture.integerBetti);
    expect(homology?.mod2.groups.map((group) => group.dimension)).toEqual(fixture.mod2Dimensions);
    expect(homology?.integer.groups[1].torsionCoefficients).toEqual(fixture.h1Torsion);
    expect(classification?.eligible).toBe(true);
    expect(classification?.classification?.label).toBe(fixture.classification);
    expect(first.realizations.map((realization) => realization.kind)).toEqual(
      expect.arrayContaining(fixture.realizationKinds)
    );
  });

  it.each(baseline.documentCompatibility)("preserves $case document handling", (fixture) => {
    const diagram = TOPOLOGY_PRESET_BY_ID.get("torus_square")!.buildDiagram();
    const current = createTopologyDocument(diagram, { activeView: "algebra" });
    let input: unknown;

    if (fixture.case === "legacy-v1") {
      input = {
        format: "math3d-topology",
        version: 1,
        extension: ".math3d-topology",
        savedAt: "2026-04-04T00:00:00.000Z",
        payload: {
          diagram,
          cache: { activeView: "algebra", activeRealizationId: null },
        },
      };
    } else if (fixture.case === "stale-v2") {
      const stale = structuredClone(current);
      stale.payload.cache.algorithmVersions.homology = "baseline-obsolete@0";
      stale.payload.canonical.name = "tampered baseline cache";
      input = stale;
    } else if (fixture.case === "invalid") {
      input = { format: "math3d-topology", version: 2, payload: {} };
    } else {
      input = current;
    }

    const loaded = migrateTopologyDocument(input);
    expect(loaded?.audit.migration ?? null).toBe(fixture.expectedMigration);
    expect(loaded?.audit.cacheStatus ?? null).toBe(fixture.expectedCacheStatus);
    if (loaded) {
      expect(loaded.buildResult.topologyObject.provenance.source.hash).toBe(
        loaded.document.payload.provenance.source.hash
      );
      expect(loaded.buildResult.homology.status).toBe("exact");
    }
  });
});
