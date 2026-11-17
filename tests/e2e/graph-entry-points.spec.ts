import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Graph Gallery, Add Graph and compact Inspector have distinct entry points", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1100, height: 750 });
    await page.getByTestId("workspace-nav-graphs").click();
    const functions = page.getByLabel("Graph functions", { exact: true });
    await expect(functions).toContainText("Add Graph creates an object in this scene. Gallery lets you preview curated scenes before opening one.");
    const galleryButton = page.getByTestId("graph-gallery-open");
    await expect(galleryButton).toHaveAttribute("title", "Preview curated scenes before opening one");
    await galleryButton.click();
    await expect(page.getByTestId("graph-gallery")).toBeVisible();
    await page.getByRole("button", { name: "Close Graph Gallery" }).click();
    await expect(galleryButton).toBeFocused();
    await functions.getByRole("button", { name: "Add Graph" }).click();
    await expect(page.getByRole("dialog", { name: "Choose graph type" })).toBeVisible();
    await page.getByRole("button", { name: "Close Add Graph" }).click();
    await expect(functions.getByRole("button", { name: "Add Graph" })).toBeFocused();
    const menu = page.locator(".graph2d-toolbar-menu");
    await menu.locator("summary").click();
    await menu.getByRole("button", { name: "Inspector" }).click();
    await expect(menu).not.toHaveAttribute("open", "");
    await expect(page.locator(".graph2d-compact-panels > details:last-child")).toHaveAttribute("open", "");
  } finally {
    await closeSurfaceApp(app);
  }
});
