/** Installed Math3D acceptance of a fresh installed Theory Lab class-D receipt. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import { expect } from "@playwright/test";
import { createRequire } from "node:module";

const [executable, producerPath, outputArgument] = process.argv.slice(2);
if (![executable, producerPath, outputArgument].every(path => path && isAbsolute(path)))
  throw new Error("Pass absolute installed Math3D executable, producer receipt, and new output directory");
const require = createRequire(import.meta.url);
const { importQuantumSceneBundle } = require("../dist/main/quantumScene/importer.js");
const { sceneFingerprint } = require("../dist/main/quantumScene/recent.js");
const producer = JSON.parse(await readFile(producerPath, "utf8"));
assert.equal(producer.schema, "theory-lab/ute2-installed-producer/v1");
assert.equal(producer.status, "passed");
const output = resolve(outputArgument), profile = join(output, "profile"), transfer = join(output, "transfer");
await mkdir(output); await mkdir(profile); await mkdir(transfer);
const source = join(output, "bulk.qscene"), edgeSource = join(output, "edge.qscene"), pack = join(output, "project.qpack");
await cp(producer.bulk.scene, source, { recursive: true });
await cp(producer.edge.scene, edgeSource, { recursive: true });
const sha = async path => {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
};
assert.equal(await sha(join(source, "scene.json")), producer.bulk.sceneSha256);
assert.equal(await sha(join(edgeSource, "scene.json")), producer.edge.sceneSha256);
const imported = await importQuantumSceneBundle(source), fingerprint = sceneFingerprint(imported);
const edgeImported = await importQuantumSceneBundle(edgeSource), edgeFingerprint = sceneFingerprint(edgeImported);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const launch = async (root, scene = null) => {
  const userData = join(root, "user-data"), cache = join(root, "cache");
  await mkdir(userData, { recursive: true }); await mkdir(cache, { recursive: true });
  const env = { ...process.env, MATH3D_E2E: "1", MATH3D_E2E_PROFILE_ROOT: root,
    MATH3D_E2E_USER_DATA_DIR: userData };
  delete env.ELECTRON_RUN_AS_NODE;
  return electron.launch({ executablePath: executable, cwd: dirname(executable),
    args: [`--user-data-dir=${userData}`, `--disk-cache-dir=${cache}`,
      ...(scene ? ["--quantum-scene", scene] : [])], env });
};
const showStudy = async (page, studyId) => {
  const projects = page.getByTestId("project-explorer-panel");
  if (!await projects.getByTestId("project-research-nav-studies").count())
    await projects.getByTestId("project-gallery-layout-toggle").first().click();
  if (!await projects.getByTestId("project-studies-panel").count())
    await projects.getByTestId("project-detail-toggle").click();
  await projects.getByRole("button", { name: "Studies", exact: true }).click();
  await projects.getByTestId(`project-study-open-${studyId}`).click();
  await expect(projects.getByTestId("project-study-quantum-selection")).toBeVisible();
  return projects;
};
let app = await launch(profile, source);
try {
  let page = await app.firstWindow();
  assert.equal(await app.evaluate(({ app }) => app.isPackaged), true);
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), "2.0.0");
  await expect(page.getByTestId("quantum-scene-preview")).toBeVisible({ timeout: 90_000 });
  const direct = await page.evaluate(request => window.quantumScenes.ute2TopologyReceipt(request), { fingerprint });
  assert.equal(direct.chern, -1); assert.equal(direct.resultSha256, producer.bulk.resultSha256);
  await page.getByTestId("quantum-scene-close").click();
  await page.getByTestId("projects-toggle").click();
  let projects = page.getByTestId("project-explorer-panel");
  await projects.getByTestId("project-attach-quantum-scene").click();
  await expect(page.getByTestId("quantum-scene-preview")).toBeVisible();
  await page.getByTestId("quantum-scene-close").click();
  await projects.getByTestId("project-save").click();
  await expect(projects.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
  await projects.getByTestId(`project-admit-quantum-scene-${fingerprint}`).click();
  await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("staged in Project contents");
  await projects.getByTestId("project-save").click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")).workspace.entries
    .filter(item => item.module === "quantum").length), { timeout: 60_000 }).toBe(1);
  await projects.getByTestId(`quantum-study-template-${fingerprint}`).click();
  await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("layout staged");
  await projects.getByTestId("project-save").click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1"))?.workspace?.quantumStudies?.[0]?.templateId),
    { timeout: 60_000 }).toBe("ute2-topology");
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")));
  assert.equal(first.workspace.quantumStudies[0].templateId, "ute2-topology");
  const studyId = first.workspace.studies[0].id, projectId = first.identity.id;
  projects = await showStudy(page, studyId);
  await projects.getByTestId("project-study-pin-topology").click();
  await expect(projects.getByTestId("project-study-value-receipt")).toContainText('"chern":-1', { timeout: 60_000 });
  await projects.getByTestId("project-save").click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")).workspace.quantumStudies[0].panels[0].sampleIndex),
    { timeout: 60_000 }).toBe(0);
  const evidencePath = join(output, "study-evidence.json");
  await app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) =>
    item.setSavePath(path)), evidencePath);
  await projects.getByTestId("project-study-export-quantum-evidence").click();
  await expect.poll(async () => { try { return (await readFile(evidencePath)).length > 0; } catch { return false; } },
    { timeout: 30_000 }).toBe(true);
  const report = JSON.parse(await readFile(evidencePath, "utf8"));
  assert.equal(report.values.receipt.chern, -1);
  assert.equal(report.resultSha256, producer.bulk.resultSha256);
  await page.screenshot({ path: join(output, "math3d-study.png"), fullPage: true });
  await projects.getByTestId("project-study-publish-quantum-workbook").click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1"))?.workbooks?.length ?? 0),
    { timeout: 60_000 }).toBeGreaterThan(0);
  const cited = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")));
  assert.ok(cited.workbooks?.length >= 1);
  const workbookId = cited.workbooks[0].id;
  if (!await page.getByTestId("project-explorer-panel").isVisible()) await page.getByTestId("projects-toggle").click();
  projects = page.getByTestId("project-explorer-panel");
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, pack);
  await projects.getByTestId("project-export-quantum-pack").click();
  await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Portable quantum Project exported", { timeout: 60_000 });
  const exactEdge = await page.evaluate(async ({ directory, fingerprint }) => {
    const opened = await window.quantumScenes.openReference({ directory, sceneFingerprint: fingerprint });
    if (!opened.ok) throw new Error(opened.error);
    return window.quantumScenes.ute2EdgeReceipt({ fingerprint });
  }, { directory: edgeSource, fingerprint: edgeFingerprint });
  assert.equal(exactEdge.source.bulkResultSha256, producer.bulk.resultSha256);
  assert.deepEqual(exactEdge.widths.map(item => item.width), [12, 24]);
  await app.close();

  app = await launch(profile);
  page = await app.firstWindow();
  await page.getByTestId("projects-toggle").click();
  projects = page.getByTestId("project-explorer-panel");
  await projects.getByTestId(`project-open-saved-${projectId}`).click();
  projects = await showStudy(page, studyId);
  await expect(projects.getByTestId("project-study-value-receipt")).toContainText('"chern":-1', { timeout: 60_000 });
  await app.close();

  app = await launch(transfer);
  page = await app.firstWindow();
  await page.getByTestId("projects-toggle").click();
  projects = page.getByTestId("project-explorer-panel");
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, pack);
  await projects.getByTestId("project-open-quantum-pack").click();
  await expect(projects.getByTestId("project-quantum-scene-message")).toContainText("Portable quantum Project verified", { timeout: 60_000 });
  await page.getByTestId("project-import-open").click();
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1"))?.identity?.id),
    { timeout: 60_000 }).toBe(projectId);
  projects = await showStudy(page, studyId);
  await expect(projects.getByTestId("project-study-value-receipt")).toContainText('"chern":-1', { timeout: 60_000 });
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")));
  assert.equal(restored.workbooks[0].id, workbookId);
  const restoredSource = restored.quantumScenes.find(item => item.sceneFingerprint === fingerprint).directory;
  const bytes = await readFile(join(restoredSource, "bulk-receipt-positions.f64"));
  bytes[0] ^= 1; await writeFile(join(restoredSource, "bulk-receipt-positions.f64"), bytes);
  await projects.getByTestId("project-study-export-quantum-evidence").click();
  await expect(projects.getByTestId("project-study-quantum-withheld")).toBeVisible({ timeout: 60_000 });
  const record = { schema: "math3d/ute2-installed-consumer/v1", status: "passed", sourceCommit,
    executableSha256: await sha(executable), workerSha256: await sha(join(dirname(executable), "resources", "python-worker", "worker.exe")),
    appAsarSha256: await sha(join(dirname(executable), "resources", "app.asar")),
    producerSha256: await sha(producerPath), sceneFingerprint: fingerprint, edgeFingerprint,
    runId: report.runId, resultSha256: report.resultSha256, projectId, workbookId,
    studyEvidenceSha256: await sha(evidencePath), transferredPack: pack,
    transferredProjectId: restored.identity.id, changedSourceWithheld: true };
  await writeFile(join(output, "consumer.json"), JSON.stringify(record, null, 2) + "\n", { flag: "wx" });
  console.log(`Installed Math3D class-D consumer passed: ${projectId}, ${workbookId}`);
} finally { await app.close(); }
