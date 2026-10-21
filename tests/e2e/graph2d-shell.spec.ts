import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { editGraph, graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("Graph Inspector shows unresolved pole intervals and shades their x-range", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("1/x");
    await saveGraphEditor(app.page);
    const compactInspector = app.page.locator(".graph2d-compact-panels summary").filter({ hasText: "Inspector" });
    if (await compactInspector.isVisible()) await compactInspector.click();
    const coverage = app.page.locator(".graph2d-unresolved-coverage:visible").first();
    await expect(coverage).toContainText("Undefined source or derivative sample");
    await expect(app.page.getByTestId("graph2d-unresolved-bands").first()
      .locator('[data-unresolved-reason="undefined"]').first()).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});

test("Graph calculus panel toggles the sampled first-derivative overlay", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x^2");
    await saveGraphEditor(app.page);
    const compactInspector = app.page.locator(".graph2d-compact-panels summary").filter({ hasText: "Inspector" });
    if (await compactInspector.isVisible()) await compactInspector.click();
    const panel = app.page.locator(".graph2d-calculus-overlays:visible").first();
    await panel.getByRole("button", { name: "Show derivative plot" }).click();
    await expect(panel).toContainText("sampled first derivative");
    await expect(app.page.getByTestId("graph2d-derivative-curve-overlay").first().locator("path"))
      .toHaveAttribute("d", /[ML]/);
    await panel.getByRole("button", { name: "Hide derivative plot" }).click();
    await expect(app.page.getByTestId("graph2d-derivative-curve-overlay")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});

test("Graph formula editor exposes preview fidelity and sparse-sampling warning", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x*sin(x^2)");
    await graphEditor(app.page).getByRole("button", { name: "Expand formula" }).click();
    const dialog = app.page.getByRole("dialog", { name: "Edit Function expression" });
    const fidelity = dialog.getByRole("group", { name: "Preview fidelity" });
    await expect(fidelity.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Preview diagnostics")).toContainText("61 plotted");
    await expect(dialog.getByText("Sampling may miss rapid changes or oscillations.", { exact: false })).toBeVisible();
    await fidelity.getByRole("button", { name: "Accurate" }).click();
    await expect(fidelity.getByRole("button", { name: "Accurate" })).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByLabel("Preview diagnostics")).toContainText("481 plotted");
  } finally { await closeSurfaceApp(app); }
});

test("Fit selection frames the unit circle and Fit all includes the ellipse without toolbar scrolling", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "All scenes", exact: true }).click();
    await page.getByRole("button", { name: "Open Circle and ellipse", exact: true }).click();
    await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Select Circle", exact: true }).click();
    const viewer = page.getByTestId("main-viewer");
    const circle = viewer.locator('[data-graph2d-path="parametric_1"]');
    await expect(circle).toHaveAttribute("d", /[ML]/);
    await viewer.getByRole("button", { name: "Reset view" }).click();
    await expect.poll(async () => (await circle.boundingBox())?.width ?? 0).toBeLessThan(180);
    await viewer.getByRole("button", { name: "Fit selection" }).click();
    await expect.poll(async () => (await circle.boundingBox())?.width ?? 0).toBeGreaterThan(350);
    const selectedWidth = (await circle.boundingBox())!.width;
    await viewer.getByRole("button", { name: "Fit all" }).click();
    await expect.poll(async () => (await circle.boundingBox())?.width ?? 0).toBeLessThan(selectedWidth * .75);
    expect(await viewer.locator(".graph2d-toolbar-secondary").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await viewer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  } finally { await closeSurfaceApp(app); }
});

