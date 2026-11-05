import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMath3DProject, createMixedWorkspaceDocument, normalizeQuantumFieldDocument,
  normalizeScientificSceneManifest, parseMath3DProject, relocateQuantumFieldDocument,
  relinkMath3DProjectQuantumScene, replayMixedWorkspaceDocument, replaceMath3DProjectWorkspace,
  serializeMath3DProject } from "@math3d/core";
import { upsertMath3DProjectQuantumScene } from "@math3d/core";
import { importQuantumSceneBundle } from "../../../src/main/quantumScene/importer";
import { sceneFingerprint } from "../../../src/main/quantumScene/recent";
import { importQuantumFieldScientificManifest } from "../../../src/main/quantumScene/scientificManifest";
import { inspectVerifiedFieldSample } from "../../../src/main/quantumScene/fieldSlice";
import { quantumFieldDocumentFromVerifiedOpen, quantumSceneDocumentFromVerifiedOpen,
  verifyProjectQuantumSceneDocuments } from "../projects/quantumSceneAdmission";

const fixture = fileURLToPath(new URL("../../../tests/fixtures/quantum-scene-orbitals/orbital-2p.qscene", import.meta.url));
const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

describe("SSR-02 verified quantum field compatibility", () => {
  it("wraps the pinned 2p bytes, exact grid and source identity without changing the old importer", async () => {
    const old = await importQuantumSceneBundle(fixture);
    const { manifest, imported } = await importQuantumFieldScientificManifest(fixture);
    const checked = normalizeScientificSceneManifest(manifest);
    expect(checked.ok).toBe(true);
    expect(imported.source).toEqual(old.source);
    expect(imported.document.geometry).toEqual(old.document.geometry);
    expect(imported.document.metadata).toEqual(old.document.metadata);
    expect(imported.document.extensions).toEqual(old.document.extensions);
    expect(imported.arrays.get("psi-real")).toEqual(old.arrays.get("psi-real"));
    expect(imported.arrays.get("psi-imaginary")).toEqual(old.arrays.get("psi-imaginary"));
    expect(manifest.source.sha256).toBe(sceneFingerprint(old));
    expect(manifest.source.sha256).toBe("55379e422fa98bcb6f29ed1ac6380a34b6586face6070a37e1ca2436823526b5");
    expect(imported.document.metadata.sourceResultSha256).toBe(old.source.provenance.resultSha256);
    expect(manifest.resources.map(resource => resource.sha256)).toEqual(old.source.datasets.map(dataset => dataset.sha256));
    expect(manifest.resources.map(resource => resource.bytes)).toEqual(old.source.datasets.map(dataset => dataset.bytes));
    expect(manifest.coordinates[0]).toEqual({ id: "field-grid", kind: "cartesian",
      axes: [{ name: "x", unit: "a0" }, { name: "y", unit: "a0" }, { name: "z", unit: "a0" }],
      origin: [-16, -16, -16], spacing: [1.6, 1.6, 1.6], periodic: [false, false, false] });
    expect(manifest.datasets[0]).toMatchObject({ id: "wavefunction", semanticType: "complex-scalar-field",
      shape: [21, 21, 21], order: "last-axis-fastest", quantity: { unit: "a0^-3/2" },
      real: "psi-real", imaginary: "psi-imaginary" });
    expect(manifest.views[0].operation).toBe("complex-density/v1");
    expect(manifest.resources.every(resource => !Object.hasOwn(resource, "values"))).toBe(true);
    const bundle = JSON.parse(await readFile(join(fixture, "bundle.json"), "utf8"));
    const sourceBytes = await readFile(join(fixture, "scene.json"));
    expect(createHash("sha256").update(sourceBytes).digest("hex")).toBe(bundle.scene.sha256);
  });

  it("refuses modified resource or scene metadata before adapting", async () => {
    const root = await mkdtemp(join(tmpdir(), "m3d-ssr02-"));
    temporary.push(root);
    const directory = join(root, "orbital-2p.qscene");
    await cp(fixture, directory, { recursive: true });
    const path = join(directory, "psi-real.f64");
    const original = await readFile(path);
    const changed = Buffer.from(original);
    changed[0] ^= 1;
    await writeFile(path, changed);
    await expect(importQuantumFieldScientificManifest(directory)).rejects.toThrow(/integrity/i);
    await writeFile(path, original);
    await writeFile(join(directory, "scene.json"), "{}\n");
    await expect(importQuantumFieldScientificManifest(directory)).rejects.toThrow(/size|integrity/i);
  });

  it("does not silently map an unsupported quantum scene", async () => {
    const directory = fileURLToPath(new URL(
      "../../../tests/fixtures/quantum-scene/run-97a132d1d712414bb62bb8c9212f517e-bands.qscene", import.meta.url));
    await expect(importQuantumFieldScientificManifest(directory)).rejects.toThrow(/single regular complex field/);
  });
  it("saves a native field document, exact probe and path relink without changing source identity", async () => {
    const imported = await importQuantumSceneBundle(fixture);
    const fingerprint = sceneFingerprint(imported);
    const opened = { ok: true as const, canceled: false as const, directory: fixture,
      reference: { directory: fixture, sceneFingerprint: fingerprint }, document: imported.document,
      remembered: false, mappedObjectIds: imported.mappedObjectIds,
      deferredObjectIds: imported.deferredObjectIds, deferredFieldIds: imported.deferredFieldIds };
    const field = quantumFieldDocumentFromVerifiedOpen(opened);
    expect(field.source.mapping).toMatchObject({ schema: "scientific-scene/v1", order: "last-axis-fastest" });
    expect(field.source.field.shape).toEqual([21, 21, 21]);
    const exact = inspectVerifiedFieldSample(imported, { fingerprint, fieldId: "wavefunction", axis: 2,
      index: 10, u: 10, v: 11, quantity: "density" });
    const amplitude = inspectVerifiedFieldSample(imported, { fingerprint, fieldId: "wavefunction", axis: 2,
      index: 10, u: 10, v: 11, quantity: "amplitude" });
    expect(amplitude.value).toBeCloseTo(Math.sqrt(exact.value!));
    expect(normalizeQuantumFieldDocument({ ...field, view: { ...field.view, quantity: "amplitude" } }).ok).toBe(true);
    expect(exact.grid).toEqual([10, 11, 10]);
    expect(exact.position[0]).toBeCloseTo(0);
    expect(exact.position[1]).toBeCloseTo(1.6);
    expect(exact.position[2]).toBeCloseTo(0);
    const moved = relocateQuantumFieldDocument(field, "D:\\relinked.qscene");
    expect(moved.identity).toEqual(field.identity);
    expect(normalizeQuantumFieldDocument({ ...moved, source: { ...moved.source,
      field: { ...moved.source.field, spacing: [2, 2, 2] } } }).ok).toBe(false);
    const workspace = createMixedWorkspaceDocument({ entries: [{ module: "field", checkpoint: moved,
      expected: moved.identity, replay: null }], activeDocumentIds: [moved.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    const base = createMath3DProject(createMixedWorkspaceDocument({ ...workspace, entries: [], activeDocumentIds: [] }),
      { stableKey: "hydrogen-field", title: "Hydrogen field" });
    const linked = upsertMath3DProjectQuantumScene(base, { format: "quantum-scene/v1",
      title: field.metadata.title, directory: moved.location.directory,
      sceneFingerprint: moved.source.scene.sceneFingerprint });
    const saved = parseMath3DProject(serializeMath3DProject(replaceMath3DProjectWorkspace(linked, workspace)));
    expect(replayMixedWorkspaceDocument(saved.workspace).get(moved.identity.id)).toEqual(moved);
    const relinked = relinkMath3DProjectQuantumScene(saved, fingerprint, fixture);
    const reopened = relinked.workspace.entries.find(entry => entry.expected.id === moved.identity.id)?.checkpoint;
    expect(reopened?.format).toBe("math3d.quantum-field-document");
    if (reopened?.format !== "math3d.quantum-field-document") throw new Error("Field did not relink");
    expect(reopened.location.directory).toBe(fixture);
    expect(reopened.identity).toEqual(moved.identity);
    await expect(verifyProjectQuantumSceneDocuments(relinked,
      async () => quantumSceneDocumentFromVerifiedOpen(opened))).resolves.toBeUndefined();
    await expect(verifyProjectQuantumSceneDocuments(relinked,
      async () => { throw new Error("Source missing"); })).rejects.toThrow("Source missing");
  });
});
