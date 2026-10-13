import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const { preparePythonPublisher, runPythonPublisher } = require("../dist/main/scientificScene/pythonPublisher.js");
const packageRoot = resolve("output/scientific-publisher-package-probe/win-unpacked");
const executable = join(packageRoot, "Math3D.exe");
const publisher = join(packageRoot, "resources/scientific-publisher/scientific_scene_publisher.py");
const spec = join(packageRoot, "resources/scientific-publisher/examples/sincos-grid.json");
const pinned = "b9da5fbabce579ff4e795495bb8944135eed2e50f5e17d10c6f18bbcc0f7b7da";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const port = await new Promise((done, fail) => {
  const server = createServer();
  server.once("error", fail);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    server.close(() => done(address.port));
  });
});
const temp = await mkdtemp(join(tmpdir(), "m3d-ssr06-package-"));
let app = null, browser = null;
try {
  assert((await stat(executable)).isFile());
  assert.equal(sha(await readFile(publisher)), pinned);
  assert.equal(await readFile(spec, "utf8"),
    await readFile(resolve("integrations/python/examples/sincos-grid.json"), "utf8"));
  const pythonCommand = process.env.PYTHON || (process.platform === "win32" ? "py" : "python3");
  const python = execFileSync(pythonCommand, ["-c", "import sys;print(sys.executable)"],
    { encoding: "utf8" }).trim();
  const published = await runPythonPublisher(await preparePythonPublisher(python, publisher, spec,
    join(temp, "package-reference.sscene"))).promise;
  assert.equal(published.manifest.sceneId, "python-sincos-grid");

  const env = { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_USER_DATA_DIR: join(temp, "profile") };
  delete env.ELECTRON_RUN_AS_NODE;
  app = spawn(executable, [`--remote-debugging-port=${port}`, `--user-data-dir=${join(temp, "profile")}`],
    { env, windowsHide: true, stdio: "ignore" });
  let endpoint = null;
  for (let attempt = 0; attempt < 100 && !endpoint; attempt++) {
    if (app.exitCode !== null) throw new Error(`Packaged Math3D exited: ${app.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) endpoint = (await response.json()).webSocketDebuggerUrl;
    } catch { /* Chromium is still starting. */ }
    if (!endpoint) await delay(100);
  }
  assert(endpoint, "Packaged Math3D did not expose its local test-only CDP endpoint");
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  const page = context.pages()[0] ?? await context.waitForEvent("page");
  await page.getByRole("button", { name: "Palette", exact: true }).waitFor({ timeout: 20_000 });
  await page.getByRole("button", { name: "Palette", exact: true }).click();
  await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
    .fill("Verified quantum examples");
  await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
  await page.getByTestId("scientific-prepare-reference-publisher").waitFor();
  console.log("SSR-06 packaged reference assets, execution and UI entry passed");
} finally {
  await browser?.close().catch(() => {});
  if (app?.pid && app.exitCode === null) {
    if (process.platform === "win32") {
      const systemRoot = process.env.SystemRoot ?? process.env.windir;
      assert(systemRoot && resolve(systemRoot) === systemRoot);
      try { execFileSync(join(systemRoot, "System32", "taskkill.exe"), ["/PID", String(app.pid), "/T", "/F"],
        { stdio: "ignore", windowsHide: true }); } catch { app.kill(); }
    } else app.kill();
  }
  if (!temp.startsWith(resolve(tmpdir()) + sep) || !temp.includes("m3d-ssr06-package-"))
    throw new Error("Unsafe SSR-06 package test cleanup path");
  for (let attempt = 0; attempt < 15; attempt++) {
    try { await rm(temp, { recursive: true, force: true }); break; }
    catch (error) {
      if (!["EBUSY", "EPERM"].includes(error?.code) || attempt === 14) throw error;
      await delay(200);
    }
  }
}
