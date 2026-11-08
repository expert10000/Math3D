import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMath3DProject, parseVectorField3DDocument, reviseVectorField3DDocument,
  sampleVectorField3DAnalyticLine } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { vectorFieldCursorDraft } from "../vectorfield3d/vectorFieldCursor";
import { graphAnalyticRowCursorDraft, projectFieldCursorToAnalyticLine } from "./fieldGraphCursor";

const raw = readFileSync(new URL("../../../tests/fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8");
const entry = parseMath3DProject(raw).workspace.entries.find(item => item.module === "vector3d");
if (!entry) throw Error("Missing Vector Field fixture.");
const document = parseVectorField3DDocument(JSON.stringify(entry.checkpoint));
const line = sampleVectorField3DAnalyticLine(document, "speed", 0, [0, 2, 3]);
const draft = vectorFieldCursorDraft(document, [1, 2, 3], "field-view");
if (!draft.ok) throw Error(draft.errors.join(" "));
const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
const map = (input = cursor, rows: typeof line.rows | null = line.rows,
  currentField: typeof document | null = document) =>
  projectFieldCursorToAnalyticLine(input, line.origin, "speed-line", rows, currentField);

describe("M3D20-03 exact Field-to-Graphs cursor projection", () => {
  it("uses one finite saved row on the recorded physical line", () => {
    const result = map();
    expect(result.status).toBe("matched");
    if (result.status === "matched") expect(result.value).toMatchObject({ objectId: "speed-line", x: 1, rowId: "row_81" });
  });
  it("refuses stale source, guessed units, and a different fixed plane", () => {
    expect(map({ ...cursor, source: { ...cursor.source, revision: cursor.source.revision + 1 } }).status)
      .toBe("incompatible-source");
    expect(map({ ...cursor, frame: { ...cursor.frame, axes: cursor.frame.axes.map(axis => ({ ...axis, unit: "cm" })) } }).status)
      .toBe("incompatible-source");
    expect(map({ ...cursor, position: [1, 2.1, 3] }).status).toBe("outside");
  });
  it("does not interpolate missing, ambiguous, or nonfinite samples", () => {
    expect(map({ ...cursor, position: [1.01, 2, 3] }).status).toBe("mismatched-grid");
    expect(map(cursor, [...line.rows, line.rows[80]!]).status).toBe("ambiguous");
    expect(map(cursor, line.rows.map(row => row.x === 1 ? { ...row, y: null } : row)).status)
      .toBe("mismatched-grid");
    expect(map(cursor, line.rows.map(row => row.x === 1 ? { ...row, y: row.y! + 1 } : row)).status)
      .toBe("mismatched-grid");
    expect(map(cursor, null).status).toBe("mismatched-grid");
    expect(map(cursor, line.rows, null).status).toBe("incompatible-source");
  });
  it("returns a selected Graph row only after recalculating the complete current Field line", () => {
    const row = line.rows[80]!;
    const probe = { objectId: "speed-line", x: row.x, y: row.y!, rowId: row.id };
    const result = graphAnalyticRowCursorDraft(probe, "speed-line", line.origin, line.rows, document);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const returned = new ScientificCursorBus().publishProject(result.value, result.value.source);
    expect(returned.position).toEqual([1, 2, 3]);
    expect(map(returned).status).toBe("matched");
    expect(graphAnalyticRowCursorDraft({ ...probe, y: probe.y + 1 }, "speed-line", line.origin, line.rows, document).ok).toBe(false);
    expect(graphAnalyticRowCursorDraft({ ...probe, rowId: undefined }, "speed-line", line.origin, line.rows, document).ok).toBe(false);
    expect(graphAnalyticRowCursorDraft(probe, "speed-line", line.origin,
      line.rows.map(item => item.id === row.id ? { ...item, y: item.y! + 1 } : item), document).ok).toBe(false);
    const changed = reviseVectorField3DDocument(document, { ...document.source,
      display: { ...document.source.display, maxGlyphs: document.source.display.maxGlyphs + 1 } });
    expect(graphAnalyticRowCursorDraft(probe, "speed-line", line.origin, line.rows, changed).ok).toBe(false);
  });
});
