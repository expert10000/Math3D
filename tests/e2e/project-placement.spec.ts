import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { openLastSavedProject, closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("open Project placements preserve document and Note editing across modules", async () => {
  test.setTimeout(240_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-graph-derivative-notebook").click();
    await expect(panel).toHaveAttribute("data-project-placement", "left");
    const toggle = page.getByRole("button", { name: "Project", exact: true });
    await expect(toggle).toBeVisible(); await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1")!);
    const project = JSON.parse(saved), graph = project.workspace.entries.find((entry: any) => entry.module === "graph2d");
    const curve = project.workspace.entries.find((entry: any) => entry.module === "curve");
    await panel.getByTestId("project-viewer-document").selectOption(curve.expected.id);
    await expect(panel.getByTestId("project-viewer-document")).toHaveValue(curve.expected.id);
    await panel.getByTestId("project-viewer-document").selectOption(graph.expected.id);
    await expect(panel.getByTestId("project-viewer-document")).toHaveValue(graph.expected.id);

    await panel.getByTestId("project-all-notes").click();
    const note = panel.getByTestId(`project-note-${project.notes[0].identity.id}`);
    await note.getByRole("button", { name: "Edit", exact: true }).click();
    await note.getByRole("textbox", { name: "Note body", exact: true }).fill("Unsaved observation survives placement changes.");
    for (const placement of ["right", "middle", "all", "left"] as const) {
      await panel.getByTestId(`project-placement-${placement}`).click();
      await expect(panel).toHaveAttribute("data-project-placement", placement);
      await expect(panel.getByTestId(`project-placement-${placement}`)).toHaveAttribute("aria-pressed", "true");
      await expect(toggle).toBeVisible();
      expect(await toggle.evaluate(button => { const rect = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
      await expect(note.getByRole("textbox", { name: "Note body", exact: true })).toHaveValue("Unsaved observation survives placement changes.");
      await expect(panel.getByTestId("project-viewer-document")).toHaveValue(graph.expected.id);
      expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
      if (placement === "all") await expect(page.getByTestId("module-workspace")).toBeHidden();
      if (placement === "left" || placement === "right") {
        const bounds = (await panel.boundingBox())!, workspace = (await page.getByTestId("module-workspace").boundingBox())!;
        if (placement === "left") expect(workspace.x).toBeGreaterThanOrEqual(bounds.x + bounds.width);
        else expect(workspace.x + workspace.width).toBeLessThanOrEqual(bounds.x);
      }
      await page.screenshot({ path: test.info().outputPath(`project-${placement}.png`) });
    }
    await note.getByRole("button", { name: "Cancel", exact: true }).click();
    await panel.getByTestId("project-notes-panel").getByRole("button", { name: "Back to Project", exact: true }).click();
    for (const module of ["geometry", "mesh", "surfaces", "volume", "curves", "graphs", "topology", "complex_analysis"]) {
      await page.getByTestId(`workspace-nav-${module}`).click();
      await expect(panel).toHaveAttribute("data-project-placement", "left");
      await expect(toggle).toBeVisible();
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(project.identity.id);
    }
    await panel.getByTestId("project-placement-right").click();
    await toggle.click(); await expect(panel).toBeHidden(); await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await toggle.click(); await expect(panel).toHaveAttribute("data-project-placement", "right");
    await expect(panel.getByTestId("project-library")).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).identity.id)).toBe(project.identity.id);
    await resizeSurfaceAppWindow(ctx, 390, 844);
    for (const placement of ["left", "middle", "right", "all"] as const) {
      await panel.getByTestId(`project-placement-${placement}`).click();
      const bounds = (await panel.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
      expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await expect(toggle).toBeVisible();
    }
  } finally { await closeSurfaceApp(ctx); }
});

test("Project docking also preserves the saved source editor", async () => {
  const core = require(resolve("packages/core/src/index.ts"));
  const surface = core.createSurfaceDocument({ stableKey: "placement-enneper", metadata: { title: "Enneper placement" }, source: {
    representation: "weierstrass", definition: { familyId: "enneper", expressions: { g: "z", phi: "1" } },
    domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false }, v: { min: -1, max: 1, periodic: false } },
    parameters: {}, units: { length: "unitless" }, orientation: { sign: 1 }, branchPolicy: null,
  } });
  const project = core.createMath3DProject(core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }],
    activeDocumentIds: [surface.identity.id], relations: [], results: [], artifacts: [], constructions: [], committedSelection: null }), { stableKey: "placement-source-project", title: "Enneper placement" });
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), editor = page.getByTestId("project-source-editor");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "enneper-placement.json", mimeType: "application/json", buffer: Buffer.from(core.serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-open").click();
    await panel.getByRole("button", { name: "Close project explorer", exact: true }).click();
    await expect(editor).toBeVisible();
    await editor.getByTestId("project-surface-field-g").fill("z^2");
    await page.getByRole("button", { name: "Project", exact: true }).click();
    for (const placement of ["left", "right", "all", "middle", "left"] as const) {
      await panel.getByTestId(`project-placement-${placement}`).click();
      await expect(editor.getByTestId("project-surface-field-g")).toHaveValue("z^2");
      await expect(editor).toHaveAttribute("data-document-id", surface.identity.id);
      if (placement === "all") await expect(editor.locator(".document-primary-view")).toBeHidden();
      else await expect(editor).toBeVisible();
      if (placement === "left" || placement === "right") {
        const bounds = (await panel.boundingBox())!, source = (await editor.getByTestId("project-source-view").boundingBox())!;
        if (placement === "left") expect(source.x).toBeGreaterThanOrEqual(bounds.x + bounds.width);
        else expect(source.x + source.width).toBeLessThanOrEqual(bounds.x);
      }
    }
  } finally { await closeSurfaceApp(ctx); }
});

