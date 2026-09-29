import { expect, test, type Page } from "@playwright/test";
async function start(page: Page) {
  await page.route("**/api/worker/**", r => r.fulfill({ status: 503, body: '{"error":"unavailable"}', contentType: "application/json" }));
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
  await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
}
test("G2D42 tools enforce prerequisites, route existing analysis and restore keyboard focus", async ({ page }) => {
  await start(page); const opener = page.getByRole("button", { name: "Tools", exact: true });
  await page.getByLabel("Graph inspector", { exact: true }).getByRole("button", { name: "Clear selection", exact: true }).click();
  await opener.focus(); await page.keyboard.press("Enter"); const tools = page.getByTestId("graph2d-tools");
  await expect(tools.getByRole("button", { name: "Move/select", exact: true })).toBeFocused();
  await expect(tools.getByRole("button", { name: "Roots", exact: true })).toBeDisabled();
  await expect(tools).toContainText("Select an explicit"); await page.keyboard.press("Escape"); await expect(opener).toBeFocused();
  await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Select Parabola", exact: true }).click();
  await opener.click(); await tools.getByRole("button", { name: "Roots", exact: true }).click();
  await expect(page.getByLabel("Graph inspector", { exact: true }).getByTestId("graph2d-critical-points")).toBeFocused();
  await page.setViewportSize({ width: 620, height: 760 }); await opener.click();
  await tools.getByRole("button", { name: "Extrema", exact: true }).click();
  await expect(page.locator('.graph2d-compact-panels [data-testid="graph2d-critical-points"]')).toBeFocused();
});
