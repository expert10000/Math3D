import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate,
  parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { curveSurfaceCursorDraft, curveSurfaceReturnDraft, projectCurveSurfaceParameter } from
  "../curveAnalysis/curveSurfaceCursor";
import { ScientificCursorBus } from "../components/scientificCursor";
import { addQualifiedStudyCurveSurfaceLink, qualifyStudyCurveSurfaceLink,
  studyHasQualifiedCurveSurfaceLink } from "./studyCurveSurfaceLink";

const template = instantiateMath3DProjectTemplate("curve-construction-study", "study-chart-link");
const surface = template.workspace.entries.find(entry => entry.checkpoint.format === "math3d.surface-document" &&
  entry.checkpoint.metadata.title === "Parameter chart")!;
const curve = template.workspace.entries.find(entry => entry.checkpoint.format === "math3d.curve-document" &&
  entry.checkpoint.metadata.title === "Curve on chart")!;
const project = createProjectStudyFromDocuments(template, "chart-link", "Curve on Surface",
  [surface.expected.id, curve.expected.id]);
const study = project.workspace.studies![0]!;

describe("qualified Study Curve–Surface cursor", () => {
  it("reopens a declared mapping and returns only an exactly qualified chart point", () => {
    const pair = qualifyStudyCurveSurfaceLink(project, study);
    expect(pair).toMatchObject({ surfacePaneId: "pane-1", curvePaneId: "pane-2" });
    const linked = addQualifiedStudyCurveSurfaceLink(project, study.id);
    const reopened = parseMath3DProject(serializeMath3DProject(linked));
    const saved = reopened.workspace.studies![0]!;
    expect(studyHasQualifiedCurveSurfaceLink(saved, qualifyStudyCurveSurfaceLink(reopened, saved)!)).toBe(true);
    const draft = curveSurfaceCursorDraft(reopened, curve.expected.id, surface.expected.id, 0.5, "study-test");
    expect(draft.status).toBe("matched");
    if (draft.status !== "matched") return;
    const cursor = new ScientificCursorBus().publishProject(draft.value, draft.value.source);
    expect(projectCurveSurfaceParameter(cursor, reopened, surface.expected.id)).toEqual({
      status: "matched", value: { u: 0.5, v: 0.25 } });
    expect(curveSurfaceReturnDraft(reopened, curve.expected.id, { surfaceId: surface.expected.id,
      revision: surface.expected.revision, hash: surface.expected.structuralHash,
      uv: { u: 0.5, v: 0.25 } }, "study-test").status).toBe("matched");
    expect(curveSurfaceReturnDraft(reopened, curve.expected.id, { surfaceId: surface.expected.id,
      revision: surface.expected.revision, hash: surface.expected.structuralHash,
      uv: { u: 0.5, v: 0.3 } }, "study-test").status).toBe("outside");
    expect(addQualifiedStudyCurveSurfaceLink(reopened, study.id)).toEqual(reopened);
  });
  it("refuses a missing relation, changed member, or unrelated pane", () => {
    const noRelation = { ...project, workspace: { ...project.workspace, relations: [] } };
    expect(qualifyStudyCurveSurfaceLink(noRelation, study)).toBeNull();
    expect(() => addQualifiedStudyCurveSurfaceLink(noRelation, study.id)).toThrow(/no current/);
    const changed = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.map(entry => entry.expected.id === surface.expected.id ?
        { ...entry, expected: { ...entry.expected, revision: entry.expected.revision + 1 } } : entry) } };
    expect(qualifyStudyCurveSurfaceLink(changed, study)).toBeNull();
    const missing = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.filter(entry => entry.expected.id !== curve.expected.id) } };
    expect(qualifyStudyCurveSurfaceLink(missing, study)).toBeNull();
  });
});
