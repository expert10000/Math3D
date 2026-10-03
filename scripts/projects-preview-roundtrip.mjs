import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright";

// Inspect/export only: no native app install, storage seeding or editor activation.
const [inputPath, outputPath, previewUrl] = process.argv.slice(2);
if (!inputPath || !outputPath || !previewUrl) throw new Error("Provide: received-project output-directory preview-url");
const raw = readFileSync(resolve(inputPath)), expected = JSON.parse(raw), output = resolve(outputPath);
assert.equal(expected.format, "math3d.project");
mkdirSync(output, { recursive: true });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 844 } });
  const page = await context.newPage();
  await page.goto(previewUrl);
  await page.evaluate(() => localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"));
  await page.reload(); await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles(resolve(inputPath));
  await panel.getByTestId("project-import-preview").waitFor();
  await panel.getByTestId("project-import-save").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="project-message"]')?.textContent?.includes("Imported into the library"));
  assert.deepEqual(await page.evaluate(id => JSON.parse(localStorage.getItem("math3d.project.v1.payload." + id)), expected.identity.id), expected);
  const exportPreview = async name => {
    const download = page.waitForEvent("download"); await panel.getByTestId("project-export").click();
    const bytes = readFileSync(await (await download).path());
    assert.deepEqual(JSON.parse(bytes), expected); assert.equal(sha(bytes), sha(raw)); writeFileSync(resolve(output, name), bytes);
  };
  await exportPreview("browser-return.math3d.project.json");
  await page.reload(); await page.getByTestId("projects-toggle").click();
  await panel.getByTestId(`project-preview-${expected.identity.id}`).click();
  await exportPreview("browser-reloaded.math3d.project.json");
  await panel.screenshot({ path: resolve(output, "browser-preview.png") });
  writeFileSync(resolve(output, "result.json"), JSON.stringify({ ok: true, projectId: expected.identity.id, bytes: raw.length,
    sha256: sha(raw), documents: expected.workspace.entries.length, modules: [...new Set(expected.workspace.entries.map(entry => entry.module))],
    results: expected.workspace.results.length, relations: expected.workspace.relations.length, freshProfile: true, reload: true }, null, 2) + "\n");
  console.log("Complete named preview survived fresh browser import, byte-exact export and reload.");
} finally { await browser.close(); }
