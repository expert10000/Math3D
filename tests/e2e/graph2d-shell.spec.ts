import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("Graphs opens an empty desktop workspace and participates in normal navigation", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await app.page.getByTestId("workspace-nav-graphs").click();
    await expect(app.page.getByTestId("workspace-nav-graphs")).toHaveAttribute("aria-pressed", "true");
    await expect(app.page.getByTestId("graphs-workspace")).toBeVisible();
    await expect(app.page.getByLabel("Empty graph scene")).toContainText("0 functions");
    await app.page.getByTestId("workspace-nav-curves").click();
    await expect(app.page.getByTestId("graphs-workspace")).toHaveCount(0);
    await app.page.getByRole("button", { name: "Workspace back" }).click();
    await expect(app.page.getByTestId("graphs-workspace")).toBeVisible();
  } finally {
    await closeSurfaceApp(app);
  }
});
