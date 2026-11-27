import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it, vi } from "vitest";
import { createMath3DProject, createMixedWorkspaceDocument, createProjectStudyFromDocuments,
  createQuantumStudyFromTemplate, normalizeQuantumStudyDocument, parseMath3DProject,
  relinkMath3DProjectQuantumScene, replaceMath3DProjectWorkspace, serializeMath3DProject,
  upsertMath3DProjectQuantumScene } from "@math3d/core";
import type { WorkbookQuantumStudyEvidence } from "@math3d/workbook";
import { quantumSceneDocumentFromVerifiedOpen } from "./quantumSceneAdmission";
import { pinQuantumStudySample, quantumStudyRecord, quantumStudySelectionEvidence } from "./quantumStudySelection";
import { createQuantumStudySelectionWorkbook, normalizeQuantumStudyWorkbookEvidence } from "./quantumStudyWorkbook";
import { openQuantumProjectPack, writeQuantumProjectPack } from "../../../src/main/quantumScene/portableProject";
import { importQuantumSceneBundle } from "../../../src/main/quantumScene/importer";
import { sceneFingerprint } from "../../../src/main/quantumScene/recent";
import { inspectVerifiedUte2ReducedBdgSample, inspectVerifiedUte2LatticeBdgSample } from
  "../../../src/main/quantumScene/ute2BdgSample";

const fixtures = [
  { name: "ute2-bdg-826c7f692ef5569b4d169a6a.qscene", fingerprint: "2ba7939bce8443fc735d41c40f82f2a7e74e5f5afbfe9a371a74a33ed20456f7",
    template: "ute2-bdg" as const, role: "spectrum" as const, objectId: "positive", index: 25 },
  { name: "ute2-lattice-9838f91e539472e71ee9655b.qscene", fingerprint: "54a348c9dfc84deeda14a982db273faf13964788fb89e515d528961237d5c392",
    template: "ute2-lattice" as const, role: "energy" as const, objectId: "positive-energy", index: 8 },
];
afterEach(() => vi.unstubAllGlobals());

