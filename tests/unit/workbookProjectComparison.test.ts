import { describe, expect, it } from "vitest";
import { serializeMath3DProject, parseMath3DProject, upsertMath3DProjectComposition, type ProjectComposition } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookComparisonReference, inspectWorkbookComparisonReference,
  normalizeWorkbookComparisonReference, resolveWorkbookFreshness, validateWorkbookDependencies } from "@math3d/workbook";
import { mobileMixedProjectFixture } from "../fixtures/unified-projects/mobileProjects";
import { prepareProjectWorkbook, readProjectWorkbook } from "../../renderer/src/projects/projectWorkbookBinding";

const fixture = () => {
  const base = mobileMixedProjectFixture().project;
  const entries = ["mesh", "geometry"].map(module => base.workspace.entries.find(item => item.module === module)!);
  const composition: ProjectComposition = { id: "pc07:comparison", title: "Two saved sources", mode: "side-by-side",
    members: entries.map((entry, index) => ({ documentId: entry.expected.id, expected: entry.expected,
      visible: true, color: index ? "#e8793a" : "#3976d7", opacity: 1 })) as unknown as ProjectComposition["members"] };
  const project = upsertMath3DProjectComposition(base, composition);
  let counter = 0;
  const workbook = createDefaultWorkbook(() => `pc07-${++counter}`);
  const block = workbook.stages.find(stage => stage.id === "visualize")!.blocks[0]!;
  block.visualize = { ...block.visualize!, comparison: createWorkbookComparisonReference(project, composition) };
  return { project, workbook, block, composition };
};

describe("PC07 Workbook Visualize comparison", () => {
  it("stores an exact non-owning reference through Project Workbook persistence and restart", () => {
    const { project, workbook, block, composition } = fixture();
    validateWorkbookDependencies(workbook);
    const persisted = prepareProjectWorkbook(project, workbook, "pc07-test");
    const reopened = readProjectWorkbook(persisted.bytes, persisted.reference);
    const reference = reopened.stages.find(stage => stage.id === "visualize")!.blocks[0]!.visualize!.comparison!;
    expect(reference).toEqual(block.visualize!.comparison);
    expect(inspectWorkbookComparisonReference(parseMath3DProject(serializeMath3DProject(project)), reference)).toEqual({ status: "current", composition });
    expect(project.workspace).toEqual(mobileMixedProjectFixture().project.workspace);
    expect(JSON.stringify(reopened)).not.toContain("positions");
  });

  it("refuses a modified composition, missing member, and different Project without silently relinking", () => {
    const { project, workbook, block, composition } = fixture();
    const reference = block.visualize!.comparison!;
    expect(inspectWorkbookComparisonReference(upsertMath3DProjectComposition(project, { ...composition, title: "Edited" }), reference).status).toBe("stale");
    expect(inspectWorkbookComparisonReference({ ...project, workspace: { ...project.workspace,
      entries: project.workspace.entries.filter(item => item.expected.id !== composition.members[0].documentId) } }, reference).status).toBe("missing");
    expect(inspectWorkbookComparisonReference({ ...project, identity: { ...project.identity, id: "math3d:project:another" } }, reference).status).toBe("different-project");
    expect(resolveWorkbookFreshness(workbook, project).get(block.id)?.status).toBe("current");
    expect(resolveWorkbookFreshness(workbook, null).get(block.id)?.status).toBe("missing");
    expect(resolveWorkbookFreshness(workbook, upsertMath3DProjectComposition(project, { ...composition, title: "Edited" })).get(block.id)?.status).toBe("stale");
  });

  it("rejects malformed references at the Workbook boundary", () => {
    const { workbook, block } = fixture();
    expect(() => normalizeWorkbookComparisonReference({ ...block.visualize!.comparison!, compositionHash: "bad" })).toThrow();
    block.visualize!.comparison = { ...block.visualize!.comparison!, compositionHash: "bad" as never };
    expect(() => validateWorkbookDependencies(workbook)).toThrow(/comparison reference/i);
  });
});
