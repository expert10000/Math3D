#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { promisify } from "node:util";
import { _electron as electron } from "playwright";

const command = promisify(execFile);
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) =>
  value.startsWith("--") ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
for (const name of ["phase", "format", "package", "app", "profile", "receipt"])
  if (!args[name]) throw new Error(`Missing --${name}`);
if (!["seed", "upgrade", "rollback", "journey"].includes(args.phase))
  throw new Error(`Unknown phase: ${args.phase}`);

const packagePath = path.resolve(args.package);
const appPath = path.resolve(args.app);
const profile = path.resolve(args.profile);
const userData = path.join(profile, "user-data");
const receiptPath = path.resolve(args.receipt);
const expectedVersion = args.phase === "seed" || args.phase === "rollback" ? "1.7.0" : "2.0.0";
const projectTitle = "Linux upgrade Graph from v1.7.0";
const checkpointKey = "math3d.mixed-workspace.v1";
const packageHash = createHash("sha256");
for await (const chunk of createReadStream(packagePath)) packageHash.update(chunk);
const result = {
  schema: "math3d/release20-linux-upgrade-phase/v1", phase: args.phase, format: args.format,
  package: path.basename(packagePath), packageSha256: packageHash.digest("hex"),
  packageBytes: (await stat(packagePath)).size, expectedVersion, sourceCommit: args["source-sha"], harnessCommit: process.env.GITHUB_SHA, scope: "Installed Linux deb; frozen Python/VTK worker; Mesh operation uses existing application test hook, refresh/save/reopen use UI. No Windows/Sage/signing qualification.", checks: {},
};