for (const fixture of fixtures) it(`saves ${fixture.template} selection, citation and withheld source`, async () => {
  const directory = fileURLToPath(new URL(`../../../tests/fixtures/quantum-ute2/${fixture.name}`, import.meta.url));
  const scene = JSON.parse(readFileSync(fileURLToPath(new URL(`../../../tests/fixtures/quantum-ute2/${fixture.name}/scene.json`, import.meta.url)), "utf8"));
  const reference = { format: "quantum-scene/v1" as const, title: scene.title, directory,
    sceneFingerprint: fixture.fingerprint };
  const opened = { ok: true as const, canceled: false as const, directory,
    reference: { directory, sceneFingerprint: fixture.fingerprint },
    document: { title: scene.title, extensions: { "quantum-scene/v1": { scene } } },
    remembered: false, mappedObjectIds: scene.objects.map((item: { id: string }) => item.id),
    deferredObjectIds: [], deferredFieldIds: [] };
  const document = quantumSceneDocumentFromVerifiedOpen(opened as any);
  const template = createQuantumStudyFromTemplate(fixture.template, document, [document]);
  expect(template.panels.map(panel => panel.role)).toEqual(fixture.template === "ute2-bdg" ?
    ["spectrum"] : ["energy", "gap", "pairing"]);
  expect(normalizeQuantumStudyDocument(template, [document]).ok).toBe(true);
  const base = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
    { stableKey: `ute2-${fixture.template}-project` });
  const linked = upsertMath3DProjectQuantumScene(base, reference);
  const staged = replaceMath3DProjectWorkspace(linked, createMixedWorkspaceDocument({ ...linked.workspace,
    entries: [{ module: "quantum" as const, checkpoint: document, expected: document.identity, replay: null }],
    activeDocumentIds: [document.identity.id], quantumStudies: [template] }));
  const withStudy = createProjectStudyFromDocuments(staged, [fixture.template, scene.provenance.runId],
    template.title, [document.identity.id]);
  const reopened = parseMath3DProject(serializeMath3DProject(withStudy));
  const study = reopened.workspace.studies![0]!;
  expect(quantumStudyRecord(reopened, study)?.templateId).toBe(fixture.template);
  const selected = pinQuantumStudySample(reopened, study, fixture.role, fixture.index, fixture.objectId);
  expect(selected.workspace.quantumStudies![0]!.panels.every(panel => panel.sampleIndex === fixture.index)).toBe(true);
  const reduced = { fingerprint: fixture.fingerprint, runId: scene.provenance.runId,
    resultSha256: scene.provenance.resultSha256, sampleIndex: fixture.index, model: "reduced_bdg_2x2",
    coordinate: { xi: 0, unit: "dimensionless", meaning: "dispersion parameter, not momentum" },
    energies: { negative: 0, positive: 0, unit: "dimensionless" }, gapMagnitude: 0,
    pairingPhaseRad: null, sampledNode: true, electronWeight: null, holeWeight: null,
    qualification: "producer-supplied reduced Nambu sector sample" };
  const lattice = { fingerprint: fixture.fingerprint, runId: scene.provenance.runId,
    resultSha256: scene.provenance.resultSha256, sampleIndex: fixture.index, model: "square_lattice_px_py",
    momentum: { kx: -Math.PI, ky: 0, unit: "rad/a" },
    energy: { xi: 0, negative: 0, positive: 0, unit: "t=1" },
    pairing: { real: 0, imaginary: 0, magnitude: 0, phaseRad: null, phaseDefined: false },
    coherence: { electronWeight: null, holeWeight: null, defined: false }, sampledNode: true,
    grid: { size: 16, order: "kx-major/ky-minor", domain: "[-pi,pi)" },
    qualification: "producer-supplied finite-grid spinless lattice toy sample" };
  const api = { openReference: vi.fn(async () => opened),
    ute2ReducedBdgSample: vi.fn(async () => reduced), ute2LatticeBdgSample: vi.fn(async () => lattice) };
  vi.stubGlobal("window", { quantumScenes: api });
  const report = await quantumStudySelectionEvidence(selected, selected.workspace.studies![0]!);
  expect(Object.keys(report.values)).toEqual(fixture.template === "ute2-bdg" ? ["spectrum"] : ["energy", "gap", "pairing"]);
  expect(report.omissions).toContainEqual(expect.stringMatching(/undefined/i));
  const workbook = createQuantumStudySelectionWorkbook(selected, selected.workspace.studies![0]!,
    report as WorkbookQuantumStudyEvidence["snapshot"], "bdg-workbook", "bdg-selection");
  const citation = workbook.stages[1]!.blocks[0]!.quantumStudyEvidence;
  expect(normalizeQuantumStudyWorkbookEvidence(citation)?.snapshot.sources).toHaveLength(template.panels.length);
  const root = await mkdtemp(join(tmpdir(), "m3d-ute2-bdg-transfer-"));
  try {
    const portable = relinkMath3DProjectQuantumScene(selected, fixture.fingerprint,
      `scenes/${fixture.fingerprint}.qscene`);
    const pack = join(root, "source.qpack");
    await writeQuantumProjectPack(serializeMath3DProject(portable), selected.quantumScenes!, pack);
    const openedPack = await openQuantumProjectPack(pack, join(root, "new-host-cache"));
    let restored = parseMath3DProject(openedPack.projectJson);
    for (const item of openedPack.references)
      restored = relinkMath3DProjectQuantumScene(restored, item.sceneFingerprint, item.directory);
    restored = parseMath3DProject(serializeMath3DProject(restored));
    expect(quantumStudyRecord(restored, restored.workspace.studies![0]!)?.templateId).toBe(fixture.template);
    expect(restored.workspace.quantumStudies![0]!.panels.every(panel => panel.sampleIndex === fixture.index)).toBe(true);
    const imported = await importQuantumSceneBundle(restored.quantumScenes![0]!.directory);
    expect(sceneFingerprint(imported)).toBe(fixture.fingerprint);
    const request = { fingerprint: fixture.fingerprint, sampleIndex: fixture.index };
    const transferred = fixture.template === "ute2-bdg" ?
      inspectVerifiedUte2ReducedBdgSample(imported, request) : inspectVerifiedUte2LatticeBdgSample(imported, request);
    expect(transferred.sampleIndex).toBe(fixture.index);
  } finally { await rm(root, { recursive: true, force: true }); }
  api.openReference.mockRejectedValueOnce(new Error("source bytes changed"));
  const withheld = await quantumStudySelectionEvidence(selected, selected.workspace.studies![0]!);
  expect(withheld.values).toEqual({});
  expect(withheld.omissions).toContainEqual(expect.stringMatching(/source verification failed/i));
});
