#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
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
  packageBytes: (await stat(packagePath)).size, expectedVersion, checks: {},
};

function assert(value, message) { if (!value) throw new Error(message); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
async function launch(targetProfile = profile) {
  const targetUserData = path.join(targetProfile, "user-data");
  const env = { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_PROFILE_ROOT: targetProfile,
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

async function journeyPhase() {
  assert(args.worker, "Journey needs --worker");
  const { stdout } = await command(process.execPath,
    [path.resolve("scripts/smoke-python-worker.mjs"), "--exe", path.resolve(args.worker)],
    { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  assert(stdout.includes("[smoke] ok"), "Bundled worker real-operation smoke failed");
  result.checks.bundledWorker = "passed";
  let app = await launch();
  let projectId, checkpoint;
  try {
    const page = await ready(app);
    await page.getByTestId("workspace-nav-mesh").click();
    await page.waitForFunction(() => !!window.__MATH3D_E2E_MESH_BENCHMARK__ &&
      !!window.__MATH3D_E2E_MESH_OPERATION__, null, { timeout: 30_000 });
    const loaded = await page.evaluate(() => window.__MATH3D_E2E_MESH_BENCHMARK__.loadBenchmarkModel("cube-obj"));
    assert(loaded.ok, `Mesh fixture failed: ${loaded.error}`);
    const operation = await page.evaluate(() => window.__MATH3D_E2E_MESH_OPERATION__.run("clean-normals"));
    assert(operation.ok, `Installed VTK Mesh operation failed: ${operation.error}`);
    const diagnostics = await page.evaluate(() => window.pythonWorkerDiagnostics.getStatus());
    assert(diagnostics.available, `Bundled worker unavailable after Mesh operation: ${diagnostics.statusMessage}`);
    result.worker = { backend: diagnostics.backend, version: diagnostics.version,
      artifactSha256: diagnostics.runtime?.artifactSha256 ?? null };
    result.checks.installedMeshOperation = "passed";
    const panel = await openProjectPanel(page);
    await panel.getByTestId("project-title").fill("Linux installed VTK Mesh study");
    await panel.getByTestId("project-save").click();
    await panel.getByTestId("project-message").getByText(/^Saved “/).waitFor();
    checkpoint = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    const saved = JSON.parse(checkpoint);
    projectId = saved.identity?.id;
    assert(projectId && saved.workspace?.entries?.some(entry => /mesh/i.test(entry.module)),
      "Worker-backed Mesh Project was not saved");
    result.project = { id: projectId, title: saved.metadata?.title,
      checkpointSha256: sha256(checkpoint), checkpointBytes: Buffer.byteLength(checkpoint),
      modules: saved.workspace.entries.map(entry => entry.module) };
    result.checks.meshProjectSave = "passed";
  } finally { await app.close(); }
  app = await launch();
  try {
    const page = await ready(app);
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId(`project-open-saved-${projectId}`).click();
    const reopened = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    assert(reopened && sha256(reopened) === result.project.checkpointSha256,
      "Installed Mesh Project changed on cold reopen");
    result.checks.meshProjectColdReopen = "passed";
  } finally { await app.close(); }
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
