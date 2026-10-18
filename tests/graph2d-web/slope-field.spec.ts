import { expect, test } from "@playwright/test";

test("GRA-11.1 authors a slope field and renders bounded direction glyphs", async ({ page }) => {
  await page.route("**/api/worker/**", route => route.fulfill({ status: 503,
    body: '{"error":"Optional backend unavailable"}', contentType: "application/json" }));
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();
  await page.getByTestId("graph-gallery-open").click();
  await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
  const functions = page.getByLabel("Graph functions", { exact: true });
  await functions.getByRole("button", { name: "Add slope field", exact: true }).click();
  await functions.getByLabel("Slope field expression", { exact: true }).fill("x-y");
  await functions.getByRole("button", { name: "Save slope field", exact: true }).click();
  await expect(functions).toContainText("dy/dx = x-y");
  await expect(page.getByRole("complementary", { name: "Graph inspector" })).toContainText("Bounded direction grid");
  const path = page.locator('[data-graph2d-path="slope_field_1"]');
  await expect.poll(async () => (await path.getAttribute("d") ?? "").match(/M/g)?.length ?? 0).toBeGreaterThan(8);
  await functions.getByRole("button", { name: "Hide dy/dx", exact: true }).click();
  await expect(path).toHaveCount(0);
});
