import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("G2D48 promotes a probe, recomputes a dependent tangent, and undoes source edits", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Select Parabola", exact: true }).click();
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    await expect(inspector.getByLabel("Selected graph result")).toContainText("Probe (0.50000, 0.25000)");
    await expect(inspector.getByTestId("graph2d-signed-curvature")).toContainText("0.70710678");
    const panel = inspector.getByTestId("graph2d-constructions");
    const save = panel.getByRole("button", { name: "Save probe as point" });
    await expect(save).toBeEnabled();
    await save.click();
    const point = page.locator('[data-graph2d-construction="construction_1"]');
    await expect(point).toBeVisible();
    const authoredPath = page.locator('[data-graph2d-path="function_1"]');
    const authoredBefore = await authoredPath.getAttribute("d");
    await panel.getByRole("button", { name: "Add tangent" }).click();
    const tangent = page.locator('[data-graph2d-construction="construction_2"]');
    await expect(tangent).toBeVisible();
    const before = await point.getAttribute("cy");
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("2*x^2");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await expect.poll(() => point.getAttribute("cy")).not.toBe(before);
    await expect(tangent).toBeVisible();
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect.poll(() => point.getAttribute("cy")).toBe(before);
    await panel.getByLabel("x for Point 1").fill("1");
    await panel.getByRole("button", { name: "Move Point 1" }).click();
    await expect.poll(() => point.getAttribute("cy")).not.toBe(before);
    await expect.poll(() => authoredPath.getAttribute("d")).toBe(authoredBefore);
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect.poll(() => point.getAttribute("cy")).toBe(before);
    await panel.locator('[data-construction-id="construction_2"] summary').click();
    await panel.getByRole("button", { name: "Delete Tangent" }).click();
    await panel.locator('[data-construction-id="construction_1"] summary').click();
    await panel.getByRole("button", { name: "Delete Point 1" }).click();
    await expect(page.locator("[data-graph2d-construction]")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});

test("G2D55 saves a tangent result and its point with one undo", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Select Parabola", exact: true }).click();
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    const local = inspector.getByTestId("graph2d-local-differential");
    await local.getByRole("button", { name: "Save tangent as construction" }).click();
    await expect(page.locator("[data-graph2d-construction]")).toHaveCount(2);
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(page.locator("[data-graph2d-construction]")).toHaveCount(0);
    await page.keyboard.press("Control+Shift+z");
    await expect(page.locator("[data-graph2d-construction]")).toHaveCount(2);
  } finally { await closeSurfaceApp(app); }
});

test("G2D56 saves curvature at a point and recomputes after source edits", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Select Parabola", exact: true }).click();
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    const panel = inspector.getByTestId("graph2d-constructions");
    await panel.getByRole("button", { name: "Save probe as point" }).click();
    await panel.getByRole("button", { name: "Add curvature" }).click();
    const saved = panel.getByTestId("graph2d-saved-curvature");
    await expect(saved).toContainText("0.70710678");
    await expect(saved).toContainText("increasing-x");
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("-x^2");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await expect(saved).toContainText("-0.70710678");
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(saved).toContainText("0.70710678");
  } finally { await closeSurfaceApp(app); }
});

test("G2D57 saves an osculating circle and updates its geometry after source edits", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Select Parabola", exact: true }).click();
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    const panel = inspector.getByTestId("graph2d-constructions");
    await panel.getByRole("button", { name: "Save probe as point" }).click();
    await panel.getByRole("button", { name: "Add osculating circle" }).click();
    const saved = panel.getByTestId("graph2d-saved-osculating-circle");
    await expect(saved).toContainText("radius");
    await expect(page.locator('[data-graph2d-construction="construction_2"]')).toHaveCount(1);
    await expect(page.locator('[data-graph2d-construction="construction_2"]')).toHaveAttribute("stroke-dasharray", "8 5");
    await expect(page.locator('[data-graph2d-construction-center="construction_2"]')).toHaveCount(1);
    await expect(page.locator('[data-graph2d-construction-radius="construction_2"]')).toHaveCount(1);
    const before = await saved.textContent();
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("-x^2");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await expect(saved).not.toHaveText(before ?? "");
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(saved).toHaveText(before ?? "");
    const authored = page.locator('[data-graph2d-path="function_1"]');
    const authoredPath = await authored.getAttribute("d");
    await panel.locator(".graph2d-construction-global-more summary").click();
    await panel.getByRole("button", { name: "Clear all constructions" }).click();
    await expect(panel).toContainText("Constructions (0/32)");
    await expect(page.locator("[data-graph2d-construction]")).toHaveCount(0);
    await expect.poll(() => authored.getAttribute("d")).toBe(authoredPath);
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(panel).toContainText("Constructions (2/32)");
    await expect(page.locator('[data-graph2d-construction="construction_2"]')).toHaveCount(1);
  } finally { await closeSurfaceApp(app); }
});

test("G2D49 saves a root candidate and keeps its local identity across source edits", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("graph-gallery-open").click();
    await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await functions.getByRole("button", { name: "Select Parabola", exact: true }).click();
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("x^2-1");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    const inspector = page.getByLabel("Graph inspector", { exact: true });
    await inspector.getByRole("button", { name: /Save zero at x -1.* as construction/ }).click();
    const marker = page.locator('[data-graph2d-construction="construction_1"]');
    await expect(marker).toBeVisible();
    const before = await marker.getAttribute("cx");
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("x^2-1.21");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await expect.poll(() => marker.getAttribute("cx")).not.toBe(before);
    await functions.getByRole("button", { name: "Edit Parabola", exact: true }).click();
    await functions.getByLabel("Function expression").fill("x^2+1");
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await expect(marker).toHaveCount(0);
    await expect(inspector.getByTestId("graph2d-constructions")).toContainText("unavailable");
    await page.getByTestId("main-viewer").focus();
    await page.keyboard.press("Control+z");
    await expect(marker).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});
