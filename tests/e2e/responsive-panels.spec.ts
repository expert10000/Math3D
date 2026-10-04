import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Graphs keeps toolbar and compact Inspector separate at tablet width", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 900, height: 650 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const toolbar = app.page.locator(".graph2d-toolbar");
    const inspector = app.page.locator(".graph2d-compact-panels summary").filter({ hasText: "Inspector" });
    await expect(inspector).toBeVisible();
    const toolbarBox = await toolbar.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(toolbarBox!.x + toolbarBox!.width + 8).toBeLessThanOrEqual(inspectorBox!.x);
    await inspector.click();
    await expect(app.page.locator(".graph2d-compact-panels details[open]")).toContainText("Select a function to inspect it.");

    await app.page.setViewportSize({ width: 620, height: 500 });
    await expect(app.page.locator(".graph2d-compact-panels summary")).toHaveCount(2);
    const mobileToolbar = await toolbar.boundingBox();
    expect(mobileToolbar).not.toBeNull();
    expect(mobileToolbar!.x + mobileToolbar!.width).toBeLessThanOrEqual(620);
    expect(mobileToolbar!.y + mobileToolbar!.height).toBeLessThanOrEqual(500);
  } finally { await closeSurfaceApp(app); }
});

test("Geometry short landscape panel fits the window and keeps Gallery reachable", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 620, height: 500 });
    await app.page.getByTestId("workspace-nav-geometry").click();
    const panel = app.page.getByTestId("geometry-left-panel");
    await expect(panel).toBeVisible();
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(620);
    expect(box!.height).toBeGreaterThanOrEqual(150);
    await panel.getByTestId("geometry-gallery").locator(".geometry-gallery-scan-card").first().click();
    await expect(panel.getByTestId("geometry-gallery")).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});
