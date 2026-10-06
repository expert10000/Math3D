import { describe, expect, it } from "vitest";
import { instantiateMath3DProjectTemplate, structuralHash } from "@math3d/core";
import { createDefaultWorkbook, freezeWorkbookSnapshot, normalizeWorkbookSnapshotProvenance, validateWorkbookDependencies, type WorkbookViewSnapshot } from "@math3d/workbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "../projects/projectWorkbookBinding";

const view = { datasetRef: "catenoid", datasetKind: "param", viewerKind: "param", capturedAt: 0, colorMode: "mean", showWireframe: true, camera: { position: { x: 1, y: 2, z: 3 }, target: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 } } } as WorkbookViewSnapshot;
describe("WB06 frozen capture", () => {
  it("retains independent source/result hashes, selection, presentation and annotations across resource reopen", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "snapshot"), snapshot = freezeWorkbookSnapshot(view, project, undefined, undefined, { visible: true });
    const hash = structuralHash(snapshot); project.notes![0]!.body = "later edit"; view.camera!.position.x = 99;
    expect(structuralHash(snapshot)).toBe(hash); expect(snapshot.camera!.position.x).toBe(1);
    expect(snapshot.provenance!.annotations[0]!.body).not.toBe("later edit");
    const original = instantiateMath3DProjectTemplate("catenary-study", "snapshot");
    let n = 0; const book = createDefaultWorkbook(() => `s${++n}`); book.stages[2]!.blocks[0]!.visualize = { live: false, snapshotA: snapshot };
    const bound = prepareProjectWorkbook(original, book, "capture");
    expect(readProjectWorkbook(bound.bytes, bound.reference).stages[2]!.blocks[0]!.visualize!.snapshotA).toEqual(snapshot);
  });
  it("does not call metadata-only artifacts portable and rejects forged captures", () => {
    const project = instantiateMath3DProjectTemplate("catenary-study", "capture"), snapshot = freezeWorkbookSnapshot(view, project);
    expect(snapshot.provenance!.qualification).toContain("verified again at export");
    expect(freezeWorkbookSnapshot(view, null).provenance!.projectId).toBeNull();
    expect(() => normalizeWorkbookSnapshotProvenance({ ...snapshot.provenance, sources: [{ revision: 1 }] })).toThrow(/Invalid/);
    let n = 0; const book = createDefaultWorkbook(() => `s${++n}`); book.stages[2]!.blocks[0]!.visualize = { live: false, snapshotA: { ...snapshot, provenance: { ...snapshot.provenance!, schemaVersion: 2 } as never } };
    expect(() => validateWorkbookDependencies(book)).toThrow(/Invalid/);
  });
});
