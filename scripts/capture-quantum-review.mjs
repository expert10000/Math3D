import { _electron as electron } from "playwright";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const output = resolve(process.argv[2] ?? "output/quantum-review");
await mkdir(output, { recursive: true });
const profile = await mkdtemp(join(tmpdir(), "math3d-quantum-review-"));
const env = { ...process.env, MATH3D_E2E_PROFILE_ROOT: profile };
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], cwd: resolve("."), env });
const records = [];
try {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1600, 1000));
  const examples = await page.evaluate(() => window.quantumScenes.examples());
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
      await page.waitForTimeout(350);
      const filename = `${String(index + 1).padStart(2, "0")}-${example.id}.png`;
      await page.screenshot({ path: join(output, filename), animations: "disabled" });
      record.file = filename;
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
  if (records.filter(item => item.file).length < 30) throw new Error("Fewer than 30 verified scene screenshots captured.");
} finally {
  await app.close();
  if (!profile.startsWith(resolve(tmpdir()) + sep) || !profile.includes("math3d-quantum-review-"))
    throw new Error("Unsafe temporary profile cleanup path.");
  await rm(profile, { recursive: true, force: true });
}
