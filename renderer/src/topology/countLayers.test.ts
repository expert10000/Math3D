import { describe, expect, it } from "vitest";
import { buildTopologyCountLayers } from "./countLayers";
import { TOPOLOGY_PRESET_BY_ID, TOPOLOGY_PRESETS } from "./presets";
import { buildQuotientPipeline } from "./quotientBuilder";
import { normalizeTopologyRealizationKinds } from "./realization";
import type { QuotientBuildResult } from "./types";

describe("topology semantic safety", () => {
  it("keeps source, refinement, canonical, and display counts separate", () => {
    const preset = TOPOLOGY_PRESET_BY_ID.get("torus_square");
    expect(preset).toBeTruthy();
    const result = buildQuotientPipeline(preset!.buildDiagram());
    const smooth = result.realizations.find((entry) => entry.id.endsWith("/realization/torus-smooth"));
    const flat = result.realizations.find((entry) => entry.id.endsWith("/realization/flat"));
    const smoothLayers = buildTopologyCountLayers(result, smooth);
    const flatLayers = buildTopologyCountLayers(result, flat);

    expect(smoothLayers.source.faces).toBe(1);
    expect(smoothLayers.refinement.faces).toBeGreaterThan(smoothLayers.source.faces);
    expect(smoothLayers.canonical).toMatchObject({ vertices: 1, edges: 2, faces: 1, eulerCharacteristic: 0 });
    expect(smoothLayers.canonical.eulerCharacteristic).toBe(
      smoothLayers.canonical.vertices - smoothLayers.canonical.edges + smoothLayers.canonical.faces
    );
    expect(smoothLayers.canonical).toEqual(flatLayers.canonical);
    expect(smoothLayers.display.triangles).toBeGreaterThan(0);
    expect(flatLayers.display.triangles).toBeGreaterThan(0);
  });

  it("labels every generated R3 realization with audited non-authoritative metadata", () => {
    const allowedKinds = new Set(["embedded", "immersed", "schematic"]);
    for (const preset of TOPOLOGY_PRESETS) {
      const result = buildQuotientPipeline(preset.buildDiagram());
      expect(result.realizations.length, preset.id).toBeGreaterThan(0);
      for (const realization of result.realizations) {
        expect(allowedKinds.has(realization.kind), `${preset.id}: ${realization.name}`).toBe(true);
      }
    }
  });

  it("marks RP2 and Klein models immersed while generic displays remain schematic", () => {
    const projective = buildQuotientPipeline(TOPOLOGY_PRESET_BY_ID.get("projective_plane")!.buildDiagram());
    const klein = buildQuotientPipeline(TOPOLOGY_PRESET_BY_ID.get("klein_bottle_square")!.buildDiagram());

    expect(projective.realizations.find((entry) => entry.id.endsWith("projective-immersed"))?.kind).toBe("immersed");
    expect(klein.realizations.find((entry) => entry.id.endsWith("klein-immersed"))?.kind).toBe("immersed");
    expect(projective.realizations.find((entry) => entry.id.endsWith("/default"))?.kind).toBe("schematic");
    expect(projective.realizations.find((entry) => entry.id.endsWith("/flat"))?.kind).toBe("schematic");
  });

  it("restores explicit classifications when loading legacy v1 cached realizations", () => {
    const result = buildQuotientPipeline(TOPOLOGY_PRESET_BY_ID.get("projective_plane")!.buildDiagram());
    const legacy = {
      ...result,
      realizations: result.realizations.map(({ kind: _kind, ...realization }) => realization),
    } as unknown as QuotientBuildResult;
    const compatible = normalizeTopologyRealizationKinds(legacy);

    expect(compatible.realizations.find((entry) => entry.id.endsWith("projective-immersed"))?.kind).toBe("immersed");
    expect(compatible.realizations.find((entry) => entry.id.endsWith("/default"))?.kind).toBe("schematic");
  });
});
