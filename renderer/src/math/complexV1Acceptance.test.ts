import { describe, expect, it } from "vitest";
import {
  COMPLEX_COMMAND_TYPES,
  createComplexPersistenceRecord,
  deserializeComplexPersistenceRecord,
  serializeComplexPersistenceRecord,
} from "@math3d/core";
import { ComplexAnalysisCommandAdapter } from "./complexCommandAdapter";
import { contourRecordFromPoints, publishComplexNumericalAnalysis } from "./complexNumericalAnalysis";
import { ComplexFunctionPreviewSession } from "./complexPreviewArtifacts";
import { createComplexRiemannSurfaceHandoff, locateComplexRiemannSurfaceVertex } from "./complexRiemannSurfaceHandoff";

describe("C12 Complex Analysis v1 acceptance", () => {
  it("runs define → explore → analyze → save → reopen → replay → derived handoff through one document", async () => {
    const session = new ComplexFunctionPreviewSession({
      inputMode: "fz", fExpr: "z", reExpr: "u", imExpr: "v",
      uMin: -2, uMax: 2, vMin: -2, vMax: 2, nu: 16, nv: 16,
      mapMode: "standard", sheetCount: 1, sheetIndex: 0, branchCutAngle: Math.PI,
    });
    session.commands.commitFunction("1/z", ["z"]);
    const contour = contourRecordFromPoints("v1-circle", "circle", Array.from({ length: 65 }, (_, index) => {
      const angle = 2 * Math.PI * index / 64;
      return { re: Math.cos(angle), im: Math.sin(angle) };
    }));
    session.commands.commit(COMPLEX_COMMAND_TYPES.setContours, [contour]);
    const document = session.commands.document();
    const preview = await session.build("high");
    expect(preview.ignored).toBe(false);
    expect(Object.keys(preview.handles)).toHaveLength(14);

    const result = publishComplexNumericalAnalysis({ document, probe: { re: 1, im: 0 }, now: 1 });
    expect(result.status).toBe("numerical");
    expect(result.provenance.source.structuralHash).toBe(document.identity.structuralHash);
    const saved = createComplexPersistenceRecord({ document, replay: session.commands.exportReplay(), results: [result] });
    const reopened = deserializeComplexPersistenceRecord(serializeComplexPersistenceRecord(saved));
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) return;
    const replayed = ComplexAnalysisCommandAdapter.restore(reopened.value.replay);
    expect(replayed.document().identity).toEqual(document.identity);
    expect(replayed.document().function.sourceText).toBe("1/z");
    expect(replayed.document().contours).toHaveLength(1);

    const handoff = createComplexRiemannSurfaceHandoff({
      document, registry: session.artifacts.registry,
      positions: new Float32Array(12), indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
      scalarField: new Float32Array(4), quantity: "abs", columns: 2, rows: 2, sheetCount: 1,
      domain: { uMin: -2, uMax: 2, vMin: -2, vMax: 2 },
    });
    const located = locateComplexRiemannSurfaceVertex(handoff, 3);
    expect(located).toMatchObject({ functionSource: "1/z", source: { revision: document.identity.revision }, generation: { quantity: "abs" } });
    expect(handoff.relationships.map((entry) => entry.targetModule)).toEqual(["Surfaces", "Mesh"]);
  });
});
