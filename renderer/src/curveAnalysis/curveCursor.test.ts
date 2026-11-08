import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, replaceCurveDocumentSource } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { curveDocumentFromLegacyDefinition } from "./curveDocumentAdapter";
import { adaptCurveDefinition } from "./infrastructure";
import { curveParameterCursorDraft, projectCurveParameterCursor, projectRestoredCurveParameterCursor,
  projectSavedCurveParameterCursor, restoredCurveParameterCursorDraft, savedCurveParameterCursorDraft } from "./curveCursor";
import { curveEditorSeed } from "../projects/nativeProjectRestore";
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

describe("M3D20-03 saved native Curve cursor", () => {
  const project = instantiateMath3DProjectTemplate("derivative-study", "native-curve-cursor");
  const saved = project.workspace.entries.find(entry => entry.module === "curve")!.checkpoint;
  if (saved.format !== "math3d.curve-document") throw Error("Fixture");
  const seed = curveEditorSeed(saved);
  const editor = { formulas: { x: seed.x, y: seed.y }, domain: { tMin: seed.min, tMax: seed.max, closed: seed.closed } };
  const nativeDefinition = adaptCurveDefinition({ id: "saved-promotion", revision: 1, label: "Saved promotion",
    representation: "parametric", dimension: 2, expressions: { x: seed.x, y: seed.y },
    domain: { parameter: "t", min: seed.min, max: seed.max, closed: seed.closed, periodic: false } });
  const nativePick = { identity: nativeDefinition.identity, t: 1, normalizedParameter: (1 - seed.min) / (seed.max - seed.min),
    worldPoint: [1, 1, 0] } as SemanticCurvePick;
  it("shares and adopts the exact restored source parameter", () => {
    const draft = restoredCurveParameterCursorDraft(saved, editor, nativeDefinition, nativePick, "curve-viewer");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectRestoredCurveParameterCursor(cursor, saved, editor)).toEqual({
      status: "matched", value: (1 - seed.min) / (seed.max - seed.min),
    });
  });
  it("refuses unsynchronized editor formulas, stale sources and changed parameter units", () => {
    const draft = restoredCurveParameterCursorDraft(saved, editor, nativeDefinition, nativePick, "curve-viewer");
    if (!draft.ok) throw Error(draft.errors.join(" "));
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(restoredCurveParameterCursorDraft(saved, { ...editor, formulas: { ...editor.formulas, y: "t^3" } },
      nativeDefinition, nativePick, "curve-viewer").ok).toBe(false);
    expect(projectRestoredCurveParameterCursor(cursor, saved, { ...editor, formulas: { ...editor.formulas, y: "t^3" } }).status).toBe("incompatible-source");
    const revised = replaceCurveDocumentSource(saved, { ...saved.source, definition: { ...saved.source.definition,
      expressions: { x: "x", y: "x^3" } } });
    expect(projectRestoredCurveParameterCursor(cursor, revised, editor).status).toBe("incompatible-source");
    expect(projectRestoredCurveParameterCursor({ ...cursor, frame: { ...cursor.frame, axes: [{ ...cursor.frame.axes[0]!, unit: "s" }] } },
      saved, editor).status).toBe("incompatible-source");
  });
});

describe("M3D20-03 saved Project Curve cursor", () => {
  const project = instantiateMath3DProjectTemplate("derivative-study", "project-curve-cursor");
  const saved = project.workspace.entries.find(entry => entry.module === "curve")!.checkpoint;
  if (saved.format !== "math3d.curve-document") throw Error("Fixture");
  it("adopts a Graph return and shares the exact saved parameter", () => {
    const draft = savedCurveParameterCursorDraft(saved, 1, "project-curve:fixture");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectSavedCurveParameterCursor(cursor, saved)).toEqual({ status: "matched", value: 1 });
    expect(savedCurveParameterCursorDraft(saved, NaN, "project-curve:fixture").ok).toBe(false);
    expect(savedCurveParameterCursorDraft(saved, saved.source.domain.max + 1, "project-curve:fixture").ok).toBe(false);
  });
  it("withholds stale generations, frame changes and out-of-domain values", () => {
    const draft = savedCurveParameterCursorDraft(saved, 1, "project-curve:fixture");
    if (!draft.ok) throw Error(draft.errors.join(" "));
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    const revised = replaceCurveDocumentSource(saved, { ...saved.source, definition: { ...saved.source.definition,
      expressions: { x: "x", y: "x^3" } } });
    expect(projectSavedCurveParameterCursor(cursor, revised).status).toBe("incompatible-source");
    expect(projectSavedCurveParameterCursor({ ...cursor, frame: { ...cursor.frame, frameId: "other" } },
      saved).status).toBe("incompatible-source");
    expect(projectSavedCurveParameterCursor({ ...cursor, position: [saved.source.domain.max + 1] },
      saved).status).toBe("outside");
  });
});
