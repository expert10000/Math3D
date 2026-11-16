import { describe, expect, it } from "vitest";
import { createMixedWorkspaceDocument, createProjectStudyFromDocuments, parseMath3DProject,
  replaceMath3DProjectWorkspace, replaceMeshDocumentSource, serializeMath3DProject } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { inspectProjectCompatibility } from "./projectTransfer";
import { addQualifiedStudySurfaceMeshLink, qualifyStudySurfaceMeshLink,
  studyHasQualifiedSurfaceMeshLink } from "./studySurfaceMeshLink";

const bundle = instantiateNotebookStarter("surface-mesh-probe", "study-spatial-cursor");
const ids = bundle.project.workspace.entries.map(entry => entry.expected.id);
const project = createProjectStudyFromDocuments(bundle.project, "spatial-pair", "Physical coordinate", ids);
const study = project.workspace.studies![0]!;

describe("qualified Surface–Mesh Study marker", () => {
  it("refuses a Project with missing Mesh buffers while retaining a previewable checkpoint", () => {
    const preview = inspectProjectCompatibility(project);
    expect(preview.canOpenWorkspace).toBe(false);
    expect(preview.reasons).toContain("Required source sidecars are missing or unverified on this computer.");
    expect(preview.sidecars).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "mesh-buffers", requiredForSource: true, available: false }),
    ]));
    expect(preview.checkpoint.entries.find((entry) => entry.module === "mesh")?.expected.id).toBe(ids[1]);
  });
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
  it("reopens an incompatible physical frame with a recoverable disabled link", () => {
    const entry = project.workspace.entries.find((item) => item.module === "mesh")!;
    if (entry.checkpoint.format !== "math3d.mesh-document") throw new Error("Missing Mesh fixture");
    const origin = entry.checkpoint.source.origin as Record<string, any>;
    const changed = replaceMeshDocumentSource(entry.checkpoint, { ...entry.checkpoint.source,
      origin: { ...origin, math3dCoordinateFrame: { ...origin.math3dCoordinateFrame, frame: "other" } } });
    const updatedStudy = { ...study, members: study.members.map((member) => member.documentId === changed.identity.id
      ? { ...member, expected: changed.identity } : member) };
    const workspace = createMixedWorkspaceDocument({ ...project.workspace,
      entries: project.workspace.entries.map((item) => item === entry ? { ...item, checkpoint: changed,
        expected: changed.identity } : item), studies: [updatedStudy] });
    const reopened = parseMath3DProject(serializeMath3DProject(replaceMath3DProjectWorkspace(project, workspace)));
    expect(qualifyStudySurfaceMeshLink(reopened, reopened.workspace.studies![0]!)).toMatchObject({ status: "disabled",
      reason: "Surface and Mesh physical frames or units differ." });
  });
});
