import { describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createMixedWorkspaceDocument, createProjectQwzQuadStudy, createQuantumSceneDocument,
  createQuantumStudyFromTemplate, instantiateMath3DProjectTemplate, qualifyProjectQwzQuadStudy,
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
      expect(imported.every(item => Number.isSafeInteger(item.importDurationMs) && item.importDurationMs! >= 0)).toBe(true);
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
        activeDocumentIds: [...project.workspace.activeDocumentIds, ...documents.map(document => document.identity.id)],
        quantumStudies: [createQuantumStudyFromTemplate("qwz", documents[0]!, documents)] }));
      project = createProjectQwzQuadStudy(project, project.workspace.quantumStudies![0]!.id,
        "portable-quad", "Portable QWZ four-view Study");
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
      if (process.env.MATH3D_QPACK_EVIDENCE) await cp(packA, process.env.MATH3D_QPACK_EVIDENCE, { recursive: true });
      const priorWorker = process.env.QLAB_PYTHON;
      process.env.QLAB_PYTHON = join(root, "missing-worker");
      let opened: Awaited<ReturnType<typeof openQuantumProjectPack>>;
      try { opened = await openQuantumProjectPack(packB, join(root, "new-host-cache")); }
      finally { if (priorWorker === undefined) delete process.env.QLAB_PYTHON; else process.env.QLAB_PYTHON = priorWorker; }
      expect(opened.projectJson).not.toContain(fixtureRoot);
      expect(opened.projectJson).not.toMatch(/[A-Za-z]:\\\\[^"\s]*\.qscene/);
      let restored = parseMath3DProject(opened.projectJson);
      for (const reference of opened.references) restored = relinkMath3DProjectQuantumScene(restored,
        reference.sceneFingerprint, reference.directory);
      restored = parseMath3DProject(serializeMath3DProject(restored));
      expect(restored.workspace.entries.some(entry => entry.module === "geometry")).toBe(true);
      expect(restored.workspace.entries.filter(entry => entry.module === "quantum").length).toBe(2);
      expect(restored.workspace.studies?.[0]?.layout.mode).toBe("quad");
      expect(qualifyProjectQwzQuadStudy(restored, restored.workspace.studies![0]!)).not.toBeNull();
      for (const reference of restored.quantumScenes!) {
        const scene = await importQuantumSceneBundle(reference.directory);
        expect(sceneFingerprint(scene)).toBe(reference.sceneFingerprint);
      }
      const manifestPath = join(packB, "manifest.json"), originalManifest = await readFile(manifestPath);
      const unsafePath = JSON.parse(originalManifest.toString("utf8"));
      unsafePath.scenes[0].files[0].name = "../escape.f64";
      await writeFile(manifestPath, JSON.stringify(unsafePath));
      await expect(openQuantumProjectPack(packB, join(root, "unsafe-path-cache"))).rejects.toThrow(/Invalid quantum pack blob descriptor/);
      const oversized = JSON.parse(originalManifest.toString("utf8"));
      oversized.scenes[0].files[0].bytes = 16 * 1024 * 1024 + 1;
      await writeFile(manifestPath, JSON.stringify(oversized));
      await expect(openQuantumProjectPack(packB, join(root, "oversized-cache"))).rejects.toThrow(/Invalid quantum pack blob descriptor/);
      const wrongSchema = JSON.parse(originalManifest.toString("utf8")); wrongSchema.schema = "zip-bundle/v1";
      await writeFile(manifestPath, JSON.stringify(wrongSchema));
      await expect(openQuantumProjectPack(packB, join(root, "compressed-cache"))).rejects.toThrow(/Invalid quantum pack manifest/);
      await writeFile(manifestPath, originalManifest);
      const outsideCache = join(root, "outside-cache"), linkedCache = join(root, "linked-cache");
      await mkdir(outsideCache);
      await symlink(outsideCache, linkedCache, process.platform === "win32" ? "junction" : "dir");
      await expect(openQuantumProjectPack(packB, linkedCache)).rejects.toThrow(/cache root must be a real directory/);
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
