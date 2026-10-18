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
  await expect(inspector.getByTestId("graph2d-phase-nullclines")).toContainText("complete");
  await expect(inspector.getByTestId("graph2d-phase-equilibria")).toContainText("residual");
  await expect(inspector.getByTestId("graph2d-phase-classification")).toContainText("linear center");
  await expect(page.locator('[data-graph2d-path="phase_portrait_1"]')).toHaveAttribute("d", /L/);
  await expect(page.locator('[data-graph2d-nullclines="phase_portrait_1"] path[data-nullcline="x"]')).toHaveAttribute("d", /M/);
  await expect(page.locator('[data-graph2d-nullclines="phase_portrait_1"] path[data-nullcline="y"]')).toHaveAttribute("d", /M/);
  await expect(page.locator('[data-graph2d-equilibrium="phase_portrait_1"]')).toHaveCount(1);
  await expect(page.locator('[data-graph2d-phase-seed^="phase_portrait_1-"]')).toHaveCount(1);
  await functions.getByRole("button", { name: "Edit Phase portrait", exact: true }).click();
  await functions.getByLabel("Phase portrait y derivative").fill("x");
  await functions.getByRole("button", { name: "Save phase portrait", exact: true }).click();
  await expect(functions).toContainText("y' = x");
});

test("Gallery opens a nonlinear phase portrait with three equilibrium candidates", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();
  const functions = page.getByLabel("Graph functions", { exact: true });
  await functions.getByRole("button", { name: "Add phase portrait", exact: true }).click();
  await functions.getByRole("button", { name: "Browse phase portrait examples", exact: true }).click();
  await expect(page.getByRole("button", { name: "Differential equations", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Open Three equilibria", exact: true }).click();
  await expect(page.locator('[data-graph2d-equilibrium="phase_portrait_1"]')).toHaveCount(3);
  const inspector = page.getByRole("complementary", { name: "Graph inspector" });
  await expect(inspector.getByTestId("graph2d-phase-equilibria"))
    .toContainText("residual");
  await expect(inspector.getByTestId("graph2d-phase-classification")).toHaveCount(3);
  await expect(inspector.getByTestId("graph2d-phase-classification").filter({ hasText: "stable node" })).toHaveCount(2);
});