test("Graph worker replacement, settled rendering and unmount leave no live workers", async () => {
  const app = await launchSurfaceApp();
  try {
    await app.page.addInitScript(() => {
      const NativeWorker = window.Worker;
      const counts = { created: 0, active: 0 };
      (window as unknown as { graphWorkerCounts: typeof counts }).graphWorkerCounts = counts;
      window.Worker = class extends NativeWorker {
        tracked = false;
        stopped = false;
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.tracked = String(url).includes("graph2dSamplingWorker");
          if (this.tracked) { counts.created += 1; counts.active += 1; }
        }
        terminate() {
          if (this.tracked && !this.stopped) { counts.active -= 1; this.stopped = true; }
          super.terminate();
        }
      };
    });
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await saveGraphEditor(app.page);
    for (const expression of ["sin(1000*x)", "1/x", "x^3", "7*x"]) {
      await editGraph(app.page, "f");
      await graphEditor(app.page).getByLabel("Function expression").fill(expression);
      await saveGraphEditor(app.page);
    }
    const path = app.page.locator('[data-graph2d-path="function_1"]');
    await expect(path).toHaveAttribute("d", /[ML]/);
    await expect.poll(async () => path.evaluate((element) => {
      const curve = element as SVGPathElement, length = curve.getTotalLength();
      const a = curve.getPointAtLength(length * 0.4), b = curve.getPointAtLength(length * 0.6);
      return Math.round((b.y - a.y) / (b.x - a.x) * 1000) / 1000;
    })).toBe(-7);
    await expect.poll(async () => app.page.evaluate(() => (window as unknown as { graphWorkerCounts: { active: number } }).graphWorkerCounts.active)).toBe(0);
    const created = await app.page.evaluate(() => (window as unknown as { graphWorkerCounts: { created: number } }).graphWorkerCounts.created);
    expect(created).toBeGreaterThan(2);
    const viewer = app.page.getByTestId("main-viewer");
    await viewer.focus(); await app.page.keyboard.press("Control+z"); await app.page.keyboard.press("Control+Shift+z");
    await app.page.getByTestId("workspace-nav-curves").click();
    await expect.poll(async () => app.page.evaluate(() => (window as unknown as { graphWorkerCounts: { active: number } }).graphWorkerCounts.active)).toBe(0);
  } finally { await closeSurfaceApp(app); }
});

