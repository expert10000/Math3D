import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pc28CoordinateReviewProject } from "../e2e/helpers/pc28CoordinateReviewFixture";

test("PC28 browser reopens a portable coordinate review and its exact marker", async ({ page }) => {
  const fixture = pc28CoordinateReviewProject();
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: "pc28.resources.json",
    mimeType: "application/json", buffer: Buffer.from(fixture.raw) });
  await expect(panel.getByTestId("project-import-open")).toBeEnabled();
  await panel.getByTestId("project-import-open").click();
  await expect(panel.getByTestId("project-workbooks")).toContainText("Workbook");
  await panel.getByTestId("project-gallery-layout-toggle").click();
  await panel.getByTestId("project-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("Saved");
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  await panel.getByTestId(`project-preview-${fixture.projectId}`).click();
  await panel.getByTestId("project-restore-saved").click();
  await expect(panel.getByTestId("project-import-open")).toBeEnabled();
  await panel.getByTestId("project-import-open").click();
  await panel.getByTestId(`project-open-workbook-${fixture.workbookId}`).click();
  await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
  await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
  await page.getByRole("button", { name: /^3 Visualize$/ }).click();
  const review = page.getByTestId("workbook-coordinate-review").first();
  await review.getByText("Show embedded coordinate review").click();
  await expect(review.getByTestId(`workbook-coordinate-review-row-${fixture.noteId}`)).toContainText("verified");
  await expect(review.getByTestId("workbook-coordinate-marker")).toContainText("0.1, 0.2, 0 m");
  const downloadPromise = page.waitForEvent("download");
  await review.getByRole("button", { name: "Export coordinate review HTML" }).click();
  const html = readFileSync((await (await downloadPromise).path())!, "utf8");
  expect(html).toContain("Authored PC28 review observation.");
  expect(html).toContain("0.1, 0.2, 0");
  await review.getByRole("button", { name: "Open saved marker" }).click();
  const view = page.getByTestId("project-composition-view");
  await expect(view.getByLabel("Saved composition")).toHaveValue(fixture.compositionId);
  await expect(view.getByTestId("project-composition-probe-status")).toContainText("Saved coordinate");
  const canvas = await view.locator("canvas").first().elementHandle();
  await view.getByRole("button", { name: "Close" }).click();
  await expect(view).toHaveCount(0);
  if (canvas) await expect.poll(() => canvas.evaluate(element => element.isConnected)).toBe(false);
});

test("PC28 browser refuses a portable package with changed source or Note bytes", async ({ page }) => {
  const fixture = pc28CoordinateReviewProject();
  const packageData = JSON.parse(fixture.raw);
  const altered = structuredClone(packageData);
  const sidecar = altered.resources.find((item: { kind: string }) => item.kind === "mesh-buffers");
  expect(sidecar).toBeTruthy();
  sidecar.data = (sidecar.data[0] === "A" ? "B" : "A") + sidecar.data.slice(1);
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-import-file").setInputFiles({ name: "pc28-tampered.resources.json",
    mimeType: "application/json", buffer: Buffer.from(JSON.stringify(altered)) });
  await expect(panel.getByTestId("project-message")).toContainText("Project import rejected");
  await expect(panel.getByTestId("project-import-open")).toHaveCount(0);
  const changedNote = structuredClone(packageData);
  changedNote.project.notes[0].body = "Forged observation";
  await panel.getByTestId("project-import-file").setInputFiles({ name: "pc28-note-tampered.resources.json",
    mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changedNote)) });
  await expect(panel.getByTestId("project-message")).toContainText("Project import rejected");
  await expect(panel.getByTestId("project-import-open")).toHaveCount(0);
});
