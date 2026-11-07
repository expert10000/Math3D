import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { _electron as electron } from "playwright";
import { summarizeQuantumHeapRetainers } from "./quantum-heap-retainers.mjs";

const requestedCycles = process.argv[3] === undefined ? 8 : Number(process.argv[3]);
if (!Number.isInteger(requestedCycles) || requestedCycles < 4 || requestedCycles > 120)
  throw new Error("Choose 4 to 120 quantum scene stress cycles.");
const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-stress-"));
const installedExe = process.env.MATH3D_INSTALLED_STRESS_EXE
  ? resolve(process.env.MATH3D_INSTALLED_STRESS_EXE) : null;
if (installedExe) await access(installedExe);
const env = { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_PROFILE_ROOT: profile,
  ...(installedExe ? { MATH3D_E2E_USER_DATA_DIR: join(profile, "user-data") } : {}) };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch(installedExe
    ? { executablePath: installedExe, args: [`--user-data-dir=${join(profile, "user-data")}`],
      cwd: dirname(installedExe), env }
    : { args: ["."], cwd: resolve("."), env });
  const page = await app.firstWindow();
  await page.getByTestId("app-shell").waitFor({ state: "visible", timeout: 30_000 });
  const autosaveAblation = process.env.MATH3D_STRESS_AUTOSAVE_ABLATION === "1";
  // Both control and ablation start after the same clean reload.
  await page.evaluate(() => {
    localStorage.removeItem("math3d.workbook.autosave.v1");
    localStorage.removeItem("math3d.workbook.autosaveJournal.v1");
  });
  if (autosaveAblation) {
    // Isolate workbook autosave storage writes in a disposable E2E profile.
    // The app still builds its workbook payload and runs the same scene cycle.
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && (key === "math3d.workbook.autosave.v1" ||
          key === "math3d.workbook.autosaveJournal.v1")) return;
        return original.call(this, key, value);
      };
    });
  }
  await page.reload();
  await page.getByTestId("app-shell").waitFor({ state: "visible", timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  const diagnoseHeap = process.env.MATH3D_HEAP_DIAGNOSTIC === "1";
  const e2eHookAblation = process.env.MATH3D_STRESS_ABLATE_E2E_HOOKS === "1";
  if (diagnoseHeap) await cdp.send("HeapProfiler.enable");
  const heapComposition = async (traceRetainers = false) => {
    await cdp.send("HeapProfiler.collectGarbage");
    const chunks = [];
    const collect = ({ chunk }) => chunks.push(chunk);
    cdp.on("HeapProfiler.addHeapSnapshotChunk", collect);
    try { await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false }); }
    finally { cdp.off("HeapProfiler.addHeapSnapshotChunk", collect); }
    const snapshot = JSON.parse(chunks.join(""));
    const fields = snapshot.snapshot.meta.node_fields;
    const stride = fields.length;
    const typeIndex = fields.indexOf("type");
    const nameIndex = fields.indexOf("name");
    const sizeIndex = fields.indexOf("self_size");
    assert(typeIndex >= 0 && nameIndex >= 0 && sizeIndex >= 0, "Unknown V8 heap snapshot fields");
    const types = snapshot.snapshot.meta.node_types[typeIndex];
    const byType = {};
    const byConstructor = {};
    for (let offset = 0; offset < snapshot.nodes.length; offset += stride) {
      const type = types[snapshot.nodes[offset + typeIndex]];
      const bytes = snapshot.nodes[offset + sizeIndex];
      const typeRow = byType[type] ??= { count: 0, selfBytes: 0 };
      typeRow.count++;
      typeRow.selfBytes += bytes;
      if (!["object", "native", "array"].includes(type)) continue;
      const rawName = snapshot.strings[snapshot.nodes[offset + nameIndex]];
      const name = /^[A-Za-z_$][A-Za-z0-9_$ .<>-]{0,79}$/.test(rawName) ? rawName : "[other]";
      const key = `${type}:${name}`;
      const row = byConstructor[key] ??= { count: 0, selfBytes: 0 };
      row.count++;
      row.selfBytes += bytes;
    }
    return { byType, byConstructor,
      ...(traceRetainers ? { retainers: summarizeQuantumHeapRetainers(snapshot) } : {}) };
  };
  const snapshot = async () => {
    if (e2eHookAblation) await page.evaluate(() => {
      delete window.__MATH3D_E2E_GEOMETRY_PICK__;
      delete window.__MATH3D_E2E_MESH_ANALYSIS__;
      delete window.__MATH3D_E2E_MESH_BENCHMARK__;
      delete window.__MATH3D_E2E_MESH_OPERATION__;
    });
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    const processes = metrics.map(item => ({ type: item.type, pid: item.pid,
      workingSetKiB: Number(item.memory?.workingSetSize ?? 0),
      privateKiB: item.memory?.privateBytes === undefined ? null : Number(item.memory.privateBytes) }));
    const roleWorkingSetKiB = {};
    for (const item of processes) {
      const role = String(item.type ?? "unknown");
      roleWorkingSetKiB[role] = (roleWorkingSetKiB[role] ?? 0) + item.workingSetKiB;
    }
    return { heapBytes: heap.usedSize,
      workingSetKiB: processes.reduce((sum, item) => sum + item.workingSetKiB, 0),
      roleWorkingSetKiB,
      privateKiB: processes.every(item => item.privateKiB !== null) ?
        processes.reduce((sum, item) => sum + item.privateKiB, 0) : null,
      processes,
      canvasCount: await page.locator("canvas").count() };
  };
  const baseline = await snapshot();
  const baselineHeapComposition = diagnoseHeap ? await heapComposition() : null;
  const cycles = [];
  for (let i = 0; i < requestedCycles; i++) {
    const id = i % 2 ? "hydrogen-2p" : "rice-mele-bands";
    // A first-run coachmark can cover the toolbar on a fresh CI profile. This
    // harness measures scene lifecycle, so dispatch the palette button directly.
    await page.getByRole("button", { name: "Palette", exact: true }).click({ force: true });
    await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...").fill("Verified quantum examples");
    await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
    await page.getByTestId(`quantum-example-${id}`).click();
    const dialog = page.getByTestId("quantum-scene-preview");
    await dialog.waitFor({ state: "visible", timeout: 30_000 });
    if (id === "hydrogen-2p") {
      await page.getByTestId("quantum-scene-geometry").getByRole("button", { name: "Density surface", exact: true }).click();
      await page.getByTestId("quantum-surface-legend").waitFor({ state: "visible" });
    }
    let simulatedContextLoss = "not attempted";
    if (i === 3) {
      simulatedContextLoss = await page.evaluate(async () => {
        const canvas = document.querySelector('[data-testid="quantum-scene-preview"] canvas');
        const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
        const extension = gl?.getExtension("WEBGL_lose_context");
        if (!extension) return "unsupported";
        const observed = new Promise(resolve => {
          canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); resolve(true); }, { once: true });
          setTimeout(() => resolve(false), 1_000);
        });
        extension.loseContext();
        return await observed ? "observed" : "event missing";
      });
      assert.equal(simulatedContextLoss, "observed", "WebGL context-loss event was not observed");
    }
    const opened = await snapshot();
    await page.getByTestId("quantum-scene-close").click();
    await dialog.waitFor({ state: "hidden" });
    const closed = await snapshot();
    assert.equal(closed.canvasCount, baseline.canvasCount, `${id} left a canvas after close`);
    cycles.push({ model: id, opened, closed, simulatedContextLoss });
  }
  const final = await snapshot();
  const finalHeapComposition = diagnoseHeap ? await heapComposition(true) : null;
  const workbookAutosaveStorage = await page.evaluate(() => ({
    currentBytes: new TextEncoder().encode(localStorage.getItem("math3d.workbook.autosave.v1") ?? "").length,
    journalBytes: new TextEncoder().encode(localStorage.getItem("math3d.workbook.autosaveJournal.v1") ?? "").length,
  }));
  if (autosaveAblation) {
    assert.equal(workbookAutosaveStorage.currentBytes, 0, "Autosave ablation left current session bytes");
    assert.equal(workbookAutosaveStorage.journalBytes, 0, "Autosave ablation left journal bytes");
  }
  const constructorGrowth = diagnoseHeap ? Object.keys({
    ...baselineHeapComposition.byConstructor, ...finalHeapComposition.byConstructor,
  }).map(name => ({ name,
    baseline: baselineHeapComposition.byConstructor[name] ?? { count: 0, selfBytes: 0 },
    final: finalHeapComposition.byConstructor[name] ?? { count: 0, selfBytes: 0 },
  })).map(row => ({ ...row, deltaCount: row.final.count - row.baseline.count,
    deltaSelfBytes: row.final.selfBytes - row.baseline.selfBytes }))
    .sort((a, b) => b.deltaSelfBytes - a.deltaSelfBytes).slice(0, 30) : null;
  const trackedConstructors = diagnoseHeap ? Object.fromEntries(
    ["native:WebGL2RenderingContext", "native:WebGLTexture"].map(name => [name, {
      baseline: baselineHeapComposition.byConstructor[name]?.count ?? 0,
      final: finalHeapComposition.byConstructor[name]?.count ?? 0,
    }])) : null;
  const result = { schema: "math3d.quantum-stress/v1", cycles: cycles.length,
    installed: Boolean(installedExe),
    autosaveAblation,
    e2eHookAblation,
    workbookAutosaveStorage,
    baseline, samples: cycles, final, contextLoss: cycles[3].simulatedContextLoss,
    ...(diagnoseHeap ? { heapComposition: { baselineByType: baselineHeapComposition.byType,
      finalByType: finalHeapComposition.byType, topConstructorGrowth: constructorGrowth,
      trackedConstructors,
      retainers: finalHeapComposition.retainers,
      method: "V8 heap snapshot node self sizes after forced GC; shallow bytes, not retained-size attribution" } } : {}) };
  const bytes = JSON.stringify(result, null, 2) + "\n";
  if (process.argv[2]) {
    const output = resolve(process.argv[2]);
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, bytes);
  }
  process.stdout.write(bytes);
} finally {
  if (app) await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-stress-"))
    throw new Error("Unsafe temporary profile cleanup path.");
  await rm(profile, { recursive: true, force: true });
}
