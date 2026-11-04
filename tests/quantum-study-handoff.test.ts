import test from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { importQuantumSceneBundle } from "../src/main/quantumScene/importer";
import { quantumStudyLaunchArguments, readQuantumStudyHandoff } from "../src/main/quantumScene/studyHandoff";

const runId = "run-97a132d1d712414bb62bb8c9212f517e";
const fixtures = resolve("tests/fixtures/quantum-scene");

test("QWZ study launch validates both exact bundles and refuses changed source bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "math3d-study-"));
  try {
    const names = [`${runId}.qscene`, `${runId}-bands.qscene`];
    for (const name of names) await cp(join(fixtures, name), join(directory, name), { recursive: true });
    const imported = await Promise.all(names.map(name => importQuantumSceneBundle(join(directory, name))));
    const resultSha256 = imported[0].source.provenance.resultSha256;
    assert.equal(imported[1].source.provenance.resultSha256, resultSha256);
    const manifest = { schema: "quantum-study-handoff/v1", model: "qwz", runId, resultSha256,
      scenes: imported.map((item, index) => ({ role: index ? "bands" : "curvature", folder: names[index], sceneId: item.source.id })) };
    await writeFile(join(directory, "study.json"), JSON.stringify(manifest));
    assert.deepEqual(quantumStudyLaunchArguments(["electron", ".", "--quantum-study", directory, "new"]),
      { directory, mode: "new" });
    assert.throws(() => quantumStudyLaunchArguments(["--quantum-study", directory, "wrong"]), /Invalid/);
    const opened = await readQuantumStudyHandoff(directory);
    assert.equal(opened.references.length, 2);
    assert.deepEqual(opened.references.map(item => item.sceneFingerprint).length, 2);
    assert.equal(new Set(opened.references.map(item => item.sceneFingerprint)).size, 2);
    await writeFile(join(directory, "study.json"), JSON.stringify({ ...manifest, resultSha256: "0".repeat(64) }));
    await assert.rejects(readQuantumStudyHandoff(directory), /does not match/);
    await writeFile(join(directory, "study.json"), JSON.stringify(manifest));
    const files = (await readdir(join(directory, names[0]))).filter(name => name.endsWith(".f64"));
    const file = join(directory, names[0], files[0]);
    const bytes = await readFile(file); bytes[0] ^= 1; await writeFile(file, bytes);
    await assert.rejects(readQuantumStudyHandoff(directory));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("Hofstadter study refuses a strip from a different saved result", async () => {
  const directory = await mkdtemp(join(tmpdir(), "math3d-harper-study-"));
  try {
    const names = ["run-9e46f98c78e842ebb12c92d5a73e8446-hofstadter.qscene",
      "run-e02feae009f4467394f141d9291863bb-hofstadter-strip.qscene"];
    for (const name of names) await cp(join(fixtures, name), join(directory, name), { recursive: true });
    const scenes = await Promise.all(names.map(name => importQuantumSceneBundle(join(directory, name))));
    const manifest = { schema: "quantum-study-handoff/v2", model: "hofstadter",
      runId: scenes[0].source.provenance.runId, resultSha256: scenes[0].source.provenance.resultSha256,
      scenes: scenes.map((item, index) => ({ role: index ? "strip" : "bands", folder: names[index], sceneId: item.source.id })) };
    await writeFile(join(directory, "study.json"), JSON.stringify(manifest));
    await assert.rejects(readQuantumStudyHandoff(directory), /does not match/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
