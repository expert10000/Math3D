import { describe, expect, it } from "vitest";
import { captureProjectResources, createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  createProjectNote, inspectProjectNoteAnchor, projectResourceInventory, structuralHash, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createDefaultWorkbook } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";

const fixture = () => {
  const project = createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("workbook-binding")), { stableKey: "WB00", title: "Study" });
  let index = 0;
  const personal = createDefaultWorkbook(() => `block-${++index}`);
  return { project, personal };
};

describe("WB00 Project Workbook binding", () => {
  it("adopts a copy and reopens its blocks from a Project resource package", () => {
    const { project, personal } = fixture();
    const original = JSON.stringify(personal);
    const adopted = prepareProjectWorkbook(project, personal, "first-adoption");
    expect(adopted.adopted).toBe(true);
    expect(adopted.workbook.id).not.toBe(personal.id);
    expect(JSON.stringify(personal)).toBe(original);
    const bound = upsertMath3DProjectWorkbook(project, adopted.reference);
    const resources = captureProjectResources(bound, (item) => item.kind === "workbook-payload" ? adopted.bytes : null, true);
    const item = projectResourceInventory(bound).find((entry) => entry.kind === "workbook-payload")!;
    const reopened = readProjectWorkbook(resources.bytes(item)!, bound.workbooks![0]!);
    expect(reopened.stages).toEqual(personal.stages);
    expect(reopened.stages[0]!.blocks[0]!.id).toBe(personal.stages[0]!.blocks[0]!.id);
    const block = reopened.stages[0]!.blocks[0]!;
    const note = createProjectNote({ projectId: bound.identity.id, stableKey: "block-anchor", kind: "text", title: "Observation", body: "Linked block",
      createdAt: 100, anchor: { kind: "workbook-block", workbookId: adopted.reference.id, workbookRevision: adopted.reference.revision,
        blockId: block.id, blockHash: structuralHash(block) } });
    expect(inspectProjectNoteAnchor(note, { projectId: bound.identity.id, source: () => null,
      workbookBlock: (id, blockId) => id === reopened.id && blockId === block.id ? { revision: adopted.reference.revision, hash: structuralHash(block) } : null }).status).toBe("current");
  });

  it("keeps a bound identity and advances revision only when the Workbook changes", () => {
    const { project, personal } = fixture();
    const adopted = prepareProjectWorkbook(project, personal, "adoption");
    const bound = upsertMath3DProjectWorkbook(project, adopted.reference);
    const unchanged = prepareProjectWorkbook(bound, adopted.workbook, "ignored");
    expect(unchanged.adopted).toBe(false);
    expect(unchanged.reference).toEqual(adopted.reference);
    const edited = { ...adopted.workbook, title: "Updated study" };
    const changed = prepareProjectWorkbook(bound, edited, "ignored");
    expect(changed.workbook.id).toBe(adopted.workbook.id);
    expect(changed.reference.revision).toBe(2);
    expect(changed.reference.checksum).not.toBe(adopted.reference.checksum);
  });
});
