import { expect, test } from "@playwright/test";

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
  await page.getByTestId("project-import-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
});