function assert(value, message) { if (!value) throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function launch(targetProfile = profile) {
  const targetUserData = path.join(targetProfile, "user-data");
  const env = { ...process.env, MATH3D_E2E: "1", MATH3D_WORKER_MODE: "exe", MATH3D_E2E_PROFILE_ROOT: targetProfile,
    MATH3D_E2E_USER_DATA_DIR: targetUserData, MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" };
  for (const name of ["ELECTRON_RUN_AS_NODE", "PYTHONHOME", "PYTHONPATH", "MATH3D_PYTHON"])
    delete env[name];
  env.PATH = String(env.PATH ?? "").split(path.delimiter).filter(item => !/python|conda/i.test(item)).join(path.delimiter);
  return electron.launch({ executablePath: appPath, cwd: path.dirname(appPath),
    args: [`--user-data-dir=${targetUserData}`, "--no-sandbox", "--disable-gpu"], env, timeout: 120_000 });
}
async function ready(app) {
  assert(await app.evaluate(({ app }) => app.getVersion()) === expectedVersion,
    `Installed version is not ${expectedVersion}`);
  assert(await app.evaluate(({app}) => app.isPackaged), "Source Electron is not installed qualification");
  const page = await app.firstWindow();
  await page.getByRole("heading", { name: /^math3d$/i, level: 1 }).waitFor({ timeout: 90_000 });
  result.checks.launch = "passed";
  return page;
}
async function openProjectPanel(page) {
  const panel = page.getByTestId("project-explorer-panel");
  if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click();
  await panel.waitFor({ state: "visible" });
  if (!await panel.getByTestId("project-save").isVisible())
    await panel.getByTestId("project-gallery-layout-toggle").first().click();
  return panel;
}

async function graphPhase() {
  const app = await launch();
  try {
    const page = await ready(app);
    await page.getByTestId("top-settings-button").click();
    const setting = page.getByTestId("settings-command-preview-overlays-toggle");
    await setting.waitFor({ state: "visible" });
    if (args.phase === "seed") await setting.setChecked(false);
    assert(!await setting.isChecked(), "Saved preview-overlay setting was not retained");
    await page.getByRole("button", { name: "Close", exact: true }).click();
    result.checks.profileSetting = "passed";
    await page.getByTestId("workspace-nav-graphs").click();
    if (args.phase === "seed") {
      await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Add Graph" }).click();
      await page.getByRole("dialog", { name: "Choose graph type" })
        .getByRole("button", { name: "Function", exact: true }).click();
      const editor = page.getByRole("dialog", { name: "Create graph" });
      const form = editor.getByRole("form", { name: "New function" });
      await form.getByLabel("Start from preset").selectOption("parabola");
      await form.getByLabel("Function expression").fill("x^2 + 1");
      await form.getByRole("button", { name: "Preview", exact: true }).click();
      await editor.getByLabel("Graph preview", { exact: true }).getByText("y = x^2 + 1").waitFor();
      await editor.getByRole("button", { name: "Create graph" }).click();
      await editor.waitFor({ state: "hidden" });
    }
    await page.getByTestId("graph-gallery-open").click();
    let gallery = page.getByTestId("graph-gallery");
    await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    if (args.phase === "seed") {
      await gallery.getByLabel("Reusable copy title").fill(projectTitle);
      await gallery.getByRole("button", { name: "Save current as reusable copy" }).click();
      await page.getByTestId("graph-gallery-open").click();
      gallery = page.getByTestId("graph-gallery");
      await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
    }
    const savedButton = gallery.getByRole("button", { name: `Open project ${projectTitle}`, exact: true });
    await savedButton.waitFor({ state: "visible" });
    const checkpoint = await page.evaluate(key => localStorage.getItem(key), checkpointKey);
    assert(checkpoint?.includes(projectTitle) && checkpoint.includes("x^2 + 1"),
      "Named Graph Project or authored expression missing from checkpoint");
    const graph = JSON.parse(checkpoint).entries.find(entry => entry.module === "graph2d")?.checkpoint;
    assert(graph?.source?.objects?.length > 0, "Graph Project has no authored object");
    result.project = { title: projectTitle, checkpointSha256: sha256(checkpoint),
      checkpointBytes: Buffer.byteLength(checkpoint), graphObjects: graph.source.objects.length };
    if (args.phase !== "seed") {
      const seed = JSON.parse(await readFile(path.resolve(args.seed), "utf8"));
      assert(result.project.checkpointSha256 === seed.project.checkpointSha256,
        "Project checkpoint bytes changed across upgrade or rollback");
      await savedButton.click();
      await gallery.waitFor({ state: "hidden" });
    }
    result.checks.graphProject = "passed";
  } finally { await app.close(); }
}

async function center(page, state) {
  await page.getByTestId("top-compute-center-button").click();
  const panel = page.getByTestId("compute-center");
  await expect(panel.getByRole("button", {name:/^Refresh/})).toBeEnabled({timeout:90000});
  await panel.getByRole("button", {name:"Refresh",exact:true}).click();
  for (const route of ["python", "vtk"])
    await expect(panel.getByTestId(`runtime-route-${route}`).getByLabel(state,{exact:true})).toBeVisible({timeout:90000});
  await panel.getByRole("button",{name:"Close",exact:true}).click();
}
async function observe(app) {
  return app.evaluate(async ({app}) => {
    const req = process.getBuiltinModule("module").createRequire(process.getBuiltinModule("path").join(app.getAppPath(),"dist/main.js"));
    const worker = await req("./main/python/pythonWorker.js").getPythonWorker();
    const child = worker.proc;
    const original = worker.vtkMesh.bind(worker);
    globalThis.__installedReplies = [];
    worker.vtkMesh = async (...args) => {
      const output = await original(...args);
      if (output.ok) globalThis.__installedReplies.push(Object.fromEntries(["positions","indices","normals"].map(key => [key,output[key] ? req("node:crypto").createHash("sha256").update(Buffer.from(output[key])).digest("hex") : null])));
      return output;
    };
    return {pid:child.pid,executable:child.spawnfile,health:await worker.health(),version:await worker.version(),appPath:app.getAppPath()};
  });
}
async function journeyPhase() {
  assert(args.worker, "Journey needs actual installed --worker");
  const workerPath = path.resolve(args.worker), mode = (await stat(workerPath)).mode;
  result.workerSha256 = sha256(await readFile(workerPath));
  let app;
  try {
    app = await launch(); let page = await ready(app);
    await center(page,"ready");
    result.initialWorker = await observe(app);
    assert(path.resolve(result.initialWorker.executable) === workerPath, "Worker process is not the installed frozen executable");
    assert(result.initialWorker.health.ok, "Installed worker handshake failed");
    await page.getByTestId("workspace-nav-mesh").click();
    await page.waitForFunction(() => !!window.__MATH3D_E2E_MESH_BENCHMARK__ && !!window.__MATH3D_E2E_MESH_OPERATION__);
    const loaded = await page.evaluate(() => window.__MATH3D_E2E_MESH_BENCHMARK__.loadBenchmarkModel("cube-obj"));
    assert(loaded.ok, `Fixture load: ${loaded.error}`);
    const compute = async () => {
      const output = await page.evaluate(() => window.__MATH3D_E2E_MESH_OPERATION__.run("clean-normals"));
      assert(output.ok, `Installed VTK operation failed: ${output.error}`);
      const replies = await app.evaluate(() => globalThis.__installedReplies);
      assert(replies.length === 1, "Expected exactly one real VTK reply"); return replies[0];
    };
    result.output = await compute();
    let panel = await openProjectPanel(page);
    await panel.getByTestId("project-title").fill("Installed frozen runtime recovery");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText('Saved “');
    const checkpoint = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const saved = JSON.parse(checkpoint), projectId = saved.identity?.id;
    assert(projectId && saved.workspace.entries.some(e => /mesh/i.test(e.module)), "Computed Mesh was not saved");
    result.project = {id:projectId, checkpointSha256:sha256(checkpoint), identities:saved.workspace.entries.map(e=>e.expected), results:saved.workspace.results};
    result.checks.computeSave = "passed";
    await chmod(workerPath,0);
    result.lostWorker = await app.evaluate(async ({app}) => {
      const req=process.getBuiltinModule("module").createRequire(process.getBuiltinModule("path").join(app.getAppPath(),"dist/main.js"));
      const worker=await req("./main/python/pythonWorker.js").getPythonWorker();
      const child=worker.proc,pid=child.pid;
      await new Promise(done=>{child.once("exit",done);child.kill("SIGKILL");});return {pid};
    });
    assert(result.lostWorker.pid === result.initialWorker.pid,"Wrong worker terminated");
    await center(page,"unavailable");
    assert(sha256(await page.evaluate(()=>localStorage.getItem("math3d.project.v1")))===result.project.checkpointSha256,"Runtime loss changed saved Project");
    result.checks.actualRuntimeLossRetainsProject = "passed";
    await app.close(); app=null;
    app=await launch();page=await ready(app);
    panel=await openProjectPanel(page);
    await panel.getByTestId(`project-open-saved-${projectId}`).click();
    await expect(panel.getByTestId("project-message")).toContainText("Opened supported project workspace");
    const reopened=await page.evaluate(()=>localStorage.getItem("math3d.project.v1"));
    assert(sha256(reopened)===result.project.checkpointSha256,"Offline cold-reopen changed identities, hashes or results");
    await center(page,"unavailable");
    result.checks.offlineColdReopen = "passed";
    await chmod(workerPath,mode);
    await center(page,"ready");
    result.recoveredWorker=await observe(app);
    assert(result.recoveredWorker.pid!==result.initialWorker.pid,"Expected fresh worker PID");
    assert(result.recoveredWorker.health.ok && result.recoveredWorker.version.protocol===result.initialWorker.version.protocol,"Recovered handshake mismatch");
    result.checks.reconnectCapabilityRefresh = "passed";
    await page.getByTestId("workspace-nav-mesh").click();
    result.retriedOutput=await compute();
    assert(JSON.stringify(result.retriedOutput)===JSON.stringify(result.output),"Retry changed computed output bytes");
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem("math3d.project.v1")));
    assert(JSON.stringify(after.workspace.results)===JSON.stringify(saved.workspace.results),"Retry changed historical references");
    result.checks.successfulRetry = "passed";
    assert(sha256(await readFile(workerPath))===result.workerSha256,"Worker bytes changed");
  } finally {
    await chmod(workerPath,mode);
    if(app) await app.close();
  }
}

try {
  if (args.phase === "journey") await journeyPhase();
  else await graphPhase();
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.failure = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await writeFile(receiptPath, JSON.stringify(result, null, 2) + "\n");
  process.stdout.write(`${args.format} ${args.phase}: ${result.status}\n`);
  if (result.failure) process.stderr.write(result.failure + "\n");
}
