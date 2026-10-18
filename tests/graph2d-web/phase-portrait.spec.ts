import { expect, test } from "@playwright/test";

test("GRA-11.3 authors and edits a planar phase portrait with directions and orbits", async ({ page }) => {
  await page.route("**/api/worker/**", route => route.fulfill({ status: 503,
    body: '{"error":"Optional backend unavailable"}', contentType: "application/json" }));
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();
  await page.getByTestId("graph-gallery-open").click();
  await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
  const functions = page.getByLabel("Graph functions", { exact: true });
  await functions.getByRole("button", { name: "Add phase portrait", exact: true }).click();
  await expect(functions.getByLabel("Phase portrait x derivative")).toHaveValue("y");
  await expect(functions.getByLabel("Phase portrait y derivative")).toHaveValue("-x");
  await functions.getByRole("button", { name: "Save phase portrait", exact: true }).click();
  await expect(functions).toContainText("x' = y; y' = -x");
  const inspector = page.getByRole("complementary", { name: "Graph inspector" });
  await expect(inspector).toContainText("Adaptive phase portrait");
  await expect(inspector.getByTestId("graph2d-phase-orbits")).toContainText("forward time-horizon");
  await expect(page.locator('[data-graph2d-path="phase_portrait_1"]')).toHaveAttribute("d", /L/);
  await expect(page.locator('[data-graph2d-phase-seed^="phase_portrait_1-"]')).toHaveCount(1);
  await functions.getByRole("button", { name: "Edit Phase portrait", exact: true }).click();
  await functions.getByLabel("Phase portrait y derivative").fill("x");
  await functions.getByRole("button", { name: "Save phase portrait", exact: true }).click();
  await expect(functions).toContainText("y' = x");
});
