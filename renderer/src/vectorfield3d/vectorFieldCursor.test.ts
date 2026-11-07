import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMath3DProject, parseVectorField3DDocument,
  reviseVectorField3DDocument, reviseVectorField3DWorkspace } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { projectVectorFieldCursor, vectorFieldCursorAvailability,
  vectorFieldCursorDraft } from "./vectorFieldCursor";

const raw = readFileSync(new URL("../../../tests/fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8");
const entry = parseMath3DProject(raw).workspace.entries.find(item => item.module === "vector3d");
if (!entry) throw Error("Missing Vector Field fixture.");
const document = parseVectorField3DDocument(JSON.stringify(entry.checkpoint));

describe("M3D20-03 Vector Field cursor mapping", () => {
  it("publishes a physical point pinned to the exact document revision", () => {
    const draft = vectorFieldCursorDraft(document, [1, 2, 3], "vector-field3d");
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectVectorFieldCursor(cursor, document)).toEqual({ status: "matched", value: [1, 2, 3] });
    const updated = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, maxGlyphs: document.source.display.maxGlyphs + 1 } });
    expect(projectVectorFieldCursor(cursor, updated).status).toBe("incompatible-source");
    const movedProbe = reviseVectorField3DWorkspace(document, { ...document.workspace!, probe: [2, 2, 3] });
    expect(projectVectorFieldCursor(cursor, movedProbe).status).toBe("matched");
  });
  it("refuses out-of-domain points, guessed units, and mismatched frames", () => {
    expect(vectorFieldCursorAvailability(document, [5, 0, 0])).toMatch(/outside/);
    expect(vectorFieldCursorDraft(document, [Infinity, 0, 0], "vector-field3d").ok).toBe(false);
    const centimeters = { ...document, source: { ...document.source, axes:
      document.source.axes.map(axis => ({ ...axis, unit: "cm" })) as typeof document.source.axes } };
    expect(vectorFieldCursorDraft(centimeters, [1, 2, 3], "vector-field3d").ok).toBe(false);
    const draft = vectorFieldCursorDraft(document, [1, 2, 3], "vector-field3d");
    if (!draft.ok) return;
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectVectorFieldCursor({ ...cursor, frame: { ...cursor.frame, frameId: "unknown" } }, document).status)
      .toBe("incompatible-source");
  });
});
