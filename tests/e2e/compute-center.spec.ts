import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Compute Center shows live local diagnostics and opens engine controls", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp();
    await app.page.getByTestId("top-compute-center-button").click();
    const center = app.page.getByTestId("compute-center");
    await expect(center).toBeVisible();
    await expect(center.getByRole("heading", { name: "Compute Center" })).toBeVisible();
    await expect(center.getByRole("region", { name: "Local backends" })).toContainText("CGAL");
    await expect(center.getByRole("region", { name: "Local backends" })).toContainText("VTK");
    await expect(center.getByRole("region", { name: "Broker jobs" })).toContainText("Scientific broker history");
    await expect(center.getByTestId("compute-center-python-admission")).not.toBeEmpty();
    await expect(center.getByTestId("compute-center-memory")).not.toBeEmpty();
    await center.getByRole("button", { name: "Manage engines" }).click();
    await expect(app.page.getByTestId("settings-preferences-panel")).toBeVisible();
    await expect(app.page.getByTestId("compute-engine-manager")).toBeVisible();
  } finally {
    if (app) await closeSurfaceApp(app);
  }
});
