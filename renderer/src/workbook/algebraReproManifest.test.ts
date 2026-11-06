import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { addMath3DProjectAlgebraEvidence, buildAlgebraOperationRequest, createAlgebraObjectRecord,
  createMath3DProject, createMixedWorkspaceDocument, createProjectAlgebraEvidence,
  createProjectAlgebraObjectId, parseMath3DProject, serializeMath3DProject,
  upsertMath3DProjectAlgebraObject, upsertMath3DProjectWorkbook } from "@math3d/core";
import { createDefaultWorkbook, createWorkbookAlgebraObjectCell, type WorkbookBlock } from "@math3d/workbook";
import { prepareProjectWorkbook } from "../projects/projectWorkbookBinding";
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
  let serial = 0;
  const book = createDefaultWorkbook(() => `h03-block-${++serial}`);
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

  it("checks supplied Workbook bytes against a pinned Project Workbook reference", () => {
    const { project, book } = setup();
    const adopted = prepareProjectWorkbook(project, book, "h07");
    const bound = upsertMath3DProjectWorkbook(project, adopted.reference);
    const manifest = createAlgebraReproManifest(bound, [adopted.workbook]);
    expect(inspectAlgebraReproManifest(manifest, bound, [adopted.workbook])).toMatchObject({
      workbookVerified: true, workbookProjectBound: true });
    const changed = JSON.parse(JSON.stringify(adopted.workbook));
    changed.stages[1].blocks.find((block: WorkbookBlock) => block.id === "trusted").sageCode.code = "2 + 2";
    expect(() => inspectAlgebraReproManifest(createAlgebraReproManifest(bound, [changed]), bound, [changed]))
      .toThrow(/does not match its Project reference/);
  });

  it("verifies exported JSON against an independent Project and Workbook with the standalone H07 command", () => {
    const { project, book } = setup();
    const directory = mkdtempSync(join(tmpdir(), "math3d-h07-"));
    try {
      const manifestFile = join(directory, "report.algebra.json"), projectFile = join(directory, "project.math3d"),
        workbookFile = join(directory, "workbook.json");
      const manifest = createAlgebraReproManifest(project, [book], undefined, true);
      writeFileSync(manifestFile, JSON.stringify(manifest));
      writeFileSync(projectFile, serializeMath3DProject(project));
      writeFileSync(workbookFile, JSON.stringify(book));
      const command = (extra: string[] = []) => spawnSync(process.execPath,
        ["scripts/check-sage-algebra-manifest.mjs", manifestFile, projectFile, "--workbook", workbookFile, ...extra],
        { cwd: resolve("."), encoding: "utf8", timeout: 30_000 });
      const good = command();
      expect(good.status, good.stderr).toBe(0);
      expect(JSON.parse(good.stdout)).toMatchObject({ status: "verified", objects: 1, operations: 1,
        workbookVerified: true, workbookProjectBound: false, trustedCodeBlocks: 1 });
      const changedBook = JSON.parse(JSON.stringify(book));
      changedBook.stages[1].blocks.find((block: WorkbookBlock) => block.id === "trusted").sageCode.code = "2 + 2";
      writeFileSync(workbookFile, JSON.stringify(changedBook));
      const changedWorkbook = command();
      expect(changedWorkbook.status).toBe(1);
      expect(changedWorkbook.stderr).toContain("Workbook blocks differ");
      writeFileSync(workbookFile, JSON.stringify(book));
      writeFileSync(projectFile, serializeMath3DProject(upsertMath3DProjectAlgebraObject(project,
        createAlgebraObjectRecord({ id: project.algebraObjects![0].id, revision: 2, label: "Changed Z",
          definition: { kind: "integer-ring" } }))));
      const changed = command();
      expect(changed.status).toBe(1);
      expect(changed.stderr).toContain("differs from the Project");
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
