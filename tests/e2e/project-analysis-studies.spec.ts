import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { launchSurfaceApp, closeSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
const collection = JSON.parse(readFileSync(resolve("renderer/src/projects/examples/samsung-projects.json"), "utf8"));

for (const title of ["Helicoid", "Enneper Study"]) test(`PRJ36–37 ${title} analysis entry point runs qualified studies and preserves historical results`, async () => {
  test.setTimeout(180_000); let ctx: LaunchedSurfaceApp | null = null;
  try {
    const item = collection.projects.find((item: any) => (item.project ?? item).metadata.title === title), project = item.project ?? item;
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), workflow = page.getByTestId("project-saved-mesh-workflow"), id = project.workspace.entries[0].expected.id;
    const show = async () => { if (!await panel.isVisible()) await page.getByTestId("projects-toggle").click(); };
    await show(); await panel.getByTestId("project-import-file").setInputFiles({ name: "study.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(item)) });
    await panel.getByTestId("project-import-open").click();
    await expect(panel.getByTestId(`project-analysis-${id}`)).toContainText(title === "Helicoid" ? "Surface curvature" : "Discrete curvature");
    await panel.getByTestId(`project-open-analysis-${id}`).click(); await expect(panel).toBeHidden(); await expect(workflow).toHaveCount(1);
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-analysis-study").selectOption("edge-path"); await expect(workflow.getByTestId("project-analysis-run-study")).toBeDisabled();
    await workflow.getByTestId("project-analysis-study").selectOption("curvature"); await workflow.getByTestId("project-analysis-run-study").click();
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (1)");
    await workflow.getByTestId("project-analysis-run-study").click(); await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (1)");
    await workflow.getByTestId("project-analysis-study").selectOption("quality"); await workflow.getByTestId("project-analysis-run-study").click();
    await workflow.getByTestId("project-analysis-study").selectOption("edge-path"); await workflow.getByTestId("project-saved-mesh-path-start").fill("-1");
    await workflow.getByTestId("project-analysis-run-study").click(); await expect(workflow.getByRole("alert")).toContainText("nonnegative whole");
    await expect(workflow.getByTestId("project-saved-mesh-choice").locator("option")).toHaveCount(1);
    await workflow.getByTestId("project-saved-mesh-path-start").fill("0"); await workflow.getByTestId("project-analysis-run-study").click();
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)"); await expect(workflow).toContainText("not a certified continuous geodesic");
    const originalMesh = await workflow.getByTestId("project-saved-mesh-choice").inputValue();
    if (title === "Helicoid") await page.getByTestId("project-surface-z").fill("0.5*u");
    else { await page.getByTestId("project-surface-field-phi").fill("2"); await page.getByTestId("project-surface-apply").click(); }
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Historical source");
    await workflow.getByTestId("project-analysis-study").selectOption("curvature"); await workflow.getByTestId("project-analysis-run-study").click();
    expect(await workflow.getByTestId("project-saved-mesh-choice").inputValue()).not.toBe(originalMesh);
    await expect(workflow.getByTestId("project-saved-mesh-freshness")).toContainText("Current source");
    await workflow.getByTestId("project-saved-mesh-choice").selectOption(originalMesh); await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)");
    await workflow.getByTestId("project-saved-mesh-open").click(); await expect(page.getByTestId("project-mesh-editor")).toBeVisible(); await expect(workflow).toHaveCount(1);
    await workflow.getByTestId("project-analysis-studies").locator("summary").click();
    await workflow.getByTestId("project-analysis-study").selectOption("quality"); await workflow.getByTestId("project-analysis-run-study").click();
    await expect(workflow.getByTestId("project-saved-mesh-results")).toContainText("Saved analysis (3)");
  } finally { await closeSurfaceApp(ctx); }
});
