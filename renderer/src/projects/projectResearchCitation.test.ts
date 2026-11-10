import { describe, expect, it } from "vitest";
import { createProjectStudyFromDocuments, instantiateMath3DProjectTemplate,
  renameProjectStudy } from "@math3d/core";
import { createNotebookReference } from "@math3d/workbook";
import { assessProjectResearchCitation } from "./projectResearchCitation";

const fixture = () => {
  let project = instantiateMath3DProjectTemplate("catenary-study", "research-citations");
  project = createProjectStudyFromDocuments(project, "citation-study", "Original question",
    [project.workspace.entries[0]!.expected.id]);
  const source = project.workspace.entries[0]!.expected.id;
  const study = project.workspace.studies![0]!;
  return { project, source, study };
};

describe("shared Project research citation qualification", () => {
  it("qualifies the exact document and Study and keeps an edited Study historical", () => {
    const { project, source, study } = fixture();
    const document = createNotebookReference(project, "document", source);
    const citedStudy = createNotebookReference(project, "study", study.id);
    expect(assessProjectResearchCitation(project, document).status).toBe("current");
    expect(assessProjectResearchCitation(project, citedStudy).status).toBe("current");
    const renamed = renameProjectStudy(project, study.id, "Revised question");
    expect(assessProjectResearchCitation(renamed, citedStudy).status).toBe("historical");
  });

  it("distinguishes missing sources, malformed citations, and another Project", () => {
    const { project, source } = fixture();
    const cited = createNotebookReference(project, "document", source);
    const missing = { ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.filter(entry => entry.expected.id !== source) } };
    expect(assessProjectResearchCitation(missing, cited).status).toBe("missing");
    expect(assessProjectResearchCitation(project, { ...cited, unexpected: true }).status).toBe("corrupt");
    const other = instantiateMath3DProjectTemplate("catenary-study", "other-project");
    expect(assessProjectResearchCitation(other, cited).status).toBe("different-project");
  });
});
