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
