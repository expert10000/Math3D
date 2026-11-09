import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate,
  renameProjectStudy, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createDefaultWorkbook, createNotebookReference } from "@math3d/workbook";
import { prepareProjectWorkbook } from "./projectWorkbookBinding";
import { captureProjectResources, exportProjectPackage, parseProjectPackage } from "./projectResources";
import { projectStudyWorkbookReferences } from "./projectStudyReferences";

const fixture = () => {
  let project = instantiateMath3DProjectTemplate("catenary-study", "study-backlinks");
  project = createProjectStudyFromDocuments(project, "study-backlinks-record", "Chart question",
    [project.workspace.entries[0]!.expected.id]);
  const study = project.workspace.studies![0]!;
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `block-${++sequence}`);
  workbook.title = "Study notebook";
  const block = workbook.stages[0]!.blocks[0]!;
  block.type = "reference";
  block.title = "Cited Study";
  block.notebookReference = createNotebookReference(project, "study", study.id);
  const prepared = prepareProjectWorkbook(project, workbook, "study-citation");
  project = upsertMath3DProjectWorkbook(project, prepared.reference);
  return { project, study, block, prepared };
};

describe("Project Study reverse Workbook citations", () => {
  it("follows only checksum-qualified structured citations and marks later Study edits historical", () => {
    const { project, study, block, prepared } = fixture();
    const read = () => prepared.bytes;
    expect(projectStudyWorkbookReferences(project, study, read)).toEqual([
      expect.objectContaining({ status: "current", blockId: block.id,
        title: "Study notebook / Cited Study" }),
    ]);
    const renamed = renameProjectStudy(project, study.id, "Changed question");
    expect(projectStudyWorkbookReferences(renamed, renamed.workspace.studies![0]!, read))
      .toEqual([expect.objectContaining({ status: "historical" })]);
    expect(projectStudyWorkbookReferences(project, study, () => null)).toEqual([]);
    const damaged = Uint8Array.from(prepared.bytes); damaged[0] ^= 1;
    expect(projectStudyWorkbookReferences(project, study, () => damaged)).toEqual([]);
  });
  it("retains the reverse link after independent resource-package import", () => {
    const { project, study, prepared } = fixture();
    const resources = captureProjectResources(project, item =>
      item.kind === "workbook-payload" && item.id === prepared.reference.id ? prepared.bytes : null, true);
    const reopened = parseProjectPackage(exportProjectPackage(project, resources));
    expect(projectStudyWorkbookReferences(reopened.project, reopened.project.workspace.studies![0]!,
      id => reopened.resources.bytes({ kind: "workbook-payload", id })))
      .toEqual([expect.objectContaining({ status: "current", workbookId: prepared.reference.id })]);
    expect(projectStudyWorkbookReferences(reopened.project, study, () => null)).toEqual([]);
  });
  it("does not infer a Study citation from a checksum-valid payload with an invalid reference", () => {
    const { project, study, prepared } = fixture();
    const workbook = prepared.workbook;
    const block = workbook.stages[0]!.blocks[0]!;
    block.notebookReference = { ...block.notebookReference!, studyHash: "invalid" } as typeof block.notebookReference;
    const invalid = prepareProjectWorkbook(project, workbook, "altered-payload");
    const next = upsertMath3DProjectWorkbook(project, invalid.reference);
    expect(projectStudyWorkbookReferences(next, study, () => invalid.bytes)).toEqual([]);
  });
});