test("Graph promotions preview, create, locate, protect edits, fork, and reopen normal documents", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await saveGraphEditor(app.page);
    const panel = app.page.getByLabel("Graph inspector").getByTestId("graph2d-promotions");
    await panel.getByRole("button", { name: "Preview promotion" }).click();
    await expect(panel.getByTestId("promotion-geometry").locator("canvas")).toBeVisible();
    await expect(panel.getByTestId("promotion-geometry")).toHaveAttribute("data-rendered", "true");
    await panel.getByRole("button", { name: "Cancel preview" }).click();
    await expect(panel.getByTestId("graph2d-promotion-record")).toHaveCount(0);
    await panel.getByRole("button", { name: "Preview promotion" }).click();
    await panel.getByRole("button", { name: "Create and open" }).click();
    const target = app.page.getByTestId("promoted-document-workspace");
    await expect(target.getByRole("heading")).toContainText("Curve");
    const curveViewer = target.getByTestId("graph2d-curve-main-viewer");
    await expect(curveViewer.getByTestId("curve-viewer-canvas").locator("canvas")).toBeVisible();
    await curveViewer.getByRole("button", { name: "Fit", exact: true }).click();
    await curveViewer.getByRole("button", { name: "Grid", exact: true }).click();
    await expect(curveViewer.getByRole("button", { name: "Grid", exact: true })).toHaveAttribute("aria-pressed", "false");
    await target.getByLabel("Target y expression").fill("3*x");
    await target.getByRole("button", { name: "Apply target edit" }).click();
    await expect(target.getByTestId("promoted-document-status")).toContainText("target edited");
    await expect(target.getByRole("button", { name: "Regenerate target" })).toBeDisabled();
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await editGraph(app.page, "f");
    await graphEditor(app.page).getByLabel("Function expression").fill("2*x");
    await saveGraphEditor(app.page);
    await expect(panel.getByTestId("promotion-source-status")).toHaveText("stale");
    await panel.getByRole("button", { name: "Locate target" }).click();
    await expect(target.getByLabel("Target y expression")).toHaveValue("3*x");
    await target.getByRole("button", { name: "Fork target" }).click();
    await expect(target.getByTestId("promoted-document-status")).toContainText("target unchanged");
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await expect(panel.getByTestId("graph2d-promotion-record")).toHaveCount(2);
    await panel.getByLabel("Promotion operation").selectOption("revolve");
    await panel.getByRole("button", { name: "Preview promotion" }).click();
    await panel.getByRole("button", { name: "Create and open" }).click();
    await expect(target.getByRole("heading")).toContainText("Surface");
    const surfaceViewer = target.getByTestId("graph2d-surface-main-viewer");
    await expect(surfaceViewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await surfaceViewer.getByRole("button", { name: "Fit surface" }).click();
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await panel.getByLabel("Promotion operation").selectOption("extrude");
    await panel.getByRole("button", { name: "Preview promotion" }).click();
    await panel.getByRole("button", { name: "Create and open" }).click();
    await expect(target.getByRole("heading")).toContainText("extrusion");
    await expect(target.getByTestId("graph2d-surface-main-viewer").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await panel.getByLabel("Promotion operation").selectOption("geometry");
    await panel.getByRole("button", { name: "Preview promotion" }).click();
    await expect(panel.getByTestId("promotion-geometry")).toHaveAttribute("data-rendered", "true");
    await panel.getByRole("button", { name: "Create and open" }).click();
    await expect(target.getByRole("heading")).toContainText("Geometry");
    await expect(target).toContainText("1024 segments");
    const geometryViewer = target.getByTestId("graph2d-geometry-main-viewer");
    await expect(geometryViewer.getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await expect(geometryViewer.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "false");
    await geometryViewer.getByRole("button", { name: "Fit geometry" }).click();
    await geometryViewer.getByRole("button", { name: "Grid" }).click();
    await expect(geometryViewer.getByRole("button", { name: "Grid" })).toHaveAttribute("aria-pressed", "true");
    await geometryViewer.getByRole("button", { name: "Front view" }).click();
    await geometryViewer.getByRole("button", { name: "Grid" }).click();
    await app.page.screenshot({ path: "output/graph2d-desktop-promotion.png" });
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await app.page.getByTestId("kernel-workspace-save").click();
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await functions.getByLabel("More actions for f").click();
    await functions.getByRole("button", { name: "Delete f", exact: true }).click();
    await app.page.getByTestId("kernel-workspace-reopen").click();
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await expect(functions.getByRole("button", { name: "Select f", exact: true })).toBeVisible();
    await expect(panel.getByTestId("graph2d-promotion-record")).toHaveCount(5);
    await panel.getByRole("button", { name: "Locate target" }).first().click();
    await expect(target.getByLabel("Target y expression")).toHaveValue("3*x");
  } finally { await closeSurfaceApp(app); }
});

test("Graphs opens an empty desktop workspace and participates in normal navigation", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    await expect(app.page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(app.page.getByTestId("graphs-workspace")).toBeVisible();
    await expect(app.page.getByTestId("graph2d-plot")).toBeVisible();
    await expect(app.page.getByLabel("Empty graph scene")).toContainText("0 graph objects");
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await app.page.getByTestId("kernel-workspace-save").click();
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await app.page.getByTestId("kernel-workspace-reopen").click();
    await expect(app.page.getByTestId("kernel-workspace-entry-graph2d")).toBeVisible();
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await app.page.getByTestId("workspace-nav-curves").click();
    await expect(app.page.getByTestId("graphs-workspace")).toHaveCount(0);
    await app.page.getByRole("button", { name: "Workspace back" }).click();
    await expect(app.page.getByTestId("graphs-workspace")).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs left panel palette matches Geometry controls and persists without changing plot colors", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    const classic = functions.getByTestId("graph2d-left-palette-classic");
    const geometry = functions.getByTestId("graph2d-left-palette-geometry");
    await expect(classic).toHaveAttribute("aria-pressed", "true");
    await openGraphType(app.page, "Function");
    await saveGraphEditor(app.page);
    const curve = app.page.locator('[data-graph2d-path="function_1"]');
    await expect(curve).toHaveAttribute("stroke", /#[0-9a-f]{6}/i);
    const stroke = await curve.getAttribute("stroke");
    const header = functions.locator(".graph2d-authoring-header");
    const classicBackground = await header.evaluate((element) => getComputedStyle(element).backgroundColor);
    await geometry.click();
    await expect(functions).toHaveAttribute("data-palette", "geometry");
    await expect(geometry).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => header.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(classicBackground);
    await expect(curve).toHaveAttribute("stroke", stroke!);
    await app.page.reload();
    await app.page.getByTestId("workspace-nav-graphs").click();
    await expect(app.page.getByLabel("Graph functions")).toHaveAttribute("data-palette", "geometry");
    await app.page.getByTestId("graph2d-left-palette-classic").first().click();
    await expect(app.page.getByLabel("Graph functions")).toHaveAttribute("data-palette", "classic");
  } finally { await closeSurfaceApp(app); }
});

test("Graphs uses desktop side panels and compact controls on narrow windows", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    await expect(app.page.getByLabel("Graph functions")).toBeVisible();
    await expect(app.page.getByLabel("Graph inspector")).toBeVisible();
    await app.page.setViewportSize({ width: 620, height: 800 });
    await expect(app.page.getByLabel("Graph functions")).toBeHidden();
    await expect(app.page.getByLabel("Graph inspector")).toBeHidden();
    await expect(app.page.getByText("Graph objects (0)")).toBeVisible();
    await app.page.getByText("Graph objects (0)").click();
    await expect(app.page.getByLabel("Empty graph scene")).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs pans with one gesture, supports keyboard undo, and resets the viewport", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const viewer = app.page.getByTestId("main-viewer");
    const verticalAxis = viewer.locator(".graph2d-axis").nth(1);
    const before = Number(await verticalAxis.getAttribute("x1"));
    const box = await viewer.boundingBox();
    if (!box) throw new Error("Graph viewer has no bounds");
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await app.page.mouse.move(startX, startY);
    await app.page.mouse.down();
    await app.page.mouse.move(startX + 90, startY, { steps: 5 });
    await app.page.mouse.up();
    await expect.poll(async () => Number(await verticalAxis.getAttribute("x1"))).toBeGreaterThan(before + 50);
    await viewer.focus();
    await app.page.keyboard.press("Control+z");
    await expect.poll(async () => Number(await verticalAxis.getAttribute("x1"))).toBeCloseTo(before, 1);
    await app.page.mouse.wheel(0, -240);
    await app.page.waitForTimeout(250);
    await viewer.getByRole("button", { name: "Reset view" }).click();
    await expect.poll(async () => Number(await verticalAxis.getAttribute("x1"))).toBeCloseTo(before, 1);
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs authors, validates, styles, reorders, hides, and undoes functions", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const panel = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function name").fill("Parabola");
    await graphEditor(app.page).getByLabel("Function expression").fill("sin(");
    await expect(graphEditor(app.page).getByRole("button", { name: "Preview" })).toBeDisabled();
    await expect(graphEditor(app.page).getByRole("alert")).toBeVisible();
    await graphEditor(app.page).getByLabel("Function expression").fill("x^2");
    await saveGraphEditor(app.page);
    await expect(panel.locator('[data-graph2d-id="function_1"]')).toContainText("Parabola");
    await expect(app.page.locator('[data-graph2d-path="function_1"]')).toBeVisible();
    await editGraph(app.page, "Parabola");
    await graphEditor(app.page).getByLabel("Function name").fill("Quadratic");
    await graphEditor(app.page).getByLabel("Line style").selectOption("dotted");
    await graphEditor(app.page).getByLabel("Line width").fill("4");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("stroke-dasharray", "2 4");
    await panel.getByLabel("More actions for Quadratic").click();
    await panel.getByRole("button", { name: "Duplicate Quadratic" }).click();
    await expect(panel.getByLabel("More actions for Quadratic", { exact: true })).toBeFocused();
    await expect(panel.locator("li")).toHaveCount(2);
    await panel.getByLabel("More actions for Quadratic copy").click();
    await panel.getByRole("button", { name: "Move Quadratic copy up" }).click();
    await expect(panel.locator("li").first()).toContainText("Quadratic copy");
    await panel.getByRole("button", { name: "Hide Quadratic copy" }).click();
    await expect(app.page.locator('[data-graph2d-path="function_1_copy"]')).toHaveCount(0);
    await app.page.getByTestId("main-viewer").focus();
    await app.page.keyboard.press("Control+z");
    await expect(app.page.locator('[data-graph2d-path="function_1_copy"]')).toBeVisible();
    await panel.getByLabel("More actions for Quadratic copy").click();
    await panel.getByRole("button", { name: "Delete Quadratic copy" }).click();
    await expect(panel.locator("li")).toHaveCount(1);
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await app.page.getByTestId("kernel-workspace-save").click();
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Saved");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs selects a curve by click, locates its probe, and clears selection", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const panel = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await saveGraphEditor(app.page);
    const viewer = app.page.getByTestId("main-viewer");
    const point = await app.page.locator('[data-graph2d-path="function_1"]').evaluate((path) => {
      const curve = path as SVGPathElement;
      const sampled = curve.getPointAtLength(curve.getTotalLength() * 0.65);
      return { x: sampled.x, y: sampled.y };
    });
    const box = await viewer.boundingBox();
    if (!box) throw new Error("Graph viewer has no bounds");
    await app.page.mouse.click(box.x + point.x, box.y + point.y);
    await expect(app.page.getByTestId("graph2d-probe-coordinates").last()).toBeVisible();
    await expect(viewer.locator(".graph2d-probe-selected")).toBeVisible();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector.getByTestId("graph2d-sampling-status")).toContainText("converged");
    await expect(inspector.getByText("Direct expression evaluation (floating point)")).toBeVisible();
    await expect(inspector.getByTestId("graph2d-first-derivative")).toContainText("1.0000000");
    await expect(inspector.getByTestId("graph2d-second-derivative")).toContainText("0.0000000");
    await expect(inspector.getByTestId("graph2d-differentiability")).toContainText("differentiable");
    await expect(inspector.getByTestId("graph2d-tangent-equation")).toContainText("1(x -");
    await expect(inspector.getByTestId("graph2d-normal-equation")).toContainText("-1(x -");
    await expect(viewer.locator('[data-graph2d-overlay="tangent"]')).toBeVisible();
    await expect(viewer.locator('[data-graph2d-overlay="normal"]')).toBeVisible();
    await inspector.getByText("Provenance").click();
    await expect(inspector.getByText("Source hash")).toBeVisible();
    await app.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await app.page.mouse.down();
    await app.page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 5 });
    await app.page.mouse.up();
    await inspector.getByRole("button", { name: "Locate" }).click();
    const marker = viewer.locator(".graph2d-probe-selected circle").first();
    const plotCenter = await viewer.evaluate((element) => element.clientWidth / 2);
    await expect.poll(async () => Number(await marker.getAttribute("cx"))).toBeCloseTo(plotCenter, 0);
    await viewer.focus();
    await app.page.keyboard.press("Escape");
    await expect(viewer.locator(".graph2d-probe-selected")).toHaveCount(0);
    await expect(viewer.locator(".graph2d-differential-overlay")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs selects source-linked zeros and refreshes extrema after editing", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x^2");
    await saveGraphEditor(app.page);
    const inspector = app.page.getByLabel("Graph inspector");
    const results = inspector.getByTestId("graph2d-critical-points");
    await results.getByLabel("Analysis evaluation budget").selectOption("2000");
    await expect(results.getByLabel("Analysis evaluation budget")).toHaveValue("2000");
    await expect(results.getByTestId("graph2d-critical-scan-status")).toContainText("evaluations");
    await expect(results.getByRole("button", { name: /Select zero at x/ }).first()).toBeVisible();
    await expect(results.getByRole("button", { name: /Select minimum at x/ }).first()).toBeVisible();
    await expect(results.getByRole("button", { name: /Select inflection at x/ })).toHaveCount(0);
    await expect(results.locator(".graph2d-analysis-quality").first()).toHaveText("Approximate");
    await results.getByText("Analysis quality levels").click();
    await expect(results.getByText("Certified", { exact: true })).toBeVisible();
    await results.getByRole("button", { name: /Select zero at x/ }).first().click();
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toContainText("0.00000");
    await editGraph(app.page, "f");
    await graphEditor(app.page).getByLabel("Function expression").fill("x^3");
    await saveGraphEditor(app.page);
    await expect(results.getByRole("button", { name: /Select inflection at x/ }).first()).toBeVisible();
    await expect(results.getByRole("button", { name: /Select minimum at x/ })).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs labels a refinement-limited oscillatory analysis as partial", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("sin(100*x)");
    await saveGraphEditor(app.page);
    const status = app.page.getByTestId("graph2d-critical-scan-status").first();
    await expect(status).toContainText("Incomplete scan");
    await expect(status).toContainText("results not exhaustive");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs Inspector filters, sorts, and batch saves validated numerical results", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x^2-1");
    await saveGraphEditor(app.page);
    const results = app.page.getByLabel("Graph inspector").getByTestId("graph2d-critical-points");
    await expect(results.locator(".graph2d-critical-summary dd").first()).toHaveText("2");
    await results.getByRole("button", { name: "Zeros", exact: true }).click();
    await expect(results.getByRole("button", { name: /Select zero at x/ })).toHaveCount(2);
    await expect(results.getByRole("button", { name: /Select minimum at x/ })).toHaveCount(0);
    await results.getByLabel("Search numerical results").fill("minimum");
    await expect(results.getByRole("button", { name: /Select zero at x/ })).toHaveCount(0);
    await results.getByLabel("Search numerical results").fill("");
    await results.getByRole("button", { name: "Sort results by x" }).click();
    const xCells = results.locator("tbody tr td:nth-child(3)");
    expect(Number(await xCells.first().textContent())).toBeGreaterThan(Number(await xCells.last().textContent()));
    await results.getByRole("button", { name: "Save all validated zeros (2)" }).click();
    await expect(app.page.locator('[data-graph2d-construction]')).toHaveCount(2);
    await expect(results.getByRole("button", { name: "Save all validated zeros (0)" })).toBeDisabled();
    const csvPath = test.info().outputPath("numerical-analysis.csv");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), csvPath);
    await results.getByRole("button", { name: "Export results" }).click();
    await expect.poll(() => { try { return readFileSync(csvPath, "utf8"); } catch { return ""; } }).toContain("kind,x,y,residual");
    const jsonPath = test.info().outputPath("numerical-analysis.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), jsonPath);
    await results.getByRole("button", { name: "Export numerical JSON" }).click();
    await expect.poll(() => { try { return JSON.parse(readFileSync(jsonPath, "utf8")).format; } catch { return ""; } })
      .toBe("math3d.graph2d-numerical.v1");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs interval table and plot markers share the same analysis result", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x^2");
    await saveGraphEditor(app.page);
    const inspector = app.page.getByLabel("Graph inspector");
    const table = inspector.getByTestId("graph2d-intervals");
    await expect(table).toContainText("decreasing");
    await expect(table).toContainText("increasing");
    await expect(table).toContainText("up");
    const resultId = await table.getAttribute("data-result-id");
    expect(resultId).toMatch(/^graph2d\.intervals\./);
    await expect(app.page.getByTestId("graph2d-interval-overlays")).toHaveAttribute("data-result-id", resultId!);
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs integrates a selected interval and omits fill across a singularity", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x");
    await saveGraphEditor(app.page);
    const area = app.page.getByLabel("Graph inspector").getByTestId("graph2d-area");
    await area.getByRole("button", { name: "Integrate interval" }).click();
    await expect(area.getByTestId("graph2d-area-result")).toContainText("signed area: 0.00000000");
    await area.getByLabel("Area measure").selectOption("absolute");
    await area.getByRole("button", { name: "Integrate interval" }).click();
    const result = area.getByTestId("graph2d-area-result");
    await expect(result).toContainText("absolute area: 1.00000000");
    await expect(app.page.getByTestId("graph2d-area-overlay")).toHaveAttribute("data-result-id",
      (await result.getAttribute("data-result-id"))!);
    await editGraph(app.page, "f");
    await graphEditor(app.page).getByLabel("Function expression").fill("1/x");
    await saveGraphEditor(app.page);
    await expect(result).toContainText("Unavailable over full interval");
    await expect(result).toContainText("skipped");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs solves only the chosen function pair and selects an intersection", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x^2");
    await saveGraphEditor(app.page);
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function name").fill("g");
    await graphEditor(app.page).getByLabel("Function expression").fill("1");
    await saveGraphEditor(app.page);
    await functions.getByRole("button", { name: "Select f" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    const section = inspector.getByTestId("graph2d-intersections");
    await expect(section.getByLabel("Intersect with function")).toHaveValue("function_2");
    await section.getByRole("button", { name: "Solve intersections" }).click();
    const result = section.getByTestId("graph2d-intersection-result");
    await expect(result.getByRole("button", { name: /Select intersection at x/ })).toHaveCount(2);
    await expect(result).toContainText("Approximate enumeration");
    await expect(result.locator(".graph2d-analysis-quality").first()).toHaveText("Refined");
    await expect(app.page.getByTestId("graph2d-intersection-overlays")).toHaveAttribute("data-result-id",
      (await result.getAttribute("data-result-id"))!);
    await result.getByRole("button", { name: /Select intersection at x/ }).first().click();
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toContainText("1.00000");
    await section.getByLabel("Intersection interval").selectOption("custom");
    await section.getByLabel("Intersection from x").fill("-0.5");
    await section.getByLabel("Intersection to x").fill("0.5");
    await section.getByRole("button", { name: "Solve intersections" }).click();
    await expect(section.getByTestId("graph2d-intersection-result")).toContainText("No isolated candidates found");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs measures arc length and withholds a singular full-interval value", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await graphEditor(app.page).getByLabel("Function expression").fill("x");
    await saveGraphEditor(app.page);
    const length = app.page.getByLabel("Graph inspector").getByTestId("graph2d-arc-length");
    await length.getByRole("button", { name: "Measure arc length" }).click();
    await expect(length.getByTestId("graph2d-arc-length-result")).toContainText("2.82842712");
    await editGraph(app.page, "f");
    await graphEditor(app.page).getByLabel("Function expression").fill("1/x");
    await saveGraphEditor(app.page);
    await expect(length.getByTestId("graph2d-arc-length-result")).toContainText("Unavailable over full interval");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs authors a parametric curve and keeps its parameter in the probe", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Parametric");
    await graphEditor(app.page).getByLabel("Parametric name").fill("loop");
    await graphEditor(app.page).getByLabel("Parametric x expression").fill("sin(t)");
    await graphEditor(app.page).getByLabel("Parametric y expression").fill("sin(2*t)");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-path="parametric_1"]')).toHaveAttribute("d", /[ML]/);
    await functions.getByRole("button", { name: "Select loop" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector.getByTestId("graph2d-probe-parameter")).toBeVisible();
    await expect(inspector).toContainText("x(t) = sin(t)");
    await editGraph(app.page, "loop");
    await graphEditor(app.page).getByLabel("Parametric y expression").fill("2*sin(2*t)");
    await saveGraphEditor(app.page);
    await expect(inspector).toContainText("y(t) = 2*sin(2*t)");
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs renders a signed-radius polar curve and switches grid modes", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Polar");
    await graphEditor(app.page).getByLabel("Polar radius expression").fill("-2");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-path="polar_1"]')).toHaveAttribute("d", /[ML]/);
    await expect(app.page.getByTestId("app-status-bar")).toContainText("Polar curve · Cartesian grid");
    await expect(app.page.getByLabel("Empty graph scene")).toHaveCount(0);
    await app.page.locator("details.graph2d-toolbar-menu summary").click();
    await app.page.getByRole("button", { name: "Toggle polar grid" }).click();
    await expect(app.page.getByTestId("graph2d-polar-grid")).toBeVisible();
    await expect(app.page.getByRole("button", { name: "Toggle polar grid" })).toHaveAttribute("aria-pressed", "true");
    await expect(app.page.getByTestId("app-status-bar")).toContainText("Polar curve · polar grid");
    await functions.getByRole("button", { name: "Select r" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    const measurements = inspector.getByLabel("Polar measurements");
    await expect(measurements.getByRole("button", { name: "Measure swept area" })).toBeVisible();
    await measurements.getByLabel("Polar angle from").fill("0");
    await measurements.getByLabel("Polar angle to").fill(String(Math.PI));
    await measurements.getByRole("button", { name: "Measure swept area" }).click();
    await expect(measurements.getByTestId("graph2d-polar-area-result")).toContainText("6.28318531");
    await measurements.getByRole("button", { name: "Measure polar arc length" }).click();
    await expect(measurements.getByTestId("graph2d-polar-arc-result")).toContainText("6.28318531");
    await expect(inspector.getByTestId("graph2d-area")).toHaveCount(0);
    await expect(inspector.getByTestId("graph2d-arc-length")).toHaveCount(0);
    await expect(inspector.getByTestId("graph2d-intersections")).toHaveCount(0);
    await expect(inspector.getByTestId("graph2d-probe-parameter")).toBeVisible();
    await expect(inspector.getByTestId("graph2d-probe-radius")).toContainText("-2.0000000");
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toContainText("-2.00000");
    await editGraph(app.page, "r");
    await graphEditor(app.page).getByLabel("Polar radius expression").fill("1+cos(theta)");
    await saveGraphEditor(app.page);
    await expect(inspector).toContainText("r(θ) = 1+cos(theta)");
    if (await app.page.locator("details.graph2d-toolbar-menu").getAttribute("open") === null)
      await app.page.locator("details.graph2d-toolbar-menu summary").click();
    await app.page.getByRole("button", { name: "Toggle polar grid" }).click();
    await expect(app.page.getByTestId("graph2d-polar-grid")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(app);
  }
});

