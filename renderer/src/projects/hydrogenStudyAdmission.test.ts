import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createMath3DProject, createMixedWorkspaceDocument, parseMath3DProject,
  serializeMath3DProject } from "@math3d/core";
import { admitVerifiedHydrogenStudy } from "./hydrogenStudyAdmission";

const directory = fileURLToPath(new URL("../../../tests/fixtures/quantum-scene-orbitals/orbital-2p.qscene", import.meta.url));
const scene = JSON.parse(readFileSync(fileURLToPath(new URL("../../../tests/fixtures/quantum-scene-orbitals/orbital-2p.qscene/scene.json", import.meta.url)), "utf8"));
const reference = { format: "quantum-scene/v1" as const, title: scene.title, directory,
  sceneFingerprint: "55379e422fa98bcb6f29ed1ac6380a34b6586face6070a37e1ca2436823526b5" };
const opened = { ok: true as const, canceled: false as const,
  directory, reference: { directory, sceneFingerprint: reference.sceneFingerprint },
  document: { title: scene.title, extensions: { "quantum-scene/v1": { scene } } },
  remembered: false, mappedObjectIds: [], deferredObjectIds: [], deferredFieldIds: [] };

it("creates a saved hydrogen scene and complex field Study with source Notes", async () => {
  const base = createMath3DProject(createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
    results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] }),
    { stableKey: "hydrogen-guided-study" });
  const request = { reference, runId: scene.provenance.runId, resultSha256: scene.provenance.resultSha256 };
  const staged = await admitVerifiedHydrogenStudy(base, request, async () => opened as any);
  const saved = parseMath3DProject(serializeMath3DProject(staged));
  expect(saved.workspace.entries.map(item => item.module)).toEqual(["quantum", "field"]);
  expect(saved.workspace.quantumStudies?.[0]?.templateId).toBe("hydrogen");
  expect(saved.workspace.quantumStudies?.[0]?.panels.map(item => item.role)).toEqual(["density", "phase"]);
  expect(saved.workspace.studies?.[0]?.members).toHaveLength(2);
  expect(saved.workspace.studies?.[0]?.description).toContain("phase");
  expect(saved.notes?.filter(item => item.title.startsWith("Hydrogen "))).toHaveLength(2);
  await expect(admitVerifiedHydrogenStudy(base, request, async () => ({ ...opened,
    reference: { ...opened.reference, sceneFingerprint: "f".repeat(64) } }) as any)).rejects.toThrow(/declared complex orbital/);
});
