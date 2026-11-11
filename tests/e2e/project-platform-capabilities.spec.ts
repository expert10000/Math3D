import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createGraph2DWorkspaceProject, createMath3DProject, getGraph2DPresetCatalog,
  instantiateGraph2DPreset, serializeMath3DProject } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("desktop reviews missing sources, then reopens verified research evidence after restart", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const graph = instantiateGraph2DPreset(getGraph2DPresetCatalog().get("piecewise-data-gaps")!, "platform-desktop").document;
    const missing = createMath3DProject(createGraph2DWorkspaceProject(graph), { stableKey: "platform-desktop-missing" });
    const researchBytes = readFileSync("tests/fixtures/project-workbook-note-journey.json");
    const research = JSON.parse(researchBytes.toString("utf8")).project;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    let page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    let panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-import-file").setInputFiles({ name: "missing.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(missing)) });
    await expect(panel.getByTestId("project-import-preview")).toContainText("missing or unverified");
    await expect(panel.getByTestId("project-import-open")).toBeDisabled();
    await expect(panel.getByTestId("project-import-save")).toBeEnabled();
    await panel.getByTestId("project-import-cancel").click();
    expect(await page.evaluate(() => localStorage.getItem("math3d.project-library.v1"))).toBeNull();

    await panel.getByTestId("project-import-file").setInputFiles({ name: "research-package.json", mimeType: "application/json", buffer: researchBytes });
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await panel.getByTestId("project-import-open").click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(research.identity.id);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId(`project-open-saved-${research.identity.id}`).click();
    await expect(panel.getByTestId("project-workbooks")).toContainText("Graph Derivative Investigation");
    const saved = await page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`), research.identity.id);
    expect(JSON.parse(saved!).workspace.results).toEqual(research.workspace.results);
    expect(JSON.parse(saved!).notes).toEqual(research.notes);
  } finally { await closeSurfaceApp(ctx); }
});
