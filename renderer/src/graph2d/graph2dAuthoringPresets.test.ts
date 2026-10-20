import { describe, expect, it } from "vitest";
import {
  previewGraph2DPointImport, validateGraph2DFunctionDraft, validateGraph2DParametricDraft,
  validateGraph2DPolarDraft, validateGraph2DImplicitDraft, validateGraph2DSlopeFieldDraft,
  validateGraph2DPhasePortraitDraft, validateGraph2DTimeOdeDraft,
  validateGraph2DInequalityDraft, validateGraph2DPiecewiseDraft,
} from "@math3d/core";
import { graph2DAuthoringPresets } from "./graph2dAuthoringPresets";

describe("Graph Add presets", () => {
  it("offers five distinct, valid starting drafts for every Add editor", () => {
    const check = <T>(kind: string, entries: readonly { id: string; title: string; detail: string; draft: () => T }[],
      validate: (draft: T) => readonly string[]) => {
      expect(entries, kind).toHaveLength(5);
      expect(new Set(entries.map(entry => entry.id)).size, kind).toBe(5);
      expect(entries.every(entry => entry.title.trim() && entry.detail.trim()), kind).toBe(true);
      for (const entry of entries) expect(validate(entry.draft()), `${kind}: ${entry.title}`).toEqual([]);
    };
    check("explicit", graph2DAuthoringPresets.explicit, validateGraph2DFunctionDraft);
    check("parametric", graph2DAuthoringPresets.parametric, validateGraph2DParametricDraft);
    check("polar", graph2DAuthoringPresets.polar, validateGraph2DPolarDraft);
    check("implicit", graph2DAuthoringPresets.implicit, validateGraph2DImplicitDraft);
    check("slope-field", graph2DAuthoringPresets["slope-field"], validateGraph2DSlopeFieldDraft);
    check("phase-portrait", graph2DAuthoringPresets["phase-portrait"], validateGraph2DPhasePortraitDraft);
    check("time-ode", graph2DAuthoringPresets["time-ode"], validateGraph2DTimeOdeDraft);
    check("inequality", graph2DAuthoringPresets.inequality, validateGraph2DInequalityDraft);
    check("piecewise", graph2DAuthoringPresets.piecewise, validateGraph2DPiecewiseDraft);
    check("point-series", graph2DAuthoringPresets["point-series"],
      draft => previewGraph2DPointImport(draft.text).errors);
  });

  it("creates fresh nested draft values each time a preset is selected", () => {
    const preset = graph2DAuthoringPresets.inequality[2]!;
    const first = preset.draft(), second = preset.draft();
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.clauses).not.toBe(second.clauses);
  });
});
