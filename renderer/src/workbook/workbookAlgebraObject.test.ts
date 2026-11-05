import { describe, expect, it } from "vitest";
import { captureProjectResources, createAlgebraObjectRecord, createMath3DProject, createMixedWorkspaceDocument,
  createProjectAlgebraObjectId, exportProjectPackage, parseProjectPackage, projectResourceInventory,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createBlockDependencySource, createDefaultWorkbook, createWorkbookAlgebraObjectCell,
  inspectWorkbookAlgebraObjectCell, parseWorkbookAlgebraObjectCell, recomputeWorkbookAlgebraObjectCell,
  resolveWorkbookFreshness, validateWorkbookDependencies, workbookBlockSourceHash,
  type WorkbookBlock } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";
import { notebookPublicationManifest, notebookPublicationMarkdown } from "./notebookPublication";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-f04-workbook", title: "Algebra Workbook" });
  const qq = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "QQ"),
    revision: 1, label: "QQ", definition: { kind: "rational-field" } });
  project = upsertMath3DProjectAlgebraObject(project, qq);
  const ring = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "R"),
    revision: 1, label: "R", definition: { kind: "polynomial-ring",
      coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"], monomialOrder: "degrevlex" } });
  project = upsertMath3DProjectAlgebraObject(project, ring);
  let index = 0;
  const workbook = createDefaultWorkbook(() => `f04-block-${++index}`);
  const algebra: WorkbookBlock = { id: "algebra", type: "algebra-object", title: "Pinned R",
    outputs: [{ id: "object", label: "Algebra object", type: "algebra-object" }],
    algebraObject: createWorkbookAlgebraObjectCell(project, ring.id, 100) };
  const downstream: WorkbookBlock = { id: "downstream", type: "text", title: "Interpretation", text: "Study R",
    inputs: [{ id: "object", label: "Algebra object", type: "algebra-object" }] };
  workbook.stages[1].blocks.push(algebra, downstream);
  workbook.dependencies = [{ id: "ring-link", targetBlockId: downstream.id,
    source: { ...createBlockDependencySource(workbook, algebra.id), outputPortId: "object", inputPortId: "object" } }];
  return { project, qq, ring, workbook, algebra, downstream };
};

describe("SAGE-F04 typed algebra object Workbook cells", () => {
  it("pins exact output refs and marks dependent cells stale until a bounded recompute", () => {
    let { project, qq, ring, workbook, algebra, downstream } = setup();
    validateWorkbookDependencies(workbook);
    expect(algebra.algebraObject?.runs[0].output).toMatchObject({ type: "algebra-object",
      objectKind: "polynomial-ring", ref: { objectId: ring.id, revision: 1 }, record: ring });
    expect(resolveWorkbookFreshness(workbook, project).get(algebra.id)?.status).toBe("current");
    expect(resolveWorkbookFreshness(workbook, project).get(downstream.id)?.status).toBe("current");
    const revised = createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R lex",
      definition: { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
        variables: ["x", "y"], monomialOrder: "lex" } });
    project = upsertMath3DProjectAlgebraObject(project, revised);
    expect(inspectWorkbookAlgebraObjectCell(project, algebra.algebraObject!).status).toBe("stale");
    expect(resolveWorkbookFreshness(workbook, project).get(downstream.id)?.status).toBe("stale");
    algebra.algebraObject = recomputeWorkbookAlgebraObjectCell(project, algebra.algebraObject!, 200);
    expect(algebra.algebraObject.runs.map((run) => run.source.revision)).toEqual([1, 2]);
    expect(algebra.algebraObject.runs[0].output.record).toEqual(ring);
    expect(algebra.algebraObject.runs[1].output.record).toEqual(revised);
    expect(resolveWorkbookFreshness(workbook, project).get(algebra.id)?.status).toBe("current");
    expect(resolveWorkbookFreshness(workbook, project).get(downstream.id)?.status).toBe("stale");
    workbook.dependencies = [{ ...workbook.dependencies![0], source: {
      kind: "block", blockId: algebra.id, sourceHash: workbookBlockSourceHash(algebra),
      outputPortId: "object", inputPortId: "object" } }];
    expect(resolveWorkbookFreshness(workbook, project).get(downstream.id)?.status).toBe("current");
    expect(recomputeWorkbookAlgebraObjectCell(project, algebra.algebraObject, 300)).toEqual(algebra.algebraObject);
  });

  it("exports a Project Workbook resource and independently imports exact typed output", () => {
    const { project, workbook, algebra, ring } = setup();
    const prepared = prepareProjectWorkbook(project, workbook, "f04-adoption");
    const bound = upsertMath3DProjectWorkbook(project, prepared.reference);
    const resources = captureProjectResources(bound,
      (item) => item.kind === "workbook-payload" ? prepared.bytes : null, true);
    const imported = parseProjectPackage(exportProjectPackage(bound, resources));
    const item = projectResourceInventory(imported.project).find((entry) => entry.kind === "workbook-payload")!;
    const reopened = readProjectWorkbook(imported.resources.bytes(item)!, imported.project.workbooks![0]);
    const cell = reopened.stages[1].blocks.find((block) => block.id === algebra.id)!.algebraObject!;
    expect(parseWorkbookAlgebraObjectCell(cell)).toEqual(algebra.algebraObject);
    expect(cell.runs[0].output.record).toEqual(ring);
    expect(inspectWorkbookAlgebraObjectCell(imported.project, cell).status).toBe("current");
    const manifest = notebookPublicationManifest([reopened], imported.project);
    expect(manifest.blocks.find((block) => block.blockId === algebra.id)?.algebraObject?.outputHash).toBe(cell.runs[0].outputHash);
    expect(notebookPublicationMarkdown(manifest)).toContain(ring.contentHash);
  });

  it("rejects altered definitions, forged output hashes and incompatible output ports", () => {
    const { workbook, algebra } = setup();
    const cell = algebra.algebraObject!;
    expect(() => parseWorkbookAlgebraObjectCell({ ...cell,
      runs: [{ ...cell.runs[0], outputHash: "sha256:" + "0".repeat(64) }] })).toThrow();
    expect(() => parseWorkbookAlgebraObjectCell({ ...cell,
      runs: [{ ...cell.runs[0], output: { ...cell.runs[0].output, objectKind: "integer-ring" } }] })).toThrow();
    workbook.stages[1].blocks[1].inputs = [{ id: "object", label: "Wrong", type: "mesh" }];
    expect(() => validateWorkbookDependencies(workbook)).toThrow(/incompatible/);
  });
});
