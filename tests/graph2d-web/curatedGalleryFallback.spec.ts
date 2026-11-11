import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

test("browser Gallery previews a desktop Study with exact research status", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
  await panel.getByTestId("project-gallery-guided").click();
  const card = panel.getByTestId("curated-study-card-edge-path-evidence");
  await expect(card).toContainText("preview on this host");
  await expect(card.getByTestId("curated-study-open-edge-path-evidence")).toBeDisabled();
  await card.getByTestId("curated-study-preview-edge-path-evidence").click();
  const evidence = page.getByTestId("curated-study-research-preview");
  await expect(evidence).toBeVisible({ timeout: 60_000 });
  await expect(evidence).toContainText("Study sources");
  await expect(evidence).toContainText("Workbook citations");
  await expect(evidence).toContainText("Notes");
  await expect(evidence).toContainText("current");
  await expect(page.getByTestId("project-import-open")).toBeDisabled();
  await expect(page.getByTestId("project-import-limit")).toContainText("desktop");
  if (process.env.MATH3D_GALLERY_CAPTURE_DIR) {
    const directory = process.env.MATH3D_GALLERY_CAPTURE_DIR;
    mkdirSync(directory, { recursive: true });
    await page.screenshot({ path: join(directory, "browser-research-preview.png") });
    writeFileSync(join(directory, "browser-build-identity.json"), JSON.stringify({
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      indexSha256: createHash("sha256").update(readFileSync("apps/web/dist/index.html")).digest("hex"),
      host: "local Chromium preview server", source: "working tree at capture time",
    }, null, 2) + "\n");
  }
  await page.getByTestId("project-import-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
});

test("narrow browser keeps guided source and citation preview readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
  await panel.getByTestId("project-gallery-guided").click();
  await panel.getByTestId("curated-study-preview-edge-path-evidence").click();
  const evidence = page.getByTestId("curated-study-research-preview");
  await expect(evidence).toContainText("Workbook citations", { timeout: 60_000 });
  await expect(evidence).toContainText("Study sources");
  await expect(evidence).toContainText("current");
  const box = await evidence.boundingBox();
  expect(box && box.x >= 0 && box.x + box.width <= 392).toBeTruthy();
  expect(await evidence.evaluate(element => Array.from(element.querySelectorAll("li"))
    .every(item => item.scrollWidth <= item.clientWidth + 1))).toBe(true);
  await expect(page.getByTestId("project-import-limit")).toContainText("desktop");
  if (process.env.MATH3D_UI_CAPTURE_DIR) {
    const directory = process.env.MATH3D_UI_CAPTURE_DIR;
    mkdirSync(directory, { recursive: true });
    await evidence.evaluate(element => element.scrollIntoView({ block: "start", inline: "start" }));
    await page.screenshot({ path: join(directory, "ui-browser-narrow-preview.png") });
    writeFileSync(join(directory, "ui-browser-build-identity.json"), JSON.stringify({
      commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      indexSha256: createHash("sha256").update(readFileSync("apps/web/dist/index.html")).digest("hex"),
      host: "local Chromium preview server", viewport: "390x780", source: "working tree at capture time",
    }, null, 2) + "\n");
  }
});
