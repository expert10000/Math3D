import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createMixedWorkspaceDocument, createQuantumSceneDocument, instantiateMath3DProjectTemplate,
  linkQuantumSceneDocuments, parseMath3DProject, relinkMath3DProjectQuantumScene,
  replaceMath3DProjectWorkspace, serializeMath3DProject, upsertMath3DProjectQuantumScene,
  type QuantumSceneDocumentSource } from "@math3d/core";
import { importQuantumSceneBundle } from "../../../src/main/quantumScene/importer";
import { sceneFingerprint } from "../../../src/main/quantumScene/recent";
import { openQuantumProjectPack, writeQuantumProjectPack } from "../../../src/main/quantumScene/portableProject";

const fixtureRoot = resolve(__dirname, "../../../tests/fixtures/quantum-qi01");
const runId = "run-05ce1036d70c466eb4f900944a85c474";

describe("content-addressed portable QWZ Project", () => {
  it("deduplicates blobs and reopens two linked scenes beside Geometry after relocation", async () => {
    const root = await mkdtemp(join(tmpdir(), "m3d-qi06-pack-"));
    try {
      const locations = [`${runId}.qscene`, `${runId}-bands.qscene`].map(name => join(fixtureRoot, name));
      const imported = await Promise.all(locations.map(location => importQuantumSceneBundle(location)));
      const documents = linkQuantumSceneDocuments(imported.map((item, index) => {
        const scene = item.source;
        const source: QuantumSceneDocumentSource = {
          sceneSchema: scene.schema, sceneId: scene.id, sceneFingerprint: sceneFingerprint(item),
          provenance: { runId: scene.provenance.runId, model: scene.provenance.model,
            resultSha256: scene.provenance.resultSha256, engine: scene.provenance.engine,
            engineVersion: scene.provenance.engineVersion, adapter: scene.provenance.adapter },
          coordinates: scene.coordinates,
          datasets: scene.datasets.map(({ id, sha256, count, components, unit, bytes }) =>
            ({ id, sha256, count, components, unit, bytes })),
          objects: scene.objects.map(({ id, kind, label }) => ({ id, kind, label })),
        };
        return createQuantumSceneDocument(source, locations[index], scene.title);
      }));
      let project = instantiateMath3DProjectTemplate("geometry-note-pins", "portable-qwz");
      for (const document of documents) project = upsertMath3DProjectQuantumScene(project, {
        format: document.source.sceneSchema, title: document.metadata.title,
        directory: document.location.directory, sceneFingerprint: document.source.sceneFingerprint,
      });
      project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({ ...project.workspace,
        entries: [...project.workspace.entries, ...documents.map(document =>
          ({ module: "quantum" as const, checkpoint: document, expected: document.identity, replay: null }))],
        activeDocumentIds: [...project.workspace.activeDocumentIds, ...documents.map(document => document.identity.id)] }));
      let portable = project;
      for (const reference of project.quantumScenes!) portable = relinkMath3DProjectQuantumScene(portable,
        reference.sceneFingerprint, `scenes/${reference.sceneFingerprint}.qscene`);
      const packA = join(root, "source.qpack"), packB = join(root, "moved.qpack");
      await writeQuantumProjectPack(serializeMath3DProject(portable), project.quantumScenes!, packA);
      const changedSource = join(root, "changed.qscene");
      await cp(locations[0], changedSource, { recursive: true });
      const altered = join(changedSource, "curvature.f64"), sourceBytes = await readFile(altered);
      sourceBytes[0] ^= 1; await writeFile(altered, sourceBytes);
      await expect(writeQuantumProjectPack(serializeMath3DProject(portable), project.quantumScenes!.map(reference =>
        reference.directory === locations[0] ? { ...reference, directory: changedSource } : reference),
      join(root, "changed.qpack"))).rejects.toThrow(/integrity/i);
      const manifest = JSON.parse(await readFile(join(packA, "manifest.json"), "utf8"));
      const files = manifest.scenes.flatMap((scene: { files: { sha256: string }[] }) => scene.files);
      expect(new Set(files.map((file: { sha256: string }) => file.sha256)).size).toBeLessThan(files.length);
      await cp(packA, packB, { recursive: true });
      const opened = await openQuantumProjectPack(packB, join(root, "new-host-cache"));
      expect(opened.projectJson).not.toContain(fixtureRoot);
      let restored = parseMath3DProject(opened.projectJson);
      for (const reference of opened.references) restored = relinkMath3DProjectQuantumScene(restored,
        reference.sceneFingerprint, reference.directory);
      restored = parseMath3DProject(serializeMath3DProject(restored));
      expect(restored.workspace.entries.some(entry => entry.module === "geometry")).toBe(true);
      expect(restored.workspace.entries.filter(entry => entry.module === "quantum").length).toBe(2);
      for (const reference of restored.quantumScenes!) {
        const scene = await importQuantumSceneBundle(reference.directory);
        expect(sceneFingerprint(scene)).toBe(reference.sceneFingerprint);
      }
      const target = manifest.scenes[0].files.find((file: { name: string }) => file.name === "scene.json");
      const blobPath = join(packB, "blobs", target.sha256), bytes = await readFile(blobPath);
      bytes[0] ^= 1; await writeFile(blobPath, bytes);
      await expect(openQuantumProjectPack(packB, join(root, "tampered-cache"))).rejects.toThrow(/blob hash changed/);
    } finally {
      if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("m3d-qi06-pack-")) throw new Error("Unsafe pack test cleanup");
      await rm(root, { recursive: true, force: true });
    }
  });
});
