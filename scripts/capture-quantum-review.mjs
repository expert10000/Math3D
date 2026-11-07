import assert from "node:assert/strict";
import { _electron as electron } from "playwright";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

const output = resolve(process.argv[2] ?? "output/quantum-review");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-review-"));
const installedExe = process.env.MATH3D_INSTALLED_CAPTURE_EXE
  ? resolve(process.env.MATH3D_INSTALLED_CAPTURE_EXE) : null;
if (installedExe) await access(installedExe);
const matrix = JSON.parse(await readFile(resolve("docs/evidence/quantum-qi40-scene-matrix.json"), "utf8"));
const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile,
  ...(installedExe ? { MATH3D_E2E: "1", MATH3D_E2E_USER_DATA_DIR: join(profile, "user-data") } : {}) };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch(installedExe
  ? { executablePath: installedExe, args: [`--user-data-dir=${join(profile, "user-data")}`], cwd: dirname(installedExe), env }
  : { args: ["."], cwd: resolve("."), env });
const records = [];
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
  const examples = await page.evaluate(() => window.quantumScenes.examples());
  assert.equal(examples.length, 36, "Pinned example count");
  for (const [index, example] of examples.entries()) {
    const record = { number: index + 1, id: example.id, label: example.label, model: example.model };
    try {
      await page.getByRole("button", { name: "Palette", exact: true }).click();
      await page.getByPlaceholder("Type a command (examples: export, screenshot, run stage)...")
        .fill("Verified quantum examples");
      await page.getByRole("button", { name: "Verified quantum examples", exact: true }).click();
      const chooser = page.getByTestId("quantum-scene-examples");
      await chooser.getByTestId(`quantum-example-${example.id}`).click();
      await page.getByTestId("quantum-scene-preview").waitFor({ state: "visible", timeout: 30000 });
      const opened = await page.evaluate(() => window.quantumScenes.reopenRecent());
      const expected = matrix.fixtures.find(item => item.id === example.id);
      assert(opened.ok && expected && opened.reference.sceneFingerprint === expected.fingerprint,
        `${example.id}: pinned scene fingerprint`);
      record.schema = expected.schema;
      record.fingerprint = expected.fingerprint;
      await page.waitForTimeout(350);
      const filename = `${String(index + 1).padStart(2, "0")}-${example.id}.png`;
      await page.screenshot({ path: join(output, filename), animations: "disabled" });
      record.file = filename;
      if (index === 0) {
        const guidance = page.getByText("A pinned example may not have that run in your Lab profile", { exact: false });
        await guidance.scrollIntoViewIfNeeded();
        const variant = "01-qwz-curvature-source-run-guidance.png";
        await page.screenshot({ path: join(output, variant), animations: "disabled" });
        (record.variants ??= []).push(variant);
      }
      if (example.model === "Hydrogenic") {
        const geometry = page.getByTestId("quantum-scene-geometry");
        for (const [view, suffix] of [["Volume", "volume"], ["Density surface", "density-surface"]]) {
          await geometry.getByRole("button", { name: view, exact: true }).click();
          await page.waitForTimeout(450);
          const variant = `${String(index + 1).padStart(2, "0")}-${example.id}-${suffix}.png`;
          await page.screenshot({ path: join(output, variant), animations: "disabled" });
          (record.variants ??= []).push(variant);
        }
      }
      await page.getByTestId("quantum-scene-close").click();
    } catch (error) {
      record.error = String(error);
      if (await page.getByTestId("quantum-scene-close").count())
        await page.getByTestId("quantum-scene-close").click();
      if (await page.getByTestId("quantum-scene-examples").count())
        await page.getByTestId("quantum-scene-examples").getByRole("button", { name: "Close" }).click();
    }
    records.push(record);
    process.stdout.write(`${record.number}/${examples.length} ${record.id} ${record.error ? "FAILED" : "captured"}\n`);
  }
  await writeFile(join(output, "capture-index.json"), JSON.stringify(records, null, 2));
  const failures = records.filter(item => item.error || !item.file);
  if (records.length !== examples.length || failures.length)
    throw new Error(`Quantum review incomplete: ${records.length - failures.length}/${examples.length} scenes captured; failed: ${failures.map(item => item.id).join(", ")}.`);
  for (const record of records)
    for (const file of [record.file, ...(record.variants ?? [])])
      await access(join(output, file));
} finally {
  await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-review-"))
    throw new Error("Unsafe temporary profile cleanup path.");
  await rm(profile, { recursive: true, force: true });
}
