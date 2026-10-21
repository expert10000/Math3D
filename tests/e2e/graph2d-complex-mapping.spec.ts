import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { editGraph, graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";
const core = require(resolve("packages/core/src/index.ts"));

test("GRA-17 desktop reviews and downloads a source-linked Complex contour", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Parametric");
    const editor = graphEditor(page);
    await editor.getByLabel("Parametric name").fill("Complex circle");
    await editor.getByLabel("Parametric x expression").fill("cos(t)");
    await editor.getByLabel("Parametric y expression").fill("sin(t)");
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await panel.getByLabel("Complex contour samples").fill("129");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("129 points · closed contour");
    await expect(panel.getByRole("img", { name: "Complex contour preview" })).toBeVisible();
    const path = resolve("output/graph2d-complex-mapping-e2e.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), path);
    await panel.getByRole("button", { name: "Download Complex Analysis document" }).click();
    await expect.poll(async () => {
      try { return JSON.parse(await readFile(path, "utf8")); } catch { return null; }
    }).toMatchObject({ format: "math3d.complex-analysis-document", provenance: { origin: "graph2d-promotion" } });
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 desktop pairs two independent Graph functions as a Complex contour", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    for (const [name, expression] of [["Real wave", "cos(x)"], ["Imaginary wave", "sin(x)"]] as const) {
      await openGraphType(page, "Function");
      const editor = graphEditor(page);
      await editor.getByLabel("Function name").fill(name);
      await editor.getByLabel("Function expression").fill(expression);
      await editor.getByLabel("Domain minimum").fill("0");
      await editor.getByLabel("Domain maximum").fill(String(2 * Math.PI));
      await saveGraphEditor(page);
    }
    const list = page.getByLabel("Graph functions", { exact: true });
    await list.getByRole("button", { name: "Select Real wave" }).click();
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await expect(panel.getByLabel("Complex imaginary source")).toHaveValue(/.+/);
    await panel.getByLabel("Complex contour samples").fill("129");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("129 points · closed contour");
    await expect(panel).toContainText("Real Graph object");
    await panel.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link.getByRole("status")).toContainText("Source current");
    await expect(link.getByRole("status")).toContainText("imaginary object");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 maps the checked real and imaginary lines of one complex field", async () => {
  test.setTimeout(120_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific field presets" }).click();
    await page.getByRole("dialog", { name: "Scientific field presets" })
      .getByRole("button", { name: "Complex wave packet" }).click();
    const dialog = page.getByRole("dialog", { name: "Import verified scientific dataset" });
    for (const component of ["real", "imaginary"] as const) {
      await dialog.getByLabel("Dataset component").selectOption(`field:${component}`);
      await dialog.getByLabel("Fixed index").selectOption("24");
      await dialog.getByRole("button", { name: "Preview line" }).click();
      await expect(dialog).toContainText("41 checked samples");
      await dialog.getByRole("button", { name: "Import as point series" }).click();
    }
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await page.getByLabel("Graph functions", { exact: true })
      .getByRole("button", { name: /Select Wave amplitude real/ }).click();
    const panel = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await expect(panel.getByLabel("Complex imaginary source")).toHaveValue(/.+/);
    await expect(panel.getByLabel("Complex contour samples")).toHaveValue("41");
    await panel.getByRole("button", { name: "Preview Complex contour" }).click();
    await expect(panel.getByRole("status")).toContainText("41 points");
    await expect(panel).toContainText("Verified complex grid");
    await expect(panel).toContainText("varying axis 0");
    await panel.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link.getByRole("status")).toContainText("Source current");
    await expect(link).toContainText("component checksums");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-17 places a linked contour and reviews a changed Graph before refresh", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Parametric");
    await graphEditor(page).getByLabel("Parametric name").fill("Linked circle");
    await graphEditor(page).getByLabel("Parametric x expression").fill("cos(t)");
    await graphEditor(page).getByLabel("Parametric y expression").fill("sin(t)");
    await saveGraphEditor(page);
    const mapping = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await mapping.getByRole("button", { name: "Preview Complex contour" }).click();
    await mapping.getByRole("button", { name: "Open in Complex Analysis" }).click();
    const link = page.getByRole("region", { name: "Linked Graph contour", exact: true });
    await expect(link.getByRole("status")).toContainText("Source current");
    await expect(page.getByTestId("project-scientific-editor")).toContainText("Saved Complex");

    await page.getByTestId("workspace-nav-graphs").click();
    await editGraph(page, "Linked circle");
    await graphEditor(page).getByLabel("Parametric x expression").fill("2*cos(t)");
    await saveGraphEditor(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await expect(link.getByRole("status")).toContainText("Source changed");
    await link.getByRole("button", { name: "Review contour refresh" }).click();
    await expect(link.getByTestId("graph2d-complex-refresh-review")).toContainText("Complex revision");
    await link.getByRole("button", { name: "Apply reviewed contour refresh" }).click();
    await expect(link.getByRole("status")).toContainText("Source current");
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("kernel-workspace-save").click();
    const workspace = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    const graph = workspace.entries.find((entry: { module: string }) => entry.module === "graph2d");
    const complex = workspace.entries.find((entry: { module: string }) => entry.module === "complex");
    expect(complex.expected.revision).toBe(2);
    expect(complex.checkpoint.provenance.graphSource.revision).toBe(graph.expected.revision);
    expect(complex.checkpoint.contours[0].points).toHaveLength(257);
    const projects = page.getByTestId("project-explorer-panel");
    if (!await projects.isVisible()) await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("math3d.project.v1"))).toBe(true);
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    expect(project.workspace.entries.some((entry: { expected: { id: string } }) =>
      entry.expected.id === complex.expected.id)).toBe(true);
    const linkedEntries = project.workspace.entries.filter((entry: { module: string }) =>
      entry.module === "graph2d" || entry.module === "complex");
    const leanWorkspace = core.createMixedWorkspaceDocument({ entries: linkedEntries,
      activeDocumentIds: linkedEntries.map((entry: { expected: { id: string } }) => entry.expected.id),
      results: [], relations: [], artifacts: [], constructions: [], committedSelection: null });
    const portable = core.createMath3DProject(leanWorkspace,
      { stableKey: "gra17-linked-project", title: "Linked Complex contour" });
    await projects.getByTestId("project-import-file").setInputFiles({ name: "linked-complex.json",
      mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(portable)) });
    await expect(projects.getByTestId("project-import-open")).toBeEnabled();
    await projects.getByTestId("project-import-open").click();
    await expect(link.getByRole("status")).toContainText("Source current");
    await page.getByTestId("workspace-nav-graphs").click();
    if (await projects.isVisible()) await projects.getByRole("button", { name: "Close project explorer" }).click();
    await openGraphType(page, "Parametric");
    await graphEditor(page).getByLabel("Parametric name").fill("Second linked path");
    await graphEditor(page).getByLabel("Parametric x expression").fill("cos(t)");
    await graphEditor(page).getByLabel("Parametric y expression").fill("2*sin(t)");
    await saveGraphEditor(page);
    const second = page.getByRole("region", { name: "Graph to Complex Analysis", exact: true });
    await second.getByRole("button", { name: "Preview Complex contour" }).click();
    await second.getByRole("button", { name: "Open in Complex Analysis" }).click();
    await expect(link.getByRole("status")).toContainText("Source current");
    const restoredProjects = page.getByTestId("project-explorer-panel");
    if (!await restoredProjects.isVisible()) await page.getByTestId("projects-toggle").click();
    await restoredProjects.getByTestId("project-save").click();
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("math3d.project.v1");
      return raw ? JSON.parse(raw).workspace.entries.filter((entry: { module: string }) => entry.module === "complex").length : 0;
    })).toBe(2);
  } finally { await closeSurfaceApp(app); }
});
