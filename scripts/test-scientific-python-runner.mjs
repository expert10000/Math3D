import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const { preparePythonPublisher, runPythonPublisher } = require("../dist/main/scientificScene/pythonPublisher.js");
const { readScientificSceneBundle } = require("../dist/main/scientificScene/bundle.js");
const pythonCommand = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
const python = execFileSync(pythonCommand, ["-c", "import sys;print(sys.executable)"], { encoding: "utf8" }).trim();
const publisher = resolve("integrations/python/scientific_scene_publisher.py");
const baseSpec = { sceneId: "job-grid", title: "Job field", producer: "python", sourceId: "job-source",
  sourceSchema: "python-data/v1", coordinateKind: "cartesian",
  axes: [{ name: "x", unit: "m" }, { name: "y", unit: "m" }],
  origin: [0, 0], spacing: [1, 2], periodic: [false, false], shape: [2, 2], datasetId: "f",
  quantity: { name: "value", unit: "K" }, real: [1, 2, 3, 4] };
const root = await mkdtemp(join(tmpdir(), "math3d-ssr06-"));
try {
  const spec = join(root, "field.json");
  await writeFile(spec, JSON.stringify(baseSpec));
  const output = join(root, "finished.sscene");
  const prepared = await preparePythonPublisher(python, publisher, spec, output);
  assert.match(prepared.sourceHash, /^[a-f0-9]{64}$/);
  const scene = await runPythonPublisher(prepared).promise;
  assert.equal(scene.manifest.sceneId, "job-grid");
  assert.equal(scene.values[3], 4);
  assert.equal((await readScientificSceneBundle(output)).fingerprint, scene.fingerprint);
  await assert.rejects(preparePythonPublisher(python, publisher, spec, output), /already exists/);

  const changedOutput = join(root, "changed.sscene");
  const changedPrepared = await preparePythonPublisher(python, publisher, spec, changedOutput);
  await writeFile(spec, JSON.stringify({ ...baseSpec, title: "Changed before run" }));
  await assert.rejects(runPythonPublisher(changedPrepared).promise, /changed before run/);
  await assert.rejects(readScientificSceneBundle(changedOutput));
  await writeFile(spec, JSON.stringify(baseSpec));

  const slowScript = join(root, "slow.py");
  await writeFile(slowScript, `import runpy,time\ntime.sleep(2)\nrunpy.run_path(${JSON.stringify(publisher)}, run_name="__main__")\n`);
  const cancelOutput = join(root, "cancelled.sscene");
  const cancelPrepared = await preparePythonPublisher(python, slowScript, spec, cancelOutput);
  const cancelled = runPythonPublisher(cancelPrepared);
  await delay(200); cancelled.cancel();
  await assert.rejects(cancelled.promise, /cancelled/);
  await assert.rejects(readScientificSceneBundle(cancelOutput));

  const timeoutOutput = join(root, "timed-out.sscene");
  const timeoutPrepared = await preparePythonPublisher(python, slowScript, spec, timeoutOutput);
  await assert.rejects(runPythonPublisher(timeoutPrepared, 200).promise, /timed out/);
  await assert.rejects(readScientificSceneBundle(timeoutOutput));

  const noisyScript = join(root, "noisy.py");
  await writeFile(noisyScript, 'print("x" * 10000)\n');
  const noisyOutput = join(root, "noisy.sscene");
  const noisyPrepared = await preparePythonPublisher(python, noisyScript, spec, noisyOutput);
  await assert.rejects(runPythonPublisher(noisyPrepared).promise, /diagnostics exceeded/);
  await assert.rejects(readScientificSceneBundle(noisyOutput));

  const staleOutput = join(root, "stale.sscene");
  const stalePrepared = await preparePythonPublisher(python, slowScript, spec, staleOutput);
  const stale = runPythonPublisher(stalePrepared);
  await delay(200);
  await writeFile(spec, JSON.stringify({ ...baseSpec, title: "Changed while running" }));
  await assert.rejects(stale.promise, /changed during run/);
  await assert.rejects(readScientificSceneBundle(staleOutput));
  assert.equal((await readdir(root)).some(name => name.startsWith(".math3d-publisher-")), false);
  assert.equal(JSON.parse(await readFile(spec, "utf8")).title, "Changed while running");
  console.log("SSR-06 supervised Python success, source guards, cancel, deadline, diagnostics and cleanup passed");
} finally {
  if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("math3d-ssr06-"))
    throw new Error("Unsafe Python runner test cleanup path");
  await rm(root, { recursive: true, force: true });
}
