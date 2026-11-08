import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate } from "@math3d/core";
import { addQualifiedStudyGraphCurveLink, qualifyStudyGraphCurveLink,
  studyHasQualifiedGraphCurveLink } from "./studyGraphCurveLink";

const template = instantiateMath3DProjectTemplate("derivative-study", "study-graph-curve-link");
const ids = template.workspace.entries.slice(0, 2).map(entry => entry.expected.id);
const project = createProjectStudyFromDocuments(template, "linked", "Graph and Curve", ids);
const study = project.workspace.studies![0]!;

describe("qualified Study Graph–Curve parameter link", () => {
  it("persists only the mapping between exact promoted panes", () => {
    const pair = qualifyStudyGraphCurveLink(project, study);
    expect(pair).toMatchObject({ graphPaneId: "pane-1", curvePaneId: "pane-2", objectId: "profile" });
    const linked = addQualifiedStudyGraphCurveLink(project, study.id);
    expect(linked.workspace.studies![0]!.links).toEqual([{
      id: "parameter-pane-2-pane-1", kind: "parameter", sourcePaneId: "pane-2",
      targetPaneId: "pane-1", mappingId: "graph2d.promote-curve", direction: "two-way",
    }]);
    expect(studyHasQualifiedGraphCurveLink(linked.workspace.studies![0]!, pair!)).toBe(true);
    expect(addQualifiedStudyGraphCurveLink(linked, study.id)).toEqual(linked);
  });
  it("refuses absent promotion, changed generations and unrelated panes", () => {
    const withoutRelation = { ...project, workspace: { ...project.workspace, relations: [] } };
    expect(qualifyStudyGraphCurveLink(withoutRelation, study)).toBeNull();
    expect(() => addQualifiedStudyGraphCurveLink(withoutRelation, study.id)).toThrow(/no current/);
    const changed = { ...project, workspace: { ...project.workspace, studies: [{ ...study,
      members: study.members.map((member, index) => index ? member : { ...member,
        expected: { ...member.expected, revision: member.expected.revision + 1 } }) }] } };
    expect(qualifyStudyGraphCurveLink(changed, changed.workspace.studies[0]!)).toBeNull();
    const onePane = { ...study, layout: { mode: "single" as const, panes: [study.layout.panes[0]!] } };
    expect(qualifyStudyGraphCurveLink({ ...project, workspace: { ...project.workspace,
      studies: [onePane] } }, onePane)).toBeNull();
  });
});
