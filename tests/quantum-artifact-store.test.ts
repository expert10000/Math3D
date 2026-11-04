import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SharedArtifactStore } from "../src/main/quantumScene/artifactStore";

test("a saved Project pin survives temporary scene removal and GC quarantine", async () => {
  const root = await mkdtemp(join(tmpdir(), "qi18-artifacts-"));
  const temporaryScene = await mkdtemp(join(tmpdir(), "qi18-scene-"));
  try {
    const store = new SharedArtifactStore(root);
    const shared = new TextEncoder().encode("verified-scene-dataset");
    const unreferenced = new TextEncoder().encode("unused-preview-dataset");
    const hash = await store.put(shared);
    assert.equal(await store.put(shared), hash);
    const unusedHash = await store.put(unreferenced);
    await store.pin("project-verified", [hash]);
    await rm(temporaryScene, { recursive: true, force: true });
    assert.deepEqual((await store.collect()).hashes, [unusedHash]);
    assert.deepEqual((await store.collect(false)).hashes, [unusedHash]);
    assert.deepEqual(await readFile(join(root, "objects", "sha256", hash.slice(0, 2), hash)), Buffer.from(shared));
    await store.restore(unusedHash);
    await store.unpin("project-verified");
    assert.deepEqual((await store.collect()).hashes.sort(), [hash, unusedHash].sort());
  } finally { await rm(root, { recursive: true, force: true });
    await rm(temporaryScene, { recursive: true, force: true }); }
});
