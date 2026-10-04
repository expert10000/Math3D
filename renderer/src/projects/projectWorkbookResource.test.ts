import { describe, expect, it } from "vitest";
import {
  canonicalJsonStringify, createEmptyGraph2DDocument, createGraph2DWorkspaceProject, createMath3DProject,
  createStableDocumentId, parseMath3DProject, projectResourceInventory, serializeMath3DProject,
  sha256Checksum, upsertMath3DProjectWorkbook, verifyProjectResourceBytes,
  captureProjectResources, exportProjectPackage, parseProjectPackage,
} from "@math3d/core";
import { createDefaultWorkbook } from "@math3d/workbook";

const fixture = () => {
  const base = createMath3DProject(createGraph2DWorkspaceProject(createEmptyGraph2DDocument("workbook-source")), { stableKey: "workbook-project", title: "Investigation" });
  let sequence = 0;
  const workbook = createDefaultWorkbook(() => `item-${++sequence}`);
  workbook.id = createStableDocumentId("workbook", { projectId: base.identity.id, sourceId: workbook.id });
  workbook.title = "Curvature study";
  const bytes = new TextEncoder().encode(canonicalJsonStringify(JSON.parse(JSON.stringify(workbook))));
  const reference = { id: workbook.id, title: workbook.title, revision: 1, checksum: sha256Checksum(bytes), byteLength: bytes.length };
  return { base, workbook, bytes, reference };
};

describe("WB00 Project-owned Workbook resources", () => {
  it("keeps legacy Projects byte-compatible until a Workbook is adopted", () => {
    const { base, reference } = fixture();
    const legacyBytes = serializeMath3DProject(base);
    expect(parseMath3DProject(legacyBytes)).toEqual(base);
    expect(base.workbooks).toBeUndefined();
    const bound = upsertMath3DProjectWorkbook(base, reference);
    expect(bound.identity.id).toBe(base.identity.id);
    expect(bound.identity.revision).toBe(base.identity.revision + 1);
    expect(bound.workspace).toEqual(base.workspace);
    expect(parseMath3DProject(serializeMath3DProject(bound))).toEqual(bound);
    expect(upsertMath3DProjectWorkbook(bound, reference)).toEqual(bound);
    expect(serializeMath3DProject(base)).toBe(legacyBytes);
  });

  it("round-trips the verified Workbook payload in a portable Project package", () => {
    const { base, bytes, reference } = fixture();
    const project = upsertMath3DProjectWorkbook(base, reference);
    const item = projectResourceInventory(project).find((entry) => entry.kind === "workbook-payload")!;
    expect(item).toMatchObject({ id: reference.id, checksum: reference.checksum, required: false });
    verifyProjectResourceBytes(item, bytes);
    const resources = captureProjectResources(project, (entry) => entry.kind === "workbook-payload" ? bytes : null, true);
    const restored = parseProjectPackage(exportProjectPackage(project, resources));
    expect(restored.project.workbooks).toEqual([reference]);
    expect(restored.resources.bytes(item)).toEqual(bytes);
    expect(() => verifyProjectResourceBytes(item, new TextEncoder().encode("{}"))).toThrow();
  });

  it("rejects a forged manifest or a payload for another Workbook", () => {
    const { base, workbook, bytes, reference } = fixture();
    const project = upsertMath3DProjectWorkbook(base, reference);
    expect(() => parseMath3DProject(JSON.stringify({ ...project, workbooks: [{ ...reference, checksum: "sha256:bad" }] }))).toThrow();
    expect(() => parseMath3DProject(JSON.stringify({ ...project, workbooks: [reference, reference] }))).toThrow();
    const item = projectResourceInventory(project).find((entry) => entry.kind === "workbook-payload")!;
    const other = new TextEncoder().encode(canonicalJsonStringify({ ...workbook, id: createStableDocumentId("workbook", "other") }));
    expect(() => verifyProjectResourceBytes(item, other)).toThrow();
    expect(bytes.length).toBe(reference.byteLength);
    const empty = captureProjectResources(project, () => null, true);
    expect(() => exportProjectPackage(project, empty)).toThrow("Workbook resource");
    const incompletePackage = JSON.stringify({ format: "math3d.project-package", schemaVersion: 1, project, resources: [] });
    expect(() => parseProjectPackage(incompletePackage)).toThrow("Workbook resource");
  });
});
