import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate } from "@math3d/core";
import { prepareCuratedStudyBundle } from "./curatedStudyProject";
import { curatedStudyResearchPreview } from "./curatedStudyPreview";

describe("read-only guided research preview", () => {
  it("shows exact Study, Workbook and Note status from saved bytes", () => {
    const made = prepareCuratedStudyBundle({ project: instantiateMath3DProjectTemplate("catenary-study", "preview-evidence") },
      "catenary-study", "preview-evidence");
    const checked = curatedStudyResearchPreview(made.project, made.resources);
    expect(checked.studies).toHaveLength(2);
    expect(checked.studies.every(item => item.status === "current")).toBe(true);
    expect(checked.citations.some(item => item.status === "current")).toBe(true);
    expect(checked.notes.some(item => item.status === "current")).toBe(true);
    const missing = curatedStudyResearchPreview(made.project);
    expect(missing.citations.some(item => item.status === "missing")).toBe(true);
  });
});
