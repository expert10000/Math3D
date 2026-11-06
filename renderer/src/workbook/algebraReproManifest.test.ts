import { describe, expect, it } from "vitest";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookAlgebraObjectCell, type WorkbookBlock } from "@math3d/workbook";
import { algebraReproManifestMarkdown, createAlgebraReproManifest, inspectAlgebraReproManifest,
  parseAlgebraReproManifest } from "./algebraReproManifest";

const setup = () => {
  let project = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
  { stableKey: "sage-h03", title: "Reproducible algebra" });
  const z = createAlgebraObjectRecord({ id: createProjectAlgebraObjectId(project.identity.id, "Z"),
    revision: 1, label: "Z", definition: { kind: "integer-ring" } });
  project = upsertMath3DProjectAlgebraObject(project, z);
  const request = buildAlgebraOperationRequest(project, { objectId: z.id, revision: 1 },
    "sage.numberTheory.gcd", "docker", { values: ["84", "30"] });
  const evidence = createProjectAlgebraEvidence(project.identity.id, project.algebraObjects ?? [], request,
    { value: "6" }, { engine: "sagemath", version: "10.10", backend: "docker",
      jobId: "h03gcd", elapsedMs: 8, warnings: [] });
  project = addMath3DProjectAlgebraEvidence(project, evidence);
  const book = createDefaultWorkbook(() => "h03-block");
  book.stages[1].blocks.push({ id: "algebra", type: "algebra-object", title: "Pinned Z",
    outputs: [{ id: "object", label: "Algebra object", type: "algebra-object" }],
    algebraObject: createWorkbookAlgebraObjectCell(project, z.id, 100) } as WorkbookBlock,
    { id: "trusted", type: "sage-code", title: "Trusted experiment",
      sageCode: { code: "throw new Error('must never execute on import')", runs: [] } } as WorkbookBlock);
  return { project, book, evidence, z };
};

describe("SAGE-H03 algebra reproducibility manifest", () => {
  it("exports exact definitions, request, hashes, Workbook sources and an inert trusted-code warning", () => {
    const { project, book, evidence, z } = setup();
    const manifest = createAlgebraReproManifest(project, [book]);
    const copy = parseAlgebraReproManifest(JSON.parse(JSON.stringify(manifest)));
    expect(copy.executionPolicy).toBe("inert-on-import");
    expect(copy.objects[0].revisions).toContainEqual(z);
    expect(copy.operations[0]).toMatchObject({ id: evidence.id, resultHash: evidence.resultHash, result: null,
      request: { operation: "sage.numberTheory.gcd", params: { values: ["84", "30"] } } });
    expect(copy.workbookBlocks.find((item) => item.blockId === "trusted")?.trustedCode).toContain("must never execute");
    expect(algebraReproManifestMarkdown(copy)).toContain("grant explicit local trust");
    expect(inspectAlgebraReproManifest(copy, parseMath3DProject(serializeMath3DProject(project))))
      .toMatchObject({ objects: 1, operations: 1, workbookBlocks: 2, trustedCodeBlocks: 1 });
    expect((globalThis as Record<string, unknown>).mustNeverExecute).toBeUndefined();
  });

  it("optionally includes checked result snapshots and rejects altered data or execution policy", () => {
    const { project, book } = setup();
    const manifest = createAlgebraReproManifest(project, [book], ["algebra"], true);
    expect(manifest.operations[0].result).toEqual({ value: "6" });
    expect(manifest.workbookBlocks).toHaveLength(1);
    expect(() => parseAlgebraReproManifest({ ...manifest, executionPolicy: "auto-run" })).toThrow();
    expect(() => parseAlgebraReproManifest({ ...manifest, operations: [{ ...manifest.operations[0],
      resultHash: "sha256:" + "0".repeat(64) }] })).toThrow();
  });
});
