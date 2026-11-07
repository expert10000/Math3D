import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("M3D20-03 publishes a Field point, refuses a stale source, then publishes the new revision", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    await page.locator(".graph2d-toolbar-menu > summary").click();
    await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    const publish = explorer.getByTestId("vector-field-publish-cursor");
    await expect(publish).toBeDisabled();
    await explorer.getByRole("button", { name: "Place probe at selected coordinates" }).click();
    await expect(publish).toBeEnabled({ timeout: 60_000 });
    await publish.click();
    await expect(explorer.getByTestId("vector-field-linked-cursor")).toContainText("0, 0, 0 m");
    await explorer.getByLabel("Density x").fill("6");
    await expect(explorer.getByTestId("vector-field-cursor-status"))
      .toContainText("Field source revision or declared frame differs.");
    await expect(explorer.getByTestId("vector-field-linked-cursor")).toHaveCount(0);
    await expect(explorer.getByRole("button", { name: "Edit probe coordinates" })).toBeVisible();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(explorer.getByTestId("vector-field-linked-cursor")).toContainText("0, 0, 0 m");
    await expect(explorer.getByTestId("vector-field-cursor-status")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
