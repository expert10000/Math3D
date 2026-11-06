import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { _electron as electron } from "playwright";

const requestedCycles = process.argv[3] === undefined ? 8 : Number(process.argv[3]);
if (!Number.isInteger(requestedCycles) || requestedCycles < 4 || requestedCycles > 120)
  throw new Error("Choose 4 to 120 quantum scene stress cycles.");
const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-stress-"));
const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile };
delete env.ELECTRON_RUN_AS_NODE;
let app;
try {
  app = await electron.launch({ args: ["."], cwd: resolve("."), env });
  const page = await app.firstWindow();
  await page.getByTestId("app-shell").waitFor({ state: "visible", timeout: 30_000 });
  const cdp = await page.context().newCDPSession(page);
  const snapshot = async () => {
    await cdp.send("HeapProfiler.collectGarbage");
    const heap = await cdp.send("Runtime.getHeapUsage");
    const metrics = await app.evaluate(({ app }) => app.getAppMetrics());
    const processes = metrics.map(item => ({ type: item.type, pid: item.pid,
      workingSetKiB: Number(item.memory?.workingSetSize ?? 0),
      privateKiB: item.memory?.privateBytes === undefined ? null : Number(item.memory.privateBytes) }));
    return { heapBytes: heap.usedSize,
      workingSetKiB: processes.reduce((sum, item) => sum + item.workingSetKiB, 0),
      privateKiB: processes.every(item => item.privateKiB !== null) ?
        processes.reduce((sum, item) => sum + item.privateKiB, 0) : null,
      processes,
      canvasCount: await page.locator("canvas").count() };
  };
  const baseline = await snapshot();
  const cycles = [];
  for (let i = 0; i < requestedCycles; i++) {
    const id = i % 2 ? "hydrogen-2p" : "rice-mele-bands";
    await page.getByRole("button", { name: "Palette", exact: true }).click();
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
  const result = { schema: "math3d.quantum-stress/v1", cycles: cycles.length,
    baseline, samples: cycles, final, contextLoss: cycles[3].simulatedContextLoss };
  const bytes = JSON.stringify(result, null, 2) + "\n";
  if (process.argv[2]) await writeFile(resolve(process.argv[2]), bytes);
  process.stdout.write(bytes);
} finally {
  if (app) await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-stress-"))
    throw new Error("Unsafe temporary profile cleanup path.");
  await rm(profile, { recursive: true, force: true });
}
