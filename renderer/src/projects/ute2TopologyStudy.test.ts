import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createProjectStudyFromDocuments,
  createQuantumStudyFromTemplate, normalizeQuantumStudyDocument, parseMath3DProject,
  replaceMath3DProjectWorkspace, serializeMath3DProject, upsertMath3DProjectQuantumScene } from "@math3d/core";
import type { WorkbookQuantumStudyEvidence } from "@math3d/workbook";
import { quantumSceneDocumentFromVerifiedOpen } from "./quantumSceneAdmission";
import { pinQuantumStudySample, quantumStudyRecord, quantumStudySelectionEvidence } from "./quantumStudySelection";
import { createQuantumStudySelectionWorkbook, normalizeQuantumStudyWorkbookEvidence } from "./quantumStudyWorkbook";
import { importQuantumSceneBundle } from "../../../src/main/quantumScene/importer";
import { sceneFingerprint } from "../../../src/main/quantumScene/recent";
import { inspectVerifiedUte2TopologyReceipt, inspectVerifiedUte2EdgeReceipt } from "../../../src/main/quantumScene/ute2TopologyReceipt";

const fixtures = [
  { name: "ute2-topology-e01f7946b06ec3b8c1cdc9f2.qscene", status: "defined", chern: -1 },
  { name: "ute2-topology-8c7e1adb52adbf67f3a985ba.qscene", status: "defined", chern: 0 },
  { name: "ute2-topology-36afb5533e86e41cb5f62e02.qscene", status: "gap_closed", chern: null },
  { name: "ute2-topology-fa1a88ef616dc7e78163c7e9.qscene", status: "mesh_unresolved", chern: null },
] as const;
afterEach(() => vi.unstubAllGlobals());

for (const fixture of fixtures) it(`keeps ${fixture.status} class-D receipt through Project and Workbook`, async () => {
  const directory = fileURLToPath(new URL(`../../../tests/fixtures/quantum-ute2/${fixture.name}`, import.meta.url));
  const scene = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/quantum-ute2/${fixture.name}/scene.json`, import.meta.url)), "utf8"));
  const imported = await importQuantumSceneBundle(directory), fingerprint = sceneFingerprint(imported);
  const reference = { format: "quantum-scene/v1" as const, title: scene.title, directory, sceneFingerprint: fingerprint };
  const opened = { ok: true as const, canceled: false as const, directory,
    reference: { directory, sceneFingerprint: fingerprint },
    document: { title: scene.title, extensions: { "quantum-scene/v1": { scene } } },
    remembered: false, mappedObjectIds: scene.objects.map((item: { id: string }) => item.id),
    deferredObjectIds: [], deferredFieldIds: [] };
  const document = quantumSceneDocumentFromVerifiedOpen(opened as any);
  const template = createQuantumStudyFromTemplate("ute2-topology", document, [document]);
  expect(template.panels.map(panel => panel.role)).toEqual(["receipt"]);
  expect(normalizeQuantumStudyDocument(template, [document]).ok).toBe(true);
  const base = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
    { stableKey: `ute2-topology-${fixture.name}` });
  const linked = upsertMath3DProjectQuantumScene(base, reference);
  const staged = replaceMath3DProjectWorkspace(linked, createMixedWorkspaceDocument({ ...linked.workspace,
    entries: [{ module: "quantum" as const, checkpoint: document, expected: document.identity, replay: null }],
    activeDocumentIds: [document.identity.id], quantumStudies: [template] }));
  let withStudy = createProjectStudyFromDocuments(staged, ["ute2-topology", scene.provenance.runId],
    template.title, [document.identity.id]);
  let edgeOpened: typeof opened | null = null;
  let edgeReceipt: ReturnType<typeof inspectVerifiedUte2EdgeReceipt> | null = null;
  if (fixture.chern === -1) {
    const edgeName = "ute2-edge-2c6dc075ccd12bc67ac92b2d.qscene";
    const edgeDirectory = fileURLToPath(new URL(`../../../tests/fixtures/quantum-ute2/${edgeName}`, import.meta.url));
    const edgeScene = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/quantum-ute2/${edgeName}/scene.json`, import.meta.url)), "utf8"));
    const edgeImported = await importQuantumSceneBundle(edgeDirectory), edgeFingerprint = sceneFingerprint(edgeImported);
    edgeOpened = { ...opened, directory: edgeDirectory, reference: { directory: edgeDirectory,
      sceneFingerprint: edgeFingerprint }, document: { title: edgeScene.title,
      extensions: { "quantum-scene/v1": { scene: edgeScene } } },
      mappedObjectIds: edgeScene.objects.map((item: { id: string }) => item.id) };
    const edgeDocument = quantumSceneDocumentFromVerifiedOpen(edgeOpened as any);
    withStudy = upsertMath3DProjectQuantumScene(withStudy, { format: "quantum-scene/v1",
      title: edgeScene.title, directory: edgeDirectory, sceneFingerprint: edgeFingerprint });
    withStudy = replaceMath3DProjectWorkspace(withStudy, createMixedWorkspaceDocument({ ...withStudy.workspace,
      entries: [...withStudy.workspace.entries, { module: "quantum" as const, checkpoint: edgeDocument,
        expected: edgeDocument.identity, replay: null }],
      activeDocumentIds: [...withStudy.workspace.activeDocumentIds, edgeDocument.identity.id] }));
    edgeReceipt = inspectVerifiedUte2EdgeReceipt(edgeImported, { fingerprint: edgeFingerprint });
  }
  const reopened = parseMath3DProject(serializeMath3DProject(withStudy));
  const study = reopened.workspace.studies![0]!;
  expect(quantumStudyRecord(reopened, study)?.templateId).toBe("ute2-topology");
  const selected = pinQuantumStudySample(reopened, study, "receipt", 0, "bulk-receipt");
  const receipt = inspectVerifiedUte2TopologyReceipt(imported, { fingerprint });
  const api = { openReference: vi.fn(async (request: { sceneFingerprint: string }) =>
    request.sceneFingerprint === fingerprint ? opened : edgeOpened!),
    ute2TopologyReceipt: vi.fn(async () => receipt), ute2EdgeReceipt: vi.fn(async () => edgeReceipt!) };
  vi.stubGlobal("window", { quantumScenes: api });
  const report = await quantumStudySelectionEvidence(selected, selected.workspace.studies![0]!);
  expect((report.values.receipt as typeof receipt).status).toBe(fixture.status);
  expect((report.values.receipt as typeof receipt).chern).toBe(fixture.chern);
  if (fixture.chern === -1) expect((report.values.edge as typeof edgeReceipt)?.source.bulkResultSha256)
    .toBe(receipt.resultSha256);
  if (fixture.chern === null) expect(report.omissions).toContainEqual(expect.stringMatching(/withheld/));
  const workbook = createQuantumStudySelectionWorkbook(selected, selected.workspace.studies![0]!,
    report as WorkbookQuantumStudyEvidence["snapshot"], "topology-workbook", "bulk-receipt");
  expect(normalizeQuantumStudyWorkbookEvidence(workbook.stages[1]!.blocks[0]!.quantumStudyEvidence)?.snapshot.values)
    .toEqual(report.values);
  api.openReference.mockRejectedValueOnce(new Error("source bytes changed"));
  const withheld = await quantumStudySelectionEvidence(selected, selected.workspace.studies![0]!);
  expect(withheld.values).toEqual({});
  expect(withheld.omissions).toContainEqual(expect.stringMatching(/source verification failed/i));
});