test("Catenoid viewer stays beside a scrolling inspector with Project docked", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    const editor = page.getByTestId("project-source-editor"), viewer = editor.getByTestId("project-source-view");
    const inspector = editor.getByTestId("project-source-inspector");
    await expect(editor).toBeVisible();
    await expect(viewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await expect(inspector.getByTestId("project-saved-mesh-results")).toContainText("Discrete curvature");
    await expect(page.getByTestId("global-module-controls")).toHaveCount(0);
    const initial = (await viewer.boundingBox())!;
    expect(initial.y).toBeLessThan(200); expect(initial.height).toBeGreaterThan(750);
    // Source, viewport and Inspector now occupy three shared docks.
    expect(initial.width).toBeGreaterThan(650);
    const projectBounds = (await panel.boundingBox())!, inspectorBounds = (await inspector.boundingBox())!;
    expect(initial.x).toBeGreaterThanOrEqual(projectBounds.x + projectBounds.width);
    expect(initial.x + initial.width).toBeLessThanOrEqual(inspectorBounds.x);
    await inspector.getByTestId("project-analysis-studies").locator("summary").click();
    await expect.poll(() => inspector.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await inspector.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await viewer.boundingBox()).toEqual(initial);
    await expect(viewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    expect(await viewer.evaluate(element => { const rect = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)); })).toBe(true);
    await inspector.evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: test.info().outputPath("catenoid-viewer-inspector.png") });
    await page.getByRole("button", { name: "Project", exact: true }).click();
    await resizeSurfaceAppWindow(ctx, 390, 844);
    await expect(panel).toBeHidden();
    const narrowViewer = (await viewer.boundingBox())!, narrowInspector = (await inspector.boundingBox())!;
    expect(narrowViewer.height).toBeGreaterThan(300);
    expect(narrowViewer.y + narrowViewer.height).toBeLessThanOrEqual(narrowInspector.y);
    // Fractional Windows display scaling can sum DOMRect values to 844.00006.
    expect(narrowInspector.y + narrowInspector.height).toBeLessThanOrEqual(844 + 0.001);
    expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await expect(viewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("catenoid-viewer-narrow.png") });
    writeFileSync(test.info().outputPath("catenoid-viewer-layout.json"), JSON.stringify({ desktop: { viewer: initial, project: projectBounds, inspector: inspectorBounds }, narrow: { viewer: narrowViewer, inspector: narrowInspector } }, null, 2));
  } finally { await closeSurfaceApp(ctx); }
});

test("saved Catenoid Project reopens its owning Surface explicitly after restart", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-open-catenoid-evidence").click();
    await expect(page.getByTestId("project-source-editor")).toBeVisible();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const surface = project.workspace.entries.find((entry: { module: string }) => entry.module === "surface");
    await page.reload();
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await openLastSavedProject(page);
    await expect(panel.getByTestId("project-viewer-document")).toHaveValue(surface.expected.id);
    await expect(page.getByTestId("project-source-editor")).toBeVisible();
    await expect(page.getByTestId("project-source-view").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});
