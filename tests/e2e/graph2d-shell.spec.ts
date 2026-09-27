import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

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
