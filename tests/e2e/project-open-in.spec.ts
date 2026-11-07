import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Project Open in menu derives a Graph companion and keeps an exact return relation", async () => {
  test.setTimeout(180_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp();
    const page = context.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-derivative-study").click();
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-tab-documents").click();
    const sourceId = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      return project.workspace.entries.find((item: { module: string }) => item.module === "graph2d").expected.id as string;
    });
    const menu = projects.getByTestId(`project-open-in-${sourceId}`);
    await menu.locator("summary").click();
    const action = menu.getByRole("button", { name: /Open .* in Geometry/ });
    await expect(action).toBeEnabled();
    await expect(menu).toContainText("bounded z=0 line segments");
    await action.click();
    await expect(projects.getByTestId("project-message")).toContainText("source-linked companion");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved “");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const relation = saved.workspace.relations.find((item: { operation: string }) =>
      item.operation === "graph2d.promote-geometry");
    expect(relation.sources[0].documentId).toBe(sourceId);
    expect(saved.workspace.entries.some((item: { expected: { id: string } }) =>
      item.expected.id === relation.target.generation.documentId)).toBe(true);
    await projects.getByTestId("project-detail-tab-documents").click();
    const returnLink = projects.getByTestId(`project-open-in-return-${relation.target.generation.documentId}`);
    const returnButton = returnLink.getByRole("button", { name: "Return to source Graph" });
    await expect(returnButton).toBeEnabled();
    await returnButton.click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", sourceId);
  } finally { await closeSurfaceApp(context); }
});

test("Project Open in menu samples a Surface into a saved Mesh with source return", async () => {
  test.setTimeout(180_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp();
    const page = context.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-catenary-study").click();
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-tab-documents").click();
    const sourceId = await page.evaluate(() => {
      const project = JSON.parse(localStorage.getItem("math3d.project.v1")!);
      return project.workspace.entries.find((item: { module: string }) => item.module === "surface").expected.id as string;
    });
    const menu = projects.getByTestId(`project-open-in-${sourceId}`);
    await menu.locator("summary").click();
    const action = menu.getByRole("button", { name: "Open in Mesh Analysis" });
    await expect(action).toBeEnabled();
    await action.click();
    await expect(projects.getByTestId("project-message")).toContainText("source-linked sampled Mesh");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved “");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const relation = saved.workspace.relations.find((item: { operation: string }) =>
      item.operation === "surface.tessellate-saved");
    expect(relation.sources[0].documentId).toBe(sourceId);
    const targetId = relation.target.generation.documentId;
    expect(saved.workspace.entries.find((item: { expected: { id: string } }) => item.expected.id === targetId).module)
      .toBe("mesh");
    await projects.getByTestId("project-detail-tab-documents").click();
    const returnButton = projects.getByTestId(`project-open-in-return-${targetId}`)
      .getByRole("button", { name: "Return to source Surface" });
    await expect(returnButton).toBeEnabled();
    await returnButton.click();
    await expect(page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", sourceId);
  } finally { await closeSurfaceApp(context); }
});

test("Project Open in chains a Graph revolution into a sampled Mesh", async () => {
  test.setTimeout(180_000);
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp();
    const page = context.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-open-derivative-study").click();
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-detail-tab-documents").click();
    const graphId = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!)
      .workspace.entries.find((item: { module: string }) => item.module === "graph2d").expected.id as string);
    const graphMenu = projects.getByTestId(`project-open-in-${graphId}`);
    await graphMenu.locator("summary").click();
    const revolve = graphMenu.getByRole("button", { name: /Revolve .* into Surfaces/ });
    await expect(revolve).toBeEnabled();
    await revolve.click();
    await expect(projects.getByTestId("project-message")).toContainText("source-linked companion");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved “");
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const revolution = first.workspace.relations.find((item: { operation: string }) => item.operation === "graph2d.revolve-surface");
    expect(revolution.sources[0].documentId).toBe(graphId);
    const surfaceId = revolution.target.generation.documentId as string;
    await projects.getByTestId("project-detail-tab-documents").click();
    const surfaceMenu = projects.getByTestId(`project-open-in-${surfaceId}`);
    await surfaceMenu.locator("summary").click();
    const sample = surfaceMenu.getByRole("button", { name: "Open in Mesh Analysis" });
    await expect(sample).toBeEnabled();
    await sample.click();
    await expect(projects.getByTestId("project-message")).toContainText("source-linked sampled Mesh");
    await projects.getByTestId("project-gallery-layout-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect(projects.getByTestId("project-message")).toContainText("Saved “");
    const final = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const mesh = final.workspace.relations.find((item: { operation: string }) => item.operation === "surface.tessellate-saved" &&
      item.sources[0].documentId === surfaceId);
    expect(mesh).toBeTruthy();
    expect(final.workspace.entries.find((item: { expected: { id: string } }) =>
      item.expected.id === mesh.target.generation.documentId).module).toBe("mesh");
  } finally { await closeSurfaceApp(context); }
});
