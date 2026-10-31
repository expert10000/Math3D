import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject, upsertMath3DProjectComposition, upsertMath3DProjectNote,
  type ProjectComposition } from "@math3d/core";
import { createProjectComparisonTemplate } from "../../packages/core/src/projectComparisonTemplates";
import { createProjectComparisonNote, inspectProjectComparisonNote } from "../../renderer/src/projects/projectComparisonNotes";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { projectResourceInventory } from "../../renderer/src/projects/projectResources";
import { createProjectComparisonEvidence, projectComparisonEvidenceHtml } from "../../renderer/src/projects/projectComparisonEvidence";
import { createDefaultWorkbook, createWorkbookComparisonReference } from "@math3d/workbook";
import { notebookPublicationManifest, notebookPublicationManifestHtml, notebookPublicationMarkdown } from "../../renderer/src/workbook/notebookPublication";

describe("PC09 exact comparison observations", () => {
  it("reopens both source generations and alignment without changing existing Note anchors", () => {
    const base = createProjectComparisonTemplate("surface-generation-study", "pc09-surface");
    const comparison = base.compositions![0]!;
    const note = createProjectComparisonNote(base, comparison, () => null, "Before and after", "The saddle changes sign.", 100, "observation-1");
    const project = parseMath3DProject(serializeMath3DProject(upsertMath3DProjectNote(base, note)));
    const reopened = project.notes![0]!;
    expect(reopened.anchor).toMatchObject({ kind: "comparison", compositionId: comparison.id, alignment: "not applicable",
      members: comparison.members.map(member => member.expected) });
    expect(inspectProjectComparisonNote(project, reopened, () => null).status).toBe("current");
    const evidence = createProjectComparisonEvidence(project, comparison, () => null);
    expect(evidence.observations).toMatchObject([{ title: "Before and after", body: "The saddle changes sign." }]);
    expect(projectComparisonEvidenceHtml(evidence, ["data:image/jpeg;base64,AA==", "data:image/jpeg;base64,AA=="]))
      .toContain("The saddle changes sign.");
    let index = 0;
    const workbook = createDefaultWorkbook(() => `pc09-book-${++index}`);
    const block = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!;
    block.visualize = { ...block.visualize!, comparison: createWorkbookComparisonReference(project, comparison) };
    const publication = notebookPublicationManifest([workbook], project, undefined, undefined, () => null);
    expect(notebookPublicationMarkdown(publication)).toContain("The saddle changes sign.");
    expect(notebookPublicationManifestHtml(publication)).toContain("The saddle changes sign.");
    const changed = upsertMath3DProjectComposition(project, { ...comparison, title: "Retitled comparison" });
    expect(inspectProjectComparisonNote(changed, reopened, () => null).status).toBe("stale");
    expect(() => createProjectComparisonEvidence(changed, changed.compositions![0]!, () => null)).toThrow(/observation is stale/i);
    const removed = { ...project, compositions: [] };
    expect(inspectProjectComparisonNote(removed, reopened, () => null).status).toBe("missing");
    const missingSource = { ...project, workspace: { ...project.workspace, entries: [] } };
    expect(inspectProjectComparisonNote(missingSource, reopened, () => null).status).toBe("missing");
  });

  it("records verified versus operator-asserted overlay without upgrading either claim", () => {
    const project = createProjectComparisonTemplate("coordinate-overlay-study", "pc09-overlay");
    const verified = project.compositions!.find(item => item.title === "Verified A/B overlay")!;
    const asserted = project.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    expect(createProjectComparisonNote(project, verified, () => null, "Verified", "Frames match.", 100, "v").anchor)
      .toMatchObject({ alignment: "source-declared match" });
    expect(createProjectComparisonNote(project, asserted, () => null, "Asserted", "Alignment assumed.", 100, "a").anchor)
      .toMatchObject({ alignment: "operator assertion" });
    expect(() => createProjectComparisonNote(project, { ...verified, title: "Unsaved edit" }, () => null, "Bad", "No.", 100, "bad"))
      .toThrow(/exact comparison/i);
  });

  it("refuses missing and tampered Mesh resources for save and reopen", () => {
    const { project: base, resources } = mobileMixedProjectFixture();
    const entries = ["mesh", "geometry"].map(module => base.workspace.entries.find(entry => entry.module === module)!);
    const composition: ProjectComposition = { id: "pc09:sidecar", title: "Mesh / Geometry", mode: "side-by-side",
      members: entries.map((entry, index) => ({ documentId: entry.expected.id, expected: entry.expected,
        visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1 })) as unknown as ProjectComposition["members"] };
    const project = upsertMath3DProjectComposition(base, composition);
    const read = (item: Parameters<typeof resources.bytes>[0]) => resources.bytes(item);
    const note = createProjectComparisonNote(project, composition, read, "Mesh pair", "Inspect A and B.", 100, "sidecar");
    const saved = parseMath3DProject(serializeMath3DProject(upsertMath3DProjectNote(project, note)));
    expect(inspectProjectComparisonNote(saved, saved.notes![0]!, read).status).toBe("current");
    const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" && item.owners.includes(entries[0]!.expected.id))!;
    const tampered = resources.bytes(requirement)!.slice(); tampered[0] ^= 1;
    const alteredRead = (item: typeof requirement) => item.id === requirement.id ? tampered : resources.bytes(item);
    expect(inspectProjectComparisonNote(saved, saved.notes![0]!, alteredRead).status).toBe("missing");
    expect(() => createProjectComparisonNote(project, composition, () => null, "Bad", "Missing.", 100, "missing")).toThrow(/buffer/i);
    expect(() => createProjectComparisonNote(project, composition, alteredRead, "Bad", "Tampered.", 100, "tampered")).toThrow(/checksum/i);
  });
});
