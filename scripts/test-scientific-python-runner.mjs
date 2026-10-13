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
const packaging = require("../electron-builder.config.cjs");
assert.ok(packaging.extraResources.some(resource => resource.from === "integrations/python/scientific_scene_publisher.py" &&
  resource.to === "scientific-publisher/scientific_scene_publisher.py"),
"release build must ship the reference publisher source without a Python interpreter");
assert.ok(packaging.extraResources.some(resource => resource.from === "integrations/python/examples/sincos-grid.json" &&
  resource.to === "scientific-publisher/examples/sincos-grid.json"),
"release build must ship the reference example specification");
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

  const exampleSpec = resolve("integrations/python/examples/sincos-grid.json");
  const exampleOutput = join(root, "reference-example.sscene");
  const example = await runPythonPublisher(await preparePythonPublisher(python, publisher,
    exampleSpec, exampleOutput)).promise;
  assert.equal(example.manifest.sceneId, "python-sincos-grid");
  assert.equal(example.values[6], 0);
  assert.equal(example.values[7], -1);

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

  if (process.platform === "win32") {
    const childPidFile = join(root, "tree-child.pid"), treeScript = join(root, "tree.py");
    await writeFile(treeScript, `import pathlib,subprocess,sys,time\nchild=subprocess.Popen([sys.executable,"-c","import time;time.sleep(10)"])\npathlib.Path(${JSON.stringify(childPidFile)}).write_text(str(child.pid))\ntime.sleep(10)\n`);
    const treeOutput = join(root, "tree.sscene");
    const treePrepared = await preparePythonPublisher(python, treeScript, spec, treeOutput);
    const tree = runPythonPublisher(treePrepared);
    let childPid = 0;
    for (let attempt = 0; attempt < 40 && !childPid; attempt++) {
      await delay(50);
      childPid = Number(await readFile(childPidFile, "utf8").catch(() => "0"));
    }
    assert.ok(childPid > 0, "test publisher must spawn a descendant");
    tree.cancel();
    await assert.rejects(tree.promise, /cancelled/);
    await delay(200);
    assert.throws(() => process.kill(childPid, 0), "cancel must terminate the Python descendant");
    await assert.rejects(readScientificSceneBundle(treeOutput));
  }

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
  console.log("SSR-06 supervised Python success, source guards, process-tree cancel, deadline, diagnostics and cleanup passed");
} finally {
  if (!root.startsWith(resolve(tmpdir()) + sep) || !root.includes("math3d-ssr06-"))
    throw new Error("Unsafe Python runner test cleanup path");
  await rm(root, { recursive: true, force: true });
}
