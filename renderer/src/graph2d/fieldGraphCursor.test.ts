import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseMath3DProject, parseVectorField3DDocument, sampleVectorField3DAnalyticLine } from "@math3d/core";
import { ScientificCursorBus } from "../components/scientificCursor";
import { vectorFieldCursorDraft } from "../vectorfield3d/vectorFieldCursor";
import { projectFieldCursorToAnalyticLine } from "./fieldGraphCursor";

const raw = readFileSync(new URL("../../../tests/fixtures/scientific-selection/gf01-legacy-project.math3d", import.meta.url), "utf8");
const entry = parseMath3DProject(raw).workspace.entries.find(item => item.module === "vector3d");
if (!entry) throw Error("Missing Vector Field fixture.");
const document = parseVectorField3DDocument(JSON.stringify(entry.checkpoint));
const line = sampleVectorField3DAnalyticLine(document, "speed", 0, [0, 2, 3]);
const draft = vectorFieldCursorDraft(document, [1, 2, 3], "field-view");
if (!draft.ok) throw Error(draft.errors.join(" "));
const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
const map = (input = cursor, rows: typeof line.rows | null = line.rows) =>
  projectFieldCursorToAnalyticLine(input, line.origin, "speed-line", rows);

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
    expect(map(cursor, null).status).toBe("mismatched-grid");
  });
});
