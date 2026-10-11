import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Project Details dashboard uses stored document relations and opens a document", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-ripple-wave-study").click();
    await page.getByTestId("project-gallery-layout-toggle").click();
    const dashboard = page.getByTestId("project-dashboard");
    await expect(dashboard).toBeVisible();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await expect(dashboard.getByRole("region", { name: "Project documents overview" }).getByRole("listitem")).toHaveCount(4);
    await expect(dashboard.getByRole("complementary", { name: "Project summary" })).toContainText(String(project.workspace.relations.length));
    const surface = project.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    const graph = project.workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    const graphTitle = project.metadata.documents[graph.expected.id].title;
    await expect(dashboard.getByTestId(`project-dashboard-document-${surface.expected.id}`)).toContainText(`From ${graphTitle}`);
    await page.screenshot({ path: test.info().outputPath("project-dashboard-desktop.png"), animations: "disabled" });
    await resizeSurfaceAppWindow(ctx, 820, 859);
    await expect(dashboard).toBeVisible();
    const columns = await dashboard.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(1);
    await dashboard.getByTestId(`project-dashboard-document-${surface.expected.id}`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", surface.expected.id);
    await expect(page.getByTestId("project-explorer-panel")).toHaveClass(/project-viewer-panel/);
  } finally { await closeSurfaceApp(ctx); }
});
