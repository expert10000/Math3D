import { describe, expect, it } from "vitest";
import { replaceCurveDocumentSource } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { curveDocumentFromLegacyDefinition } from "./curveDocumentAdapter";
import { adaptCurveDefinition } from "./infrastructure";
import { curveParameterCursorDraft, projectCurveParameterCursor } from "./curveCursor";
import type { SemanticCurvePick } from "./probe";

const definition = adaptCurveDefinition({ id: "cursor-parabola", revision: 1, label: "Parabola",
  representation: "parametric", dimension: 2, expressions: { x: "t", y: "t*t" },
  domain: { parameter: "t", min: 0, max: 1, closed: false, periodic: false } });
const document = curveDocumentFromLegacyDefinition(definition);
const pick = { identity: definition.identity, t: 0.25, normalizedParameter: 0.25,
  worldPoint: [0.25, 0.0625, 0] } as SemanticCurvePick;

describe("M3D20-03 Curve parameter cursor", () => {
  it("pins an exact source parameter and returns it without rebroadcast", () => {
    const draft = curveParameterCursorDraft(document, definition, pick, "curve-viewer");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const bus = new ScientificCursorBus();
    const cursor = bus.publishProject(draft.value, draft.value.source);
    expect(cursor.frame).toMatchObject({ kind: "parameter", frameId: document.identity.id,
      axes: [{ name: "t", dimension: "parameter" }] });
    expect(projectCurveParameterCursor(cursor, document, definition)).toEqual({ status: "matched", value: 0.25 });
    expect(bus.snapshot()).toEqual(cursor);
  });
  it("refuses stale source, wrong parameter unit, and out-of-domain coordinates", () => {
    expect(curveParameterCursorDraft(document, definition, { ...pick, identity: { ...pick.identity,
      curveRevision: pick.identity.curveRevision + 1 } }, "curve-viewer").ok).toBe(false);
    expect(curveParameterCursorDraft(document, definition, { ...pick, normalizedParameter: 0.3 },
      "curve-viewer").ok).toBe(false);
    const changed = replaceCurveDocumentSource(document, { ...document.source,
      definition: { ...document.source.definition, expressions: { x: "t", y: "t*t*t" } } });
    expect(curveParameterCursorDraft(changed, definition, pick, "curve-viewer").ok).toBe(false);
    const draft = curveParameterCursorDraft(document, definition, pick, "curve-viewer");
    if (!draft.ok) throw Error(draft.errors.join(" "));
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectCurveParameterCursor(cursor, changed, definition).status).toBe("incompatible-source");
    expect(projectCurveParameterCursor({ ...cursor, frame: { ...cursor.frame, axes: [{
      ...cursor.frame.axes[0]!, unit: "ms" }] } }, document, definition).status).toBe("incompatible-source");
    expect(projectCurveParameterCursor({ ...cursor, position: [2] }, document, definition).status).toBe("outside");
  });
});
