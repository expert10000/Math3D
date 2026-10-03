import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

const [inputPath, outputPath, previewUrl] = process.argv.slice(2);
if (!inputPath || !outputPath || !previewUrl) {
  throw new Error("Provide: received-project output-directory preview-url");
}
const input = resolve(inputPath);
const output = resolve(outputPath);
const bytes = readFileSync(input);
const expected = JSON.parse(bytes.toString("utf8"));
const sha = value => createHash("sha256").update(value).digest("hex");
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 844 } });
  const page = await context.newPage();
  await page.goto(previewUrl);
  await page.evaluate(() => localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"));
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles(input);
  const preview = panel.getByTestId("project-import-preview");
  await preview.waitFor({ state: "visible" });
  // This edited acceptance study has an unchanged, historical Surface companion.
  assert.match(await preview.innerText(), /surface.*preview only/);
  assert.equal(await panel.getByTestId("project-import-open").isEnabled(), false);
  await panel.getByTestId("project-import-save").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="project-message"]')?.textContent?.includes("Imported into the library"));
  const stored = await page.evaluate(id => JSON.parse(localStorage.getItem("math3d.project.v1.payload." + id)), expected.identity.id);
  assert.deepEqual(stored, expected);
  const exportExact = async filename => {
    const download = page.waitForEvent("download");
    await panel.getByTestId("project-export").click();
    const path = resolve(output, filename);
    await (await download).saveAs(path);
    assert.deepEqual(readFileSync(path), bytes);
  };
  await exportExact("fresh-browser-return.math3d.project.json");
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  await panel.getByTestId("project-preview-" + expected.identity.id).click();
  await exportExact("fresh-browser-reloaded.math3d.project.json");
  await page.screenshot({ path: resolve(output, "fresh-browser-import.png") });
  const report = {
    ok: true, host: "fresh Chromium context", testedAtUtc: new Date().toISOString(),
    qualification: "edited Graph with unchanged historical Surface: saved preview; active full-workspace opening disabled",
    payloadSha256: sha(bytes), byteLength: bytes.length,
    exactNamedProjectRetained: true, exportedAndReloaded: true,
    byteIdenticalExportBeforeAndAfterReload: true,
  };
  writeFileSync(resolve(output, "browser-transfer-result.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