test("Graphs authors and probes an implicit contour", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Implicit contour");
    await graphEditor(app.page).getByLabel("Implicit expression").fill("x^2+y^2-1");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-path="implicit_1"]')).toHaveAttribute("d", /[ML]/);
    await functions.getByRole("button", { name: "Select contour" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector).toContainText("F(x,y) = x^2+y^2-1 = 0");
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toBeVisible();
    await editGraph(app.page, "contour");
    await graphEditor(app.page).getByLabel("Implicit expression").fill("x^2+y^2-4");
    await saveGraphEditor(app.page);
    await expect(inspector).toContainText("F(x,y) = x^2+y^2-4 = 0");
  } finally { await closeSurfaceApp(app); }
});

test("Graphs fills an inequality and distinguishes strict from inclusive boundaries", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Inequality");
    await graphEditor(app.page).getByLabel("Region expression 1").fill("x");
    await graphEditor(app.page).getByLabel("Region comparison 1").selectOption(">");
    await graphEditor(app.page).getByRole("button", { name: "Add condition" }).click();
    await graphEditor(app.page).getByLabel("Region expression 2").fill("y");
    await graphEditor(app.page).getByLabel("Region comparison 2").selectOption(">=");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-region="inequality_1"]')).toHaveAttribute("d", /M/);
    await expect(app.page.locator('[data-graph2d-path="inequality_1"][data-boundary-strict="true"]'))
      .toHaveAttribute("stroke-dasharray", "6 5");
    await expect(app.page.locator('[data-graph2d-path="inequality_1"][data-boundary-strict="false"]'))
      .toHaveAttribute("d", /[ML]/);
    await functions.getByRole("button", { name: "Select region" }).click();
    await expect(app.page.getByLabel("Graph inspector")).toContainText("x > 0 AND y >= 0");
  } finally { await closeSurfaceApp(app); }
});

