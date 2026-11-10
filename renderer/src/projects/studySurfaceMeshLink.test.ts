import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { addQualifiedStudySurfaceMeshLink, qualifyStudySurfaceMeshLink,
  studyHasQualifiedSurfaceMeshLink } from "./studySurfaceMeshLink";

const bundle = instantiateNotebookStarter("surface-mesh-probe", "study-spatial-cursor");
const ids = bundle.project.workspace.entries.map(entry => entry.expected.id);
const project = createProjectStudyFromDocuments(bundle.project, "spatial-pair", "Physical coordinate", ids);
const study = project.workspace.studies![0]!;

describe("qualified Surface–Mesh Study marker", () => {
  it("requires exact replay and a matching declared frame before saving the mapping", () => {
    const qualified = qualifyStudySurfaceMeshLink(project, study);
    expect(qualified.status).toBe("ready");
    if (qualified.status !== "ready") return;
    expect(qualified.value.frame).toMatchObject({ frame: "local", unit: "m", axes: ["x", "y", "z"] });
    const linked = addQualifiedStudySurfaceMeshLink(project, study.id);
    const reopened = parseMath3DProject(serializeMath3DProject(linked));
    expect(studyHasQualifiedSurfaceMeshLink(reopened.workspace.studies![0]!, qualified.value)).toBe(true);
    expect(addQualifiedStudySurfaceMeshLink(reopened, study.id)).toEqual(reopened);
  });

  it("withholds changed or missing members and refuses to save a link", () => {
    const changed = { ...project, workspace: { ...project.workspace, studies: [{ ...study,
      members: study.members.map((member, index) => index === 0 ? { ...member,
        expected: { ...member.expected, revision: member.expected.revision + 1 } } : member) }] } };
    expect(qualifyStudySurfaceMeshLink(changed, changed.workspace.studies[0]!).status).toBe("disabled");
    expect(() => addQualifiedStudySurfaceMeshLink(changed, study.id)).toThrow(/changed/);
    const missing = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.filter(entry => entry.expected.id !== ids[1]) } };
    expect(qualifyStudySurfaceMeshLink(missing, study)).toMatchObject({ status: "disabled",
      reason: "Saved member document is missing." });
  });
});
