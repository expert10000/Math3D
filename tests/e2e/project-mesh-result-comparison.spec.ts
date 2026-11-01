import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls, projectFreezeFixture } from "./helpers/projectFreeze";

test("PC13 exports exact saved Mesh result differences and reopens after restart", async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const fixture = projectFreezeFixture();
    const meshId = fixture.project.workspace.entries.find((item: any) => item.module === "mesh" && item.expected.id !== fixture.targets.mesh)?.expected.id as string;
    if (!meshId) throw new Error("A saved Mesh fixture is required.");
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page);
    await controls.importOpen(fixture.raw); await controls.open(meshId);
    await page.getByTestId("project-mesh-study-view").click();
    await page.getByTestId("project-saved-mesh-quality").click();
    await page.getByTestId("project-mesh-retain-subdivide").click();
    await page.getByTestId("project-mesh-study-view").click();
    await page.getByTestId("project-saved-mesh-quality").click();
    const saved = await controls.save();
    const resultIds = saved.workspace.results.filter((item: any) => item.provenance.operation.type === "mesh.saved.quality" && item.provenance.source.documentId === meshId).map((item: any) => item.resultId);
    expect(resultIds).toHaveLength(2);
    await controls.panel.getByTestId("project-open-mesh-result-comparison").click();
    const view = page.getByTestId("project-mesh-result-comparison");
    await expect(view.getByTestId("project-mesh-result-status")).toContainText("compatible");
    await expect(view.getByText("metrics.triangleArea.avg")).toBeVisible();
    const report = test.info().outputPath("pc13-saved-mesh-results.html");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), report);
    await view.getByTestId("project-mesh-result-export").click();
    await expect.poll(() => { try { return readFileSync(report).length > 0; } catch { return false; } }, { timeout: 30_000 }).toBe(true);
    const html = readFileSync(report, "utf8");
    for (const id of resultIds) expect(html).toContain(id);
    expect(html).toContain("unqualified");
    await view.getByRole("button", { name: "Close" }).click();
    await page.reload(); await controls.reopen(saved.identity.id);
    await page.getByTestId("project-explorer-panel").getByTestId("project-open-mesh-result-comparison").click();
    await expect(view.getByTestId("project-mesh-result-status")).toContainText("compatible");
    await expect(view.getByText("retained", { exact: false }).first()).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});