test("Graphs previews a point table and plots it alongside a function", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Function");
    await saveGraphEditor(app.page);
    await openGraphType(app.page, "Data series");
    await graphEditor(app.page).getByLabel("Data series import").fill("x,y\n0,0\n1,1\n2,NA\n3,4");
    await expect(graphEditor(app.page).getByTestId("graph2d-import-preview")).toContainText("4 rows · 1 missing y");
    await graphEditor(app.page).getByLabel("Data series mode").selectOption("line");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("d", /[ML]/);
    await expect(app.page.locator('[data-graph2d-series-markers="series_1"] circle')).toHaveCount(3);
    await functions.getByRole("button", { name: "Select data" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector.getByTestId("graph2d-table-status")).toContainText("ready");
    await expect(inspector.getByTestId("graph2d-probe-row")).toContainText("row_");
    await editGraph(app.page, "data");
    await graphEditor(app.page).getByLabel("Data series mode").selectOption("points");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-series-markers="series_1"] circle')).toHaveCount(3);
  } finally { await closeSurfaceApp(app); }
});

test("Graphs authors, edits, and probes piecewise domains without joining boundaries", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 1440, height: 850 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await openGraphType(app.page, "Piecewise");
    await expect(graphEditor(app.page).getByLabel("Piece 1 expression")).toHaveValue("-x");
    await expect(graphEditor(app.page).getByLabel("Piece 2 expression")).toHaveValue("x");
    await saveGraphEditor(app.page);
    await expect(app.page.locator('[data-graph2d-path="piecewise_1"]')).toHaveAttribute("d", /M.*M/);
    await expect(app.page.locator('[data-graph2d-endpoint="piecewise_1"][data-endpoint-open="true"]')).toHaveCount(1);
    await functions.getByRole("button", { name: "Select piecewise" }).click();
    await expect(app.page.getByLabel("Graph inspector")).toContainText("-x on [-10, 0)");
    await editGraph(app.page, "piecewise");
    await graphEditor(app.page).getByLabel("Piece 2 expression").fill("2*x");
    await saveGraphEditor(app.page);
    await expect(app.page.getByLabel("Graph inspector")).toContainText("2*x on [0, 10]");
  } finally { await closeSurfaceApp(app); }
});
