import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

for (const [template, modules] of [
  ["catenoid-evidence", ["surface", "mesh", "curve", "graph2d"]],
  ["ripple-wave-study", ["surface", "mesh", "geometry", "graph2d"]],
] as const) {
  test(`${template} keeps the Project sidebar level while switching documents`, async () => {
    test.setTimeout(240_000);
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await resizeSurfaceAppWindow(ctx, 1600, 1000);
      const page = ctx.page;
      await page.getByTestId("projects-toggle").click();
      await page.getByTestId(`project-template-open-${template}`).click();
      await expect(page.getByTestId("project-viewer-document")).toBeVisible();
      const entries = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace.entries);
      const positions: { module: string; top: number; headerHeight: number; switcherTop: number }[] = [];
      for (const module of modules) {
        const entry = entries.find((candidate: any) => candidate.module === module);
        expect(entry).toBeTruthy();
        await page.getByTestId("project-viewer-document").selectOption(entry.expected.id);
        await expect(page.getByTestId("project-viewer-document")).toHaveValue(entry.expected.id);
        await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", entry.expected.id);
        const panel = await page.getByTestId("project-explorer-panel").boundingBox();
        const header = await page.getByTestId("project-explorer-header").boundingBox();
        const switcher = await page.getByTestId("project-viewer-document").boundingBox();
        positions.push({ module, top: panel!.y, headerHeight: header!.height, switcherTop: switcher!.y });
      }
      for (const position of positions.slice(1)) {
        expect(Math.abs(position.top - positions[0].top), JSON.stringify(positions)).toBeLessThanOrEqual(1);
        expect(Math.abs(position.headerHeight - positions[0].headerHeight), JSON.stringify(positions)).toBeLessThanOrEqual(1);
        expect(Math.abs(position.switcherTop - positions[0].switcherTop), JSON.stringify(positions)).toBeLessThanOrEqual(1);
      }
    } finally { await closeSurfaceApp(ctx); }
  });
}
