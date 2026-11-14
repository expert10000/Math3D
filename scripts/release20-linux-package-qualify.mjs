#!/usr/bin/env node

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { _electron as electron } from "playwright";

const command = promisify(execFile);
const args = Object.fromEntries(process.argv.slice(2).map((value, index, all) =>
  value.startsWith("--") ? [value.slice(2), all[index + 1]] : null).filter(Boolean));
for (const name of ["format", "package", "app", "worker", "receipt", "build-run", "source-sha"])
  if (!args[name]) throw new Error(`Missing --${name}`);

const packagePath = path.resolve(args.package);
const appPath = path.resolve(args.app);
const workerPath = path.resolve(args.worker);
const receiptPath = path.resolve(args.receipt);
const profile = await mkdtemp(path.join(os.tmpdir(), `math3d-linux-${args.format}-`));
const userData = path.join(profile, "user-data");
const packageHash = createHash("sha256");
for await (const chunk of createReadStream(packagePath)) packageHash.update(chunk);
const result = {
  schema: "math3d/release20-linux-package-qualification/v1",
  format: args.format,
  buildRunId: args["build-run"],
  sourceSha: args["source-sha"],
  package: path.basename(packagePath),
  packageSha256: packageHash.digest("hex"),
  packageBytes: (await stat(packagePath)).size,
  appPath,
  workerPath,
  checks: {},
};

function assert(value, message) { if (!value) throw new Error(message); }
async function launch() {
  const env = { ...process.env, MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" };
  for (const name of ["ELECTRON_RUN_AS_NODE", "PYTHONHOME", "PYTHONPATH", "MATH3D_PYTHON", "MATH3D_E2E"])
    delete env[name];
  env.PATH = String(env.PATH ?? "").split(path.delimiter).filter(item => !/python|conda/i.test(item)).join(path.delimiter);
  return electron.launch({ executablePath: appPath, cwd: path.dirname(appPath),
    args: [`--user-data-dir=${userData}`, "--no-sandbox", "--disable-gpu"], env, timeout: 120_000 });
}

try {
  const { stdout } = await command(process.execPath,
    [path.resolve("scripts/smoke-python-worker.mjs"), "--exe", workerPath],
    { timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
  assert(stdout.includes("[smoke] ok"), "Bundled worker did not pass its real-operation smoke");
  result.checks.bundledWorker = "passed";

  let app = await launch();
  let projectId, projectTitle, beforeBytes;
  try {
    assert(await app.evaluate(({ app }) => app.getVersion()) === "2.0.0", "Installed app version is not 2.0.0");
    result.checks.installedVersion = "passed";
    const page = await app.firstWindow();
    await page.getByRole("heading", { name: /^math3d$/i, level: 1 }).waitFor({ timeout: 90_000 });
    result.checks.firstLaunch = "passed";
    const preferences = page.getByTestId("settings-preferences-panel");
    await preferences.waitFor({ state: "visible", timeout: 15_000 });
    await preferences.locator("..").getByRole("button", { name: "Close", exact: true }).click();
    result.checks.firstUsePreferences = "passed";
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-graph-derivative-notebook").click();
    const projectPanel = page.getByTestId("project-explorer-panel");
    if (!await projectPanel.isVisible()) await page.getByTestId("projects-toggle").click();
    await projectPanel.waitFor({ state: "visible" });
    if (!await projectPanel.getByTestId("project-save").isVisible())
      await projectPanel.getByTestId("project-gallery-layout-toggle").first().click();
    await projectPanel.getByTestId("project-save").click();
    await projectPanel.getByTestId("project-message").getByText(/^Saved “/).waitFor();
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    assert(saved, "Project checkpoint absent after save");
    const parsed = JSON.parse(saved);
    projectId = parsed.identity?.id;
    projectTitle = parsed.metadata?.title;
    assert(projectId && projectTitle, "Saved Project lacks identity or title");
    beforeBytes = saved;
    result.checks.projectSave = "passed";
  } finally { await app.close(); }

  app = await launch();
  try {
    const page = await app.firstWindow();
    await page.getByRole("heading", { name: /^math3d$/i, level: 1 }).waitFor({ timeout: 90_000 });
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId(`project-open-saved-${projectId}`).click();
    const reopened = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    assert(reopened, "Project checkpoint absent after cold reopen");
    const parsed = JSON.parse(reopened);
    assert(parsed.identity?.id === projectId && parsed.metadata?.title === projectTitle,
      "Cold reopen changed Project identity or title");
    result.project = { id: projectId, title: projectTitle,
      savedCheckpointSha256: createHash("sha256").update(beforeBytes).digest("hex"),
      reopenedCheckpointSha256: createHash("sha256").update(reopened).digest("hex"),
      exactCheckpointBytes: reopened === beforeBytes };
    result.checks.projectColdReopen = "passed";
  } finally { await app.close(); }
  result.status = "passed";
} catch (error) {
  result.status = "failed";
  result.failure = String(error?.stack ?? error);
  process.exitCode = 1;
} finally {
  await writeFile(receiptPath, JSON.stringify(result, null, 2) + "\n");
  await rm(profile, { recursive: true, force: true });
  process.stdout.write(`${result.format}: ${result.status} ${result.packageSha256}\n`);
  if (result.failure) process.stderr.write(result.failure + "\n");
}
