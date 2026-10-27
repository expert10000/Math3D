import { describe, expect, it } from "vitest";
import { parseMath3DProject, serializeMath3DProject, upsertMath3DProjectComposition } from "@math3d/core";
import { createProjectComparisonTemplate } from "../../packages/core/src/projectComparisonTemplates";
import { createProjectComparisonEvidence, projectComparisonEvidenceHtml } from "../../renderer/src/projects/projectComparisonEvidence";
import { createDefaultWorkbook, createWorkbookComparisonReference } from "@math3d/workbook";
import { createPortableNotebookPublication, inspectPortableNotebookPublication, notebookPublicationManifest, notebookPublicationManifestHtml, notebookPublicationMarkdown } from "../../renderer/src/workbook/notebookPublication";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { captureProjectResources, projectResourceInventory } from "../../renderer/src/projects/projectResources";
import type { ProjectComposition } from "@math3d/core";

const jpeg = "data:image/jpeg;base64,AA==";
const starter = (kind: "coordinate-overlay-study" | "surface-generation-study") =>
  createProjectComparisonTemplate(kind, `pc08-${kind}`);

describe("PC08 checked comparison evidence", () => {
  it("reports both exact Surface generations and a selected local value after restart", () => {
    const project = parseMath3DProject(serializeMath3DProject(starter("surface-generation-study")));
    const comparison = project.compositions![0]!;
    const selected = { memberId: comparison.members[0].documentId, revision: comparison.members[0].expected.revision,
      hash: comparison.members[0].expected.structuralHash, point: { x: 0.25, y: -0.5, z: 0.0625 }, uv: { u: 0.25, v: -0.5 } };
    const evidence = createProjectComparisonEvidence(project, comparison, () => null, selected);
    expect(evidence.members.map(member => member.generation)).toEqual(["retained checkpoint", "current"]);
    expect(evidence.members.map(member => member.structuralHash)).toEqual(comparison.members.map(member => member.expected.structuralHash));
    expect(evidence.alignment).toBe("not applicable");
    expect(evidence.selection?.uv).toEqual(selected.uv);
    const html = projectComparisonEvidenceHtml(evidence, [jpeg, jpeg]);
    expect(html).toContain("source-defined surface chart");
    expect(html).toContain(comparison.members[0].expected.structuralHash);
    expect((html.match(/<img /g) ?? []).length).toBe(2);
  });

  it("qualifies declared and operator-asserted overlays, and refuses missing or mismatched source", () => {
    const project = starter("coordinate-overlay-study");
    const verified = project.compositions!.find(item => item.title === "Verified A/B overlay")!;
    const asserted = project.compositions!.find(item => item.title === "Unverified A/D overlay")!;
    expect(createProjectComparisonEvidence(project, verified!, () => null).alignment).toBe("source-declared match");
    const legacy = createProjectComparisonEvidence(project, asserted!, () => null);
    expect(legacy.alignment).toBe("operator assertion");
    expect(projectComparisonEvidenceHtml(legacy, [jpeg])).toContain("operator assertion");
    const missing = { ...project, workspace: { ...project.workspace, entries: project.workspace.entries.filter(entry => entry.expected.id !== verified!.members[0].documentId) } };
    expect(() => createProjectComparisonEvidence(missing, verified!, () => null)).toThrow(/missing/i);
    const mismatch = upsertMath3DProjectComposition(project, { ...verified!, alignment: { frame: "laboratory xyz", unit: "cm" } });
    expect(() => createProjectComparisonEvidence(mismatch, mismatch.compositions!.find(item => item.id === verified!.id)!, () => null)).toThrow(/mismatched/i);
  });

  it("refuses unsaved changes, tampered source generations, invalid selection and missing captures", () => {
    const project = starter("surface-generation-study"), comparison = project.compositions![0]!;
    expect(() => createProjectComparisonEvidence(project, { ...comparison, title: "edited" }, () => null)).toThrow(/exact comparison/i);
    const changed = { ...project, workspace: { ...project.workspace, entries: project.workspace.entries.map(entry => ({ ...entry,
      expected: { ...entry.expected, structuralHash: "sha256:" + "0".repeat(64) as typeof entry.expected.structuralHash } })) } };
    expect(() => createProjectComparisonEvidence(changed, comparison, () => null)).toThrow(/verification|revision|diverged/i);
    expect(() => createProjectComparisonEvidence(project, comparison, () => null, { memberId: "missing", revision: 1,
      hash: comparison.members[0].expected.structuralHash, point: { x: 0, y: 0, z: 0 } })).toThrow(/selected value/i);
    const evidence = createProjectComparisonEvidence(project, comparison, () => null);
    expect(() => projectComparisonEvidenceHtml(evidence, [jpeg])).toThrow(/captures/i);
  });

  it("includes an exact Workbook report section and refuses a stale or missing linked source", () => {
    const project = starter("surface-generation-study"), composition = project.compositions![0]!;
    let n = 0; const workbook = createDefaultWorkbook(() => `pc08-${++n}`);
    const block = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!;
    block.visualize = { ...block.visualize!, comparison: createWorkbookComparisonReference(project, composition) };
    const manifest = notebookPublicationManifest([workbook], project, undefined, undefined, () => null);
    expect(manifest.blocks.find(item => item.blockId === block.id)?.comparison?.members.map(item => item.revision)).toEqual([1, 2]);
    expect(notebookPublicationMarkdown(manifest)).toContain("Saved Project comparison");
    expect(notebookPublicationManifestHtml(manifest)).toContain('data-comparison-evidence');
    const edited = upsertMath3DProjectComposition(project, { ...composition, title: "changed" });
    expect(() => notebookPublicationManifest([workbook], edited, undefined, undefined, () => null)).toThrow(/stale/i);
    expect(() => notebookPublicationManifest([workbook], project)).toThrow(/verified source bytes/i);
    const resources = captureProjectResources(project, () => null);
    const portable = createPortableNotebookPublication(project, [workbook], resources, undefined, () => null);
    expect(inspectPortableNotebookPublication(portable).project.compositions?.[0]?.id).toBe(composition.id);
    const altered = { ...portable, manifest: { ...portable.manifest, blocks: portable.manifest.blocks.map(item =>
      item.comparison ? { ...item, comparison: { ...item.comparison, compositionHash: "altered" } } : item) } };
    expect(() => inspectPortableNotebookPublication(altered as typeof portable)).toThrow(/checksum/i);
  });

  it("refuses missing and altered Mesh sidecar bytes before producing a report", () => {
    const { project: base, resources } = mobileMixedProjectFixture();
    const sources = ["mesh", "geometry"].map(module => base.workspace.entries.find(entry => entry.module === module)!);
    const composition: ProjectComposition = { id: "pc08:sidecar", title: "Mesh and Geometry", mode: "side-by-side",
      members: sources.map((entry, index) => ({ documentId: entry.expected.id, expected: entry.expected, visible: true,
        color: index ? "#e8793a" : "#3976d7", opacity: 1 })) as unknown as ProjectComposition["members"] };
    const project = upsertMath3DProjectComposition(base, composition);
    const requirement = projectResourceInventory(project).find(item => item.kind === "mesh-buffers" && item.owners.includes(sources[0].expected.id))!;
    expect(createProjectComparisonEvidence(project, composition, item => resources.bytes(item)).members).toHaveLength(2);
    expect(() => createProjectComparisonEvidence(project, composition, () => null)).toThrow(/buffer is unavailable/i);
    const tampered = resources.bytes(requirement)!.slice(); tampered[0] ^= 1;
    expect(() => createProjectComparisonEvidence(project, composition, item => item.id === requirement.id ? tampered : resources.bytes(item))).toThrow(/checksum/i);
  });
});
