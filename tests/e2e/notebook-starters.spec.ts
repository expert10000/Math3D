import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Graph and Curve investigation starters open saved Project Workbooks with current source citations", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const [id, title, source] of [
      ["graph-derivative-notebook", "Graph Derivative Investigation", "parabola"],
      ["curve-construction-notebook", "Curve Construction Investigation", "Measured profile"],
    ] as const) {
      await page.getByTestId("projects-toggle").click();
      const projects = page.getByTestId("project-explorer-panel");
      await projects.getByTestId(`project-template-open-${id}`).click();
      await expect(projects.getByTestId("project-message")).toContainText("Opened supported project workspace");
      const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
      expect(project.metadata.title).toBe(title);
      expect(project.workbooks).toHaveLength(1);
      await projects.getByTestId(`project-open-workbook-${project.workbooks[0].id}`).click();
      await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
      const back = page.getByTestId("project-source-back-to-module");
      if (await back.isVisible()) await back.click();
      await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
      await page.getByTestId("workbook-view-document").click();
      await expect(page.getByTestId(`workbook-document-block-${id}-source-0`)).toContainText(source);
      const book = await page.evaluate(() => {
        const active = localStorage.getItem("math3d.workbooks.active.v1");
        return JSON.parse(localStorage.getItem("math3d.workbooks.v1")!).find((item: { id: string }) => item.id === active);
      });
      expect(book.title).toBe(title);
      expect(book.stages[1].blocks.filter((block: { notebookReference?: unknown }) => block.notebookReference)).toHaveLength(3);
      await page.getByTestId("notes-toggle").click();
      await expect(page.getByTestId("project-notes-panel")).toContainText(id === "graph-derivative-notebook" ? "Derivative source" : "Construction source");
      await page.getByTestId("notes-toggle").click();
    }
  } finally { await closeSurfaceApp(ctx); }
});
