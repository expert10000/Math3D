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
    const tabs = page.getByRole("navigation", { name: "Project details sections" });
    await expect(tabs.getByTestId("project-detail-tab-overview")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("project-sidebar-contents")).toBeHidden();
    await tabs.getByTestId("project-detail-tab-documents").click();
    await expect(page.getByTestId("project-sidebar-contents")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-relations").click();
    await expect(page.getByTestId("project-relationship-map")).toBeVisible();
    await expect(page.getByTestId("project-dependencies")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-results").click();
    await expect(page.getByTestId("project-detail-results")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-history").click();
    await expect(page.getByTestId("project-detail-history")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-overview").click();
    const header = page.getByTestId("project-explorer-header");
    await expect(header.getByTestId("project-viewer-return")).toHaveText("Open current document");
    await expect(header.getByTestId("project-detail-toggle")).toHaveText("Browse projects");
    await expect(header.getByText("More", { exact: true })).toBeVisible();
    await expect(header.locator(".project-placement-controls")).toHaveCount(0);
    await header.getByText("More", { exact: true }).click();
    await expect(header.getByRole("button", { name: "Project settings" })).toBeVisible();
    await tabs.getByTestId("project-detail-tab-history").click();
    await expect(page.getByTestId("project-overview").getByTestId("project-navigation-back")).toBeVisible();
    await tabs.getByTestId("project-detail-tab-overview").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    await expect(dashboard.getByRole("region", { name: "Project documents overview" }).getByRole("listitem")).toHaveCount(4);
    await expect(dashboard.getByRole("complementary", { name: "Project summary" })).toContainText(String(project.workspace.relations.length));
    const surface = project.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    const graph = project.workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    const graphTitle = project.metadata.documents[graph.expected.id].title;
    await expect(dashboard.getByTestId(`project-dashboard-document-${surface.expected.id}`)).toContainText(`From ${graphTitle}`);
    const map = page.getByTestId("project-relationship-map");
    await expect(map.getByRole("listitem")).toHaveCount(project.workspace.relations.length);
    const graphToSurface = project.workspace.relations.find((relation: any) => relation.target.type === "document" &&
      relation.target.generation.documentId === surface.expected.id && relation.sources.some((source: any) => source.documentId === graph.expected.id));
    expect(graphToSurface).toBeTruthy();
    await expect(map.getByTestId(`project-relation-freshness-${graphToSurface.relationId}`)).toHaveText("Up to date");
    await expect(dashboard.getByTestId(`project-document-freshness-${surface.expected.id}`)).toHaveText("Up to date");
    await map.getByTestId(`project-relation-edge-${graphToSurface.relationId}`).click();
    const detail = map.getByTestId("project-relation-detail");
    await expect(detail).toContainText(graphToSurface.operation);
    await expect(detail).toContainText(`Revision ${graphToSurface.sources[0].revision} · generation ${graphToSurface.sources[0].generation}`);
    await expect(detail).toContainText(`Target: ${project.metadata.documents[surface.expected.id].title}`);
    await map.screenshot({ path: test.info().outputPath("project-relationship-map.png"), animations: "disabled" });
    await detail.getByRole("button", { name: "Close relationship details" }).click();
    await page.screenshot({ path: test.info().outputPath("project-dashboard-desktop.png"), animations: "disabled" });
    await resizeSurfaceAppWindow(ctx, 820, 859);
    await expect(dashboard).toBeVisible();
    const columns = await dashboard.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(" ").length);
    expect(columns).toBe(1);
    await dashboard.getByTestId(`project-dashboard-document-${surface.expected.id}`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", surface.expected.id);
    await expect(page.getByTestId("project-explorer-panel")).toHaveClass(/project-viewer-panel/);
    await page.getByTestId("project-gallery-layout-toggle").click();
    await map.getByTestId(`project-relation-node-${graphToSurface.relationId}-source-0`).click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", graph.expected.id);
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid Project Details shows freshness for its saved Mesh analysis", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(page.getByTestId("project-source-editor")).toBeVisible();
    await page.getByTestId("project-gallery-layout-toggle").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.workspace.results.length).toBeGreaterThan(0);
    const result = project.workspace.results[0];
    await expect(page.getByTestId(`project-result-freshness-${result.resultId}`)).toHaveText("Up to date");
    await expect(page.getByTestId("project-relationship-map").getByRole("listitem")).toHaveCount(project.workspace.relations.length);
  } finally { await closeSurfaceApp(ctx); }
});
