import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "@math3d/core";
import { instantiateNotebookStarter } from "./notebookStarters";
import { readProjectWorkbook } from "./projectWorkbookBinding";
import { assertIndependentNarrativeImport, previewResearchNarrativeImport } from "./projectResearchNarrativeImport";
import { createPortableResearchNarrative } from "../workbook/researchNarrative";

const fixture = () => {
  const { project, resources } = instantiateNotebookStarter("edge-path-evidence", "narrative-import");
  const reference = project.workbooks![0]!;
  const book = readProjectWorkbook(resources.bytes({ kind: "workbook-payload", id: reference.id })!, reference);
  return { project, narrative: createPortableResearchNarrative(project, [book], resources) };
};

describe("research narrative Project import", () => {
  it("verifies the package and presents citations, omissions, and source compatibility", () => {
    const { project, narrative } = fixture();
    const checked = previewResearchNarrativeImport(canonicalJsonStringify(narrative));
    expect(checked.preview.project.identity.id).toBe(project.identity.id);
    expect(checked.preview.resources.bytes({ kind: "workbook-payload", id: project.workbooks![0]!.id })).not.toBeNull();
    expect(checked.narrative.evidence.citations.length).toBeGreaterThan(0);
    expect(checked.preview.inputKind).toBe("Verified research narrative");
    expect(() => assertIndependentNarrativeImport(checked.preview.project, [], null)).not.toThrow();
  });

  it("refuses a saved or active identity, even when the package bytes are identical", () => {
    const { project } = fixture();
    expect(() => assertIndependentNarrativeImport(project, [project.identity.id])).toThrow(/already exists/);
    expect(() => assertIndependentNarrativeImport(project, [], project.identity.id)).toThrow(/already exists/);
  });

  it("rejects altered evidence and invalid file shapes before import", () => {
    const { narrative } = fixture();
    expect(() => previewResearchNarrativeImport(canonicalJsonStringify({ ...narrative,
      evidence: { ...narrative.evidence, omissions: [{ kind: "citation", targetId: "forged", reason: "forged" }] } })))
      .toThrow(/checksum/);
    expect(() => previewResearchNarrativeImport("[]")).toThrow(/Unsupported/);
    expect(() => previewResearchNarrativeImport("{}")) .toThrow(/Unsupported/);
  });
});
