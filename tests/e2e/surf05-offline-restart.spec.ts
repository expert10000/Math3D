import { expect, test, type Page } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

async function openSavedCatenoid(page: Page): Promise<void> {
  await page.getByTestId("projects-toggle").click();
  await page.getByTestId("project-template-open-catenoid-evidence").click();
  await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "module");
  await expect(page.getByTestId("surface-analysis-contract-identity")).toContainText("revision");
}

async function openCurvature(page: Page): Promise<void> {
  await page.getByTestId("surfaces-left-tab-analysis").click();
  await page.getByTestId("surface-computation-curvature-field").click();
  await expect(page.getByTestId("surface-curvature-compute-button")).toBeEnabled();
}

test("SURF-05 saved Surface recovers from an offline analysis worker after cold restart", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    let page = ctx.page;
    await openSavedCatenoid(page);
    const editor = page.getByTestId("project-source-editor");
    const sourceHash = await editor.getAttribute("data-source-hash");
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      (window as any).Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (String(url).includes("surfaceAnalysisWorker")) throw new Error("Surface Analysis worker offline (injected)");
          super(url, options);
        }
      };
    });
    await openCurvature(page);
    await page.getByTestId("surface-curvature-compute-button").click();
    await expect(page.getByTestId("surface-curvature-execution-state")).toContainText("failed");
    await expect(page.getByTestId("surface-curvature-result")).toHaveCount(0);
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved");
    const projectId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id as string);
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({}, profile);
    page = ctx.page;
    await openLastSavedProject(page);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-source-hash", sourceHash!);
    await openCurvature(page);
    await page.getByTestId("surface-curvature-compute-button").click();
    await expect(page.getByTestId("surface-curvature-execution-state")).toHaveText(/Execution: (ready|cached)/);
    await expect(page.getByTestId("surface-result-qualification")).toHaveAttribute("data-status", "current");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(projectId);
  } finally { await closeSurfaceApp(ctx); }
});
