import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

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
    await functions.getByRole("button", { name: "Add function", exact: true }).click();
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    for (const expression of ["sin(1000*x)", "1/x", "x^3", "7*x"]) {
      await functions.getByRole("button", { name: "Edit f", exact: true }).click();
      await functions.getByLabel("Function expression").fill(expression);
      await functions.getByRole("button", { name: "Save function", exact: true }).click();
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
    await functions.getByRole("button", { name: "Add function", exact: true }).click();
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
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
    await target.getByLabel("Target y expression").fill("3*x");
    await target.getByRole("button", { name: "Apply target edit" }).click();
    await expect(target.getByTestId("promoted-document-status")).toContainText("target edited");
    await expect(target.getByRole("button", { name: "Regenerate target" })).toBeDisabled();
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await functions.getByRole("button", { name: "Edit f", exact: true }).click();
    await functions.getByLabel("Function expression").fill("2*x");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
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
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await panel.getByLabel("Promotion operation").selectOption("extrude");
    await panel.getByRole("button", { name: "Preview promotion" }).click();
    await panel.getByRole("button", { name: "Create and open" }).click();
    await expect(target.getByRole("heading")).toContainText("extrusion");
    await expect(target.getByTestId("promotion-geometry").locator("canvas")).toBeVisible();
    await expect(target.getByTestId("promotion-geometry")).toHaveAttribute("data-rendered", "true");
    await app.page.screenshot({ path: "output/graph2d-desktop-promotion.png" });
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await app.page.getByTestId("kernel-workspace-save").click();
    await expect(app.page.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await target.getByRole("button", { name: "Locate graph source" }).click();
    await functions.getByRole("button", { name: "Delete f", exact: true }).click();
    await app.page.getByTestId("kernel-workspace-reopen").click();
    await app.page.getByTestId("kernel-workspace-toggle").click();
    await expect(functions.getByRole("button", { name: "Select f", exact: true })).toBeVisible();
    await expect(panel.getByTestId("graph2d-promotion-record")).toHaveCount(4);
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
    await expect(app.page.getByLabel("Empty graph scene")).toContainText("0 functions");
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
    await expect(app.page.getByText("Functions (0)")).toBeVisible();
    await app.page.getByText("Functions (0)").click();
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
    await viewer.getByRole("button", { name: "Reset" }).click();
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
    await panel.getByRole("button", { name: "Add function" }).click();
    await panel.getByLabel("Function name").fill("Parabola");
    await panel.getByLabel("Function expression").fill("sin(");
    await expect(panel.getByRole("button", { name: "Save function" })).toBeDisabled();
    await expect(panel.getByRole("alert")).toBeVisible();
    await panel.getByLabel("Function expression").fill("x^2");
    await panel.getByRole("button", { name: "Save function" }).click();
    await expect(panel.locator('[data-graph2d-id="function_1"]')).toContainText("Parabola");
    await expect(app.page.locator('[data-graph2d-path="function_1"]')).toBeVisible();
    await panel.getByRole("button", { name: "Edit Parabola" }).click();
    await panel.getByLabel("Function name").fill("Quadratic");
    await panel.getByLabel("Line style").selectOption("dotted");
    await panel.getByLabel("Line width").fill("4");
    await panel.getByRole("button", { name: "Save function" }).click();
    await expect(app.page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("stroke-dasharray", "2 4");
    await panel.getByRole("button", { name: "Duplicate Quadratic" }).click();
    await expect(panel.locator("li")).toHaveCount(2);
    await panel.getByRole("button", { name: "Move Quadratic copy up" }).click();
    await expect(panel.locator("li").first()).toContainText("Quadratic copy");
    await panel.getByRole("button", { name: "Hide Quadratic copy" }).click();
    await expect(app.page.locator('[data-graph2d-path="function_1_copy"]')).toHaveCount(0);
    await app.page.getByTestId("main-viewer").focus();
    await app.page.keyboard.press("Control+z");
    await expect(app.page.locator('[data-graph2d-path="function_1_copy"]')).toBeVisible();
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
    await panel.getByRole("button", { name: "Add function" }).click();
    await panel.getByRole("button", { name: "Save function" }).click();
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
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByLabel("Function expression").fill("x^2");
    await functions.getByRole("button", { name: "Save function" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    const results = inspector.getByTestId("graph2d-critical-points");
    await expect(results.getByRole("button", { name: /Select zero at x/ }).first()).toBeVisible();
    await expect(results.getByRole("button", { name: /Select minimum at x/ }).first()).toBeVisible();
    await expect(results.getByRole("button", { name: /Select inflection at x/ })).toHaveCount(0);
    await results.getByRole("button", { name: /Select zero at x/ }).first().click();
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toContainText("0.00000");
    await functions.getByRole("button", { name: "Edit f" }).click();
    await functions.getByLabel("Function expression").fill("x^3");
    await functions.getByRole("button", { name: "Save function" }).click();
    await expect(results.getByRole("button", { name: /Select inflection at x/ }).first()).toBeVisible();
    await expect(results.getByRole("button", { name: /Select minimum at x/ })).toHaveCount(0);
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
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByLabel("Function expression").fill("x^2");
    await functions.getByRole("button", { name: "Save function" }).click();
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
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByLabel("Function expression").fill("x");
    await functions.getByRole("button", { name: "Save function" }).click();
    const area = app.page.getByLabel("Graph inspector").getByTestId("graph2d-area");
    await area.getByRole("button", { name: "Integrate interval" }).click();
    await expect(area.getByTestId("graph2d-area-result")).toContainText("signed area: 0.00000000");
    await area.getByLabel("Area measure").selectOption("absolute");
    await area.getByRole("button", { name: "Integrate interval" }).click();
    const result = area.getByTestId("graph2d-area-result");
    await expect(result).toContainText("absolute area: 1.00000000");
    await expect(app.page.getByTestId("graph2d-area-overlay")).toHaveAttribute("data-result-id",
      (await result.getAttribute("data-result-id"))!);
    await functions.getByRole("button", { name: "Edit f" }).click();
    await functions.getByLabel("Function expression").fill("1/x");
    await functions.getByRole("button", { name: "Save function" }).click();
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
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByLabel("Function expression").fill("x^2");
    await functions.getByRole("button", { name: "Save function" }).click();
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByLabel("Function name").fill("g");
    await functions.getByLabel("Function expression").fill("1");
    await functions.getByRole("button", { name: "Save function" }).click();
    await functions.getByRole("button", { name: "Select f" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    const section = inspector.getByTestId("graph2d-intersections");
    await expect(section.getByLabel("Intersect with function")).toHaveValue("function_2");
    await section.getByRole("button", { name: "Solve intersections" }).click();
    const result = section.getByTestId("graph2d-intersection-result");
    await expect(result.getByRole("button", { name: /Select intersection at x/ })).toHaveCount(2);
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
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByLabel("Function expression").fill("x");
    await functions.getByRole("button", { name: "Save function" }).click();
    const length = app.page.getByLabel("Graph inspector").getByTestId("graph2d-arc-length");
    await length.getByRole("button", { name: "Measure arc length" }).click();
    await expect(length.getByTestId("graph2d-arc-length-result")).toContainText("2.82842712");
    await functions.getByRole("button", { name: "Edit f" }).click();
    await functions.getByLabel("Function expression").fill("1/x");
    await functions.getByRole("button", { name: "Save function" }).click();
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
    await functions.getByRole("button", { name: "Add parametric" }).click();
    await functions.getByLabel("Parametric name").fill("loop");
    await functions.getByLabel("Parametric x expression").fill("sin(t)");
    await functions.getByLabel("Parametric y expression").fill("sin(2*t)");
    await functions.getByRole("button", { name: "Save parametric" }).click();
    await expect(app.page.locator('[data-graph2d-path="parametric_1"]')).toHaveAttribute("d", /[ML]/);
    await functions.getByRole("button", { name: "Select loop" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector.getByTestId("graph2d-probe-parameter")).toBeVisible();
    await expect(inspector).toContainText("x(t) = sin(t)");
    await functions.getByRole("button", { name: "Edit loop" }).click();
    await functions.getByLabel("Parametric y expression").fill("2*sin(2*t)");
    await functions.getByRole("button", { name: "Save parametric" }).click();
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
    await functions.getByRole("button", { name: "Add polar" }).click();
    await functions.getByLabel("Polar radius expression").fill("-2");
    await functions.getByRole("button", { name: "Save polar" }).click();
    await expect(app.page.locator('[data-graph2d-path="polar_1"]')).toHaveAttribute("d", /[ML]/);
    await app.page.getByRole("button", { name: "Toggle polar grid" }).click();
    await expect(app.page.getByTestId("graph2d-polar-grid")).toBeVisible();
    await expect(app.page.getByRole("button", { name: "Toggle polar grid" })).toHaveAttribute("aria-pressed", "true");
    await functions.getByRole("button", { name: "Select r" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector.getByTestId("graph2d-probe-parameter")).toBeVisible();
    await expect(inspector.getByTestId("graph2d-probe-radius")).toContainText("-2.0000000");
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toContainText("-2.00000");
    await functions.getByRole("button", { name: "Edit r" }).click();
    await functions.getByLabel("Polar radius expression").fill("1+cos(theta)");
    await functions.getByRole("button", { name: "Save polar" }).click();
    await expect(inspector).toContainText("r(θ) = 1+cos(theta)");
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
    await functions.getByRole("button", { name: "Add implicit" }).click();
    await functions.getByLabel("Implicit expression").fill("x^2+y^2-1");
    await functions.getByRole("button", { name: "Save implicit" }).click();
    await expect(app.page.locator('[data-graph2d-path="implicit_1"]')).toHaveAttribute("d", /[ML]/);
    await functions.getByRole("button", { name: "Select contour" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector).toContainText("F(x,y) = x^2+y^2-1 = 0");
    await expect(inspector.getByTestId("graph2d-probe-coordinates")).toBeVisible();
    await functions.getByRole("button", { name: "Edit contour" }).click();
    await functions.getByLabel("Implicit expression").fill("x^2+y^2-4");
    await functions.getByRole("button", { name: "Save implicit" }).click();
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
    await functions.getByRole("button", { name: "Add inequality" }).click();
    await functions.getByLabel("Region expression 1").fill("x");
    await functions.getByLabel("Region comparison 1").selectOption(">");
    await functions.getByRole("button", { name: "Add condition" }).click();
    await functions.getByLabel("Region expression 2").fill("y");
    await functions.getByLabel("Region comparison 2").selectOption(">=");
    await functions.getByRole("button", { name: "Save inequality" }).click();
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
    await functions.getByRole("button", { name: "Add function" }).click();
    await functions.getByRole("button", { name: "Save function" }).click();
    await functions.getByRole("button", { name: "Add data series" }).click();
    await functions.getByLabel("Data series import").fill("x,y\n0,0\n1,1\n2,NA\n3,4");
    await expect(functions.getByTestId("graph2d-import-preview")).toContainText("4 rows · 1 missing y");
    await functions.getByLabel("Data series mode").selectOption("line");
    await functions.getByRole("button", { name: "Save data series" }).click();
    await expect(app.page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("d", /[ML]/);
    await expect(app.page.locator('[data-graph2d-series-markers="series_1"] circle')).toHaveCount(3);
    await functions.getByRole("button", { name: "Select data" }).click();
    const inspector = app.page.getByLabel("Graph inspector");
    await expect(inspector.getByTestId("graph2d-table-status")).toContainText("ready");
    await expect(inspector.getByTestId("graph2d-probe-row")).toContainText("row_");
    await functions.getByRole("button", { name: "Edit data" }).click();
    await functions.getByLabel("Data series mode").selectOption("points");
    await functions.getByRole("button", { name: "Save data series" }).click();
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
    await functions.getByRole("button", { name: "Add piecewise" }).click();
    await expect(functions.getByLabel("Piece 1 expression")).toHaveValue("-x");
    await expect(functions.getByLabel("Piece 2 expression")).toHaveValue("x");
    await functions.getByRole("button", { name: "Save piecewise" }).click();
    await expect(app.page.locator('[data-graph2d-path="piecewise_1"]')).toHaveAttribute("d", /M.*M/);
    await expect(app.page.locator('[data-graph2d-endpoint="piecewise_1"][data-endpoint-open="true"]')).toHaveCount(1);
    await functions.getByRole("button", { name: "Select piecewise" }).click();
    await expect(app.page.getByLabel("Graph inspector")).toContainText("-x on [-10, 0)");
    await functions.getByRole("button", { name: "Edit piecewise" }).click();
    await functions.getByLabel("Piece 2 expression").fill("2*x");
    await functions.getByRole("button", { name: "Save piecewise" }).click();
    await expect(app.page.getByLabel("Graph inspector")).toContainText("2*x on [0, 10]");
  } finally { await closeSurfaceApp(app); }
});
