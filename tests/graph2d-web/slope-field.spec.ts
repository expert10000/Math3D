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

test("GRA-11.2 links an initial-value trajectory and exposes its stop status", async ({ page }) => {
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
  await functions.getByLabel("Slope field expression", { exact: true }).fill("x");
  await functions.getByRole("button", { name: "Save slope field", exact: true }).click();
  await functions.getByRole("button", { name: "Add trajectory for dy/dx", exact: true }).click();
  await functions.getByLabel("Trajectory initial x", { exact: true }).fill("0");
  await functions.getByLabel("Trajectory initial y", { exact: true }).fill("1");
  await functions.getByRole("button", { name: "Save trajectory", exact: true }).click();
  await expect(functions).toContainText("from slope_field_1: y(0) = 1");
  const path = page.locator('[data-graph2d-path="trajectory_1"]');
  await expect.poll(async () => (await path.getAttribute("d") ?? "").match(/L/g)?.length ?? 0).toBeGreaterThan(5);
  await expect(page.locator('[data-graph2d-trajectory-seed="trajectory_1"]')).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Graph inspector" }).getByTestId("graph2d-trajectory-stops"))
    .toContainText("Backward: domain-boundary");
  await functions.getByRole("button", { name: "Edit Solution", exact: true }).click();
  await functions.getByLabel("Trajectory initial y", { exact: true }).fill("2");
  await functions.getByRole("button", { name: "Save trajectory", exact: true }).click();
  await expect(functions).toContainText("y(0) = 2");
});
