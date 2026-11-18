import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject,
  serializeMath3DProject, upsertMath3DProjectWorkbook } from "@math3d/core";
import type { WorkbookQuantumStudyEvidence } from "@math3d/workbook";
import { admitVerifiedHydrogenStudy } from "./hydrogenStudyAdmission";
import { pinQuantumStudySample, quantumStudySelectionEvidence } from "./quantumStudySelection";
import { createQuantumStudySelectionWorkbook, inspectQuantumStudyWorkbookEvidence,
  normalizeQuantumStudyWorkbookEvidence, quantumStudyCitationTarget } from "./quantumStudyWorkbook";
import { prepareProjectWorkbook, readProjectWorkbook } from "./projectWorkbookBinding";

const directory = fileURLToPath(new URL("../../../tests/fixtures/quantum-scene-orbitals/orbital-2p.qscene", import.meta.url));
const scene = JSON.parse(readFileSync(fileURLToPath(new URL(
  "../../../tests/fixtures/quantum-scene-orbitals/orbital-2p.qscene/scene.json", import.meta.url)), "utf8"));
const fingerprint = "55379e422fa98bcb6f29ed1ac6380a34b6586face6070a37e1ca2436823526b5";
const opened = { ok: true as const, canceled: false as const, directory,
  reference: { directory, sceneFingerprint: fingerprint },
  document: { title: scene.title, extensions: { "quantum-scene/v1": { scene } } },
  remembered: false, mappedObjectIds: [], deferredObjectIds: [], deferredFieldIds: [] };

afterEach(() => vi.unstubAllGlobals());

describe("saved quantum selection Workbook citation", () => {
  it("retains hashes, units and values, then withholds changed selections or scene bytes", async () => {
    const api = { openReference: vi.fn(async () => opened), fieldSample: vi.fn(async (request: {
      quantity: "density" | "phase"; u: number; v: number; index: number }) => ({
      grid: [request.u, request.v, request.index], position: [4, 5, 10],
      value: request.quantity === "density" ? 0.25 : 1.5,
      unit: request.quantity === "density" ? "a0^-3" : "rad", undefinedNearNode: false,
    })) };
    vi.stubGlobal("window", { quantumScenes: api });
    const base = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
      results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
      { stableKey: "hydrogen-workbook-citation" });
    const admitted = await admitVerifiedHydrogenStudy(base, { reference: {
      format: "quantum-scene/v1", title: scene.title, directory, sceneFingerprint: fingerprint },
      runId: scene.provenance.runId, resultSha256: scene.provenance.resultSha256 }, async () => opened as any);
    const study = admitted.workspace.studies![0]!;
    const selected = parseMath3DProject(serializeMath3DProject(
      pinQuantumStudySample(admitted, study, "density", (4 * 21 + 5) * 21 + 10)));
    const report = await quantumStudySelectionEvidence(selected, selected.workspace.studies![0]!);
    expect(report.values.density).toMatchObject({ value: 0.25, unit: "a0^-3" });
    expect(report.values.phase).toMatchObject({ value: 1.5, unit: "rad" });
    const workbook = createQuantumStudySelectionWorkbook(selected, selected.workspace.studies![0]!,
      report as WorkbookQuantumStudyEvidence["snapshot"], "workbook-quantum-test", "selection-block");
    const prepared = prepareProjectWorkbook(selected, workbook, "quantum-citation");
    const withWorkbook = upsertMath3DProjectWorkbook(selected, prepared.reference);
    const reopened = parseMath3DProject(serializeMath3DProject(withWorkbook));
    const block = readProjectWorkbook(prepared.bytes, prepared.reference).stages[1]!.blocks[0]!;
    expect(normalizeQuantumStudyWorkbookEvidence(block.quantumStudyEvidence)?.snapshot.sources[0]?.datasets)
      .toEqual(expect.arrayContaining([expect.objectContaining({ id: "psi-real", unit: "a0^-3/2" })]));
    expect(await inspectQuantumStudyWorkbookEvidence(reopened, block.notebookReference, block.quantumStudyEvidence))
      .toMatchObject({ status: "current", report: { values: { density: { value: 0.25 } } } });
    expect(quantumStudyCitationTarget(reopened, block.notebookReference, block.quantumStudyEvidence))
      .toMatchObject({ projectId: reopened.identity.id, studyId: study.id });
    const moved = pinQuantumStudySample(reopened, reopened.workspace.studies![0]!, "phase", (5 * 21 + 5) * 21 + 10);
    expect(await inspectQuantumStudyWorkbookEvidence(moved, block.notebookReference, block.quantumStudyEvidence))
      .toMatchObject({ status: "withheld", report: null,
        omissions: [expect.stringMatching(/selection changed/i)] });
    expect(quantumStudyCitationTarget(moved, block.notebookReference, block.quantumStudyEvidence)).toBeNull();
    api.openReference.mockRejectedValueOnce(new Error("source hash changed"));
    const changed = await inspectQuantumStudyWorkbookEvidence(reopened, block.notebookReference, block.quantumStudyEvidence);
    expect(changed.status).toBe("withheld");
    expect(changed.report).toBeNull();
    expect(changed.omissions.join(" ")).toMatch(/source hash changed|values are withheld/i);
    expect(quantumStudyCitationTarget(reopened, block.notebookReference, block.quantumStudyEvidence))
      .toMatchObject({ studyId: study.id });
    api.fieldSample.mockImplementation(async request => ({
      grid: [request.u, request.v, request.index], position: [4, 5, 10],
      value: request.quantity === "density" ? 0 : null,
      unit: request.quantity === "density" ? "a0^-3" : "rad",
      undefinedNearNode: request.quantity === "phase",
    }));
    const nodeReport = await quantumStudySelectionEvidence(reopened, reopened.workspace.studies![0]!);
    const nodeWorkbook = createQuantumStudySelectionWorkbook(reopened, reopened.workspace.studies![0]!,
      nodeReport as WorkbookQuantumStudyEvidence["snapshot"], "workbook-node", "node-block");
    const nodeBlock = nodeWorkbook.stages[1]!.blocks[0]!;
    const nodeInspection = await inspectQuantumStudyWorkbookEvidence(reopened,
      nodeBlock.notebookReference, nodeBlock.quantumStudyEvidence);
    expect(nodeInspection.status).toBe("current");
    expect(nodeInspection.report?.values.phase).toBeUndefined();
    expect(nodeInspection.omissions).toContain("Phase is undefined at this complex node.");
  });

  it("keeps a node's undefined phase as an explicit omission", async () => {
    const marker = normalizeQuantumStudyWorkbookEvidence({ schemaVersion: 1,
      kind: "quantum-study-selection/v1", studyId: "study-node", selectionHash: `sha256:${"a".repeat(64)}`,
      snapshot: { schema: "math3d.quantum-study-selection-evidence/v1", studyId: "study-node",
        templateId: "hydrogen", runId: "run-node", resultSha256: "b".repeat(64),
        sources: ["density", "phase"].map(role => ({ role, sceneFingerprint: "c".repeat(64),
          datasets: [{ id: "psi-real", sha256: "d".repeat(64), unit: "a0^-3/2" }] })),
        values: { density: { value: 0, unit: "a0^-3" } },
        omissions: ["Phase is undefined at this complex node."] } });
    expect(marker?.snapshot.values.phase).toBeUndefined();
    expect(marker?.snapshot.omissions).toContain("Phase is undefined at this complex node.");
    expect(normalizeQuantumStudyWorkbookEvidence({ ...marker, selectionHash: "invalid" })).toBeNull();
  });
});
