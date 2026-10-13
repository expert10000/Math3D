import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Graphs keeps essential view controls and compact card actions keyboard reachable", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await functions.getByRole("button", { name: "Add function", exact: true }).click();
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    const more = functions.getByLabel("More actions for f");
    await more.focus();
    await app.page.keyboard.press("Enter");
    await expect(functions.getByRole("button", { name: "Duplicate f" })).toBeVisible();
    await app.page.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await expect(functions.getByRole("button", { name: "Duplicate f" })).not.toBeVisible();
    await app.page.setViewportSize({ width: 620, height: 500 });
    const essentials = app.page.getByRole("group", { name: "Graph view essentials" });
    await expect(essentials.getByRole("button", { name: "Fit" })).toBeVisible();
    await expect(essentials.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await expect(essentials.getByRole("button", { name: "Zoom out" })).toBeVisible();
    await expect(essentials.getByRole("button", { name: "Grid" })).toBeVisible();
    await essentials.getByRole("button", { name: "Zoom in" }).click();
    await app.page.getByRole("group", { name: "Construction tools" }).getByRole("button", { name: "Tools" }).click();
    await expect(app.page.getByTestId("graph2d-tools")).toBeVisible();
    await app.page.keyboard.press("Escape");
    await expect(app.page.getByRole("group", { name: "Construction tools" }).getByRole("button", { name: "Tools" })).toBeFocused();
    await app.page.getByRole("group", { name: "Analysis", exact: true }).getByRole("button", { name: "Inspector" }).click();
    await expect(app.page.locator(".graph2d-compact-panels > details[open]")).toContainText("Source and sampling");
  } finally { await closeSurfaceApp(app); }
});

test("Graphs keeps toolbar and compact Inspector separate at tablet width", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.setViewportSize({ width: 900, height: 650 });
    await app.page.getByTestId("workspace-nav-graphs").click();
    const functions = app.page.getByLabel("Graph functions");
    await functions.getByRole("button", { name: "Add function", exact: true }).click();
    await functions.getByRole("button", { name: "Save function", exact: true }).click();
    const toolbar = app.page.locator(".graph2d-toolbar");
    const inspector = app.page.locator(".graph2d-compact-panels > details > summary").filter({ hasText: "Inspector" });
    await expect(inspector).toBeVisible();
    const toolbarBox = await toolbar.boundingBox();
    const inspectorBox = await inspector.boundingBox();
    expect(toolbarBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(toolbarBox!.x + toolbarBox!.width + 8).toBeLessThanOrEqual(inspectorBox!.x);
    await inspector.focus();
    await app.page.keyboard.press("Enter");
    const opened = app.page.locator(".graph2d-compact-panels > details[open]");
    await expect(opened).toContainText("Source and sampling");
    const openedBox = await opened.boundingBox();
    expect(openedBox).not.toBeNull();
    expect(openedBox!.y).toBeGreaterThanOrEqual(toolbarBox!.y + toolbarBox!.height + 7);
    await app.page.keyboard.press("Tab");
    expect(await app.page.evaluate(() => document.activeElement?.closest(".graph2d-compact-panels details[open]") !== null)).toBe(true);
    const areaInput = opened.getByLabel("Area from x");
    for (let index = 0; index < 30 && !(await areaInput.evaluate((element) => element === document.activeElement)); index++)
      await app.page.keyboard.press("Tab");
    await expect(areaInput).toBeFocused();
    const areaBox = await areaInput.boundingBox();
    const scrollerBox = await opened.boundingBox();
    expect(areaBox!.y).toBeGreaterThanOrEqual(scrollerBox!.y);
    expect(areaBox!.y + areaBox!.height).toBeLessThanOrEqual(scrollerBox!.y + scrollerBox!.height);
    await opened.locator("details.graph2d-inspector-more > summary").first().click();
    await inspector.click();
    await expect(opened).toHaveCount(0);
    const closedBox = await inspector.boundingBox();
    expect(Math.abs(closedBox!.y - inspectorBox!.y)).toBeLessThan(2);
    await inspector.focus();
    await app.page.keyboard.press("Enter");
    await expect(opened).toBeVisible();
    await app.page.setViewportSize({ width: 760, height: 650 });
    await expect.poll(async () => {
      const toolbarBounds = await toolbar.boundingBox();
      const inspectorBounds = await opened.boundingBox();
      return inspectorBounds!.y - (toolbarBounds!.y + toolbarBounds!.height);
    }).toBeGreaterThanOrEqual(7);
    const narrowerToolbarBox = await toolbar.boundingBox();
    const narrowerOpenedBox = await opened.boundingBox();
    const viewerBox = await app.page.getByTestId("main-viewer").boundingBox();
    expect(narrowerToolbarBox).not.toBeNull();
    expect(narrowerOpenedBox).not.toBeNull();
    expect(viewerBox).not.toBeNull();
    expect(narrowerOpenedBox!.y).toBeGreaterThanOrEqual(narrowerToolbarBox!.y + narrowerToolbarBox!.height + 7);
    expect(narrowerOpenedBox!.y + narrowerOpenedBox!.height).toBeLessThanOrEqual(viewerBox!.y + viewerBox!.height);

    await app.page.setViewportSize({ width: 701, height: 650 });
    await expect.poll(async () => {
      const toolbarBounds = await toolbar.boundingBox();
      const inspectorBounds = await opened.boundingBox();
      return inspectorBounds!.y - (toolbarBounds!.y + toolbarBounds!.height);
    }).toBeGreaterThanOrEqual(7);
    const edgeOpenedBox = await opened.boundingBox();
    const edgeViewerBox = await app.page.getByTestId("main-viewer").boundingBox();
    expect(edgeOpenedBox).not.toBeNull();
    expect(edgeOpenedBox!.height).toBeGreaterThanOrEqual(100);
    expect(edgeOpenedBox!.y + edgeOpenedBox!.height).toBeLessThanOrEqual(edgeViewerBox!.y + edgeViewerBox!.height);

    await app.page.setViewportSize({ width: 620, height: 500 });
    await expect(app.page.locator(".graph2d-compact-panels > details > summary")).toHaveCount(2);
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
