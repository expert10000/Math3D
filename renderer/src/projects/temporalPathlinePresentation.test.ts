import { describe, expect, it } from "vitest";
import { createCurveDocument, type TemporalFieldSourceDocument } from "@math3d/core";
import { createGf23Project } from "../../../tests/fixtures/graph-field/gf23Bundle";
import { additionalRepresentationView } from "./additionalProjectRepresentations";

describe("GF-28 Project Curve presentation", () => {
  it("withholds changed frames and unverified scientific pathline points", () => {
    const source = createGf23Project().workspace.entries[0]!.checkpoint;
    if (source.format !== "math3d.vector-field3d-document") throw new Error("Wrong fixture.");
    const temporal = { schemaVersion: 3, identity: {
      id: "math3d:temporal-field:test", revision: 1,
      structuralHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    source: { frames: [{ documentId: source.identity.id,
      revision: source.identity.revision,
      structuralHash: source.identity.structuralHash }] } } as TemporalFieldSourceDocument;
    const curve = createCurveDocument({ stableKey: "gf28-preview-withholding",
      source: { representation: "polyline", dimension: 3,
        domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false },
        units: { position: "m", parameter: "s", angle: "rad" },
        orientation: {}, derivatives: {},
        definition: { familyId: "vector3d.temporal-pathline",
          sourceIds: [temporal.identity.id, source.identity.id],
          pointCount: 2, points: [[0, 0, 0], [1, 0, 0]],
          settings: { temporalHash: temporal.identity.structuralHash,
            temporalRevision: temporal.identity.revision } },
        dependencies: [] } });
    expect(() => additionalRepresentationView(curve,
      { documents: new Map(), timeSources: [temporal] })).toThrow(/frame changed/);
    expect(() => additionalRepresentationView(curve,
      { documents: new Map([[source.identity.id, source]]),
        timeSources: [temporal] })).toThrow(/fresh bundle verification/);
  });
});
