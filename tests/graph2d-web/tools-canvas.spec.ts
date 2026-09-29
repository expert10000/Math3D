import { expect, test, type Page } from "@playwright/test";
import { checkPersonalGraphFlow } from "./personalGraphFlow";
async function start(page: Page) {
  await page.route("**/api/worker/**", r => r.fulfill({ status: 503, body: '{"error":"unavailable"}', contentType: "application/json" }));
  await page.goto("/"); await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); }); await page.reload();
  await page.getByTestId("workspace-nav-graphs").click(); await page.getByTestId("graph-gallery-open").click();
  await page.getByRole("button", { name: "Open A tangent at x = 1", exact: true }).click();
}

test("GGL11 personal copies preserve saved probes, independent source and persistent favorites", async ({ page }) => {
  await start(page); await checkPersonalGraphFlow(page);
});
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
test("G2D43 pins retain labels and visibility through undo/save and parameter cards use transient previews", async ({ page }, info) => {
  await start(page); const inspector = page.getByLabel("Graph inspector", { exact: true }), pins = inspector.getByTestId("graph2d-probes");
  await page.getByLabel("Graph functions", { exact: true }).getByRole("button", { name: "Select Parabola", exact: true }).click();
  await inspector.locator(".graph2d-critical-list button").first().click();
  await pins.getByLabel("New probe label", { exact: true }).fill("P"); await pins.getByRole("button", { name: "Pin current probe", exact: true }).click();
  const marker = page.locator('[data-testid="graph2d-saved-markers"] [data-probe-id]'); await expect(marker).toHaveCount(1); await expect(marker).toContainText("P: (");
  await pins.getByRole("button", { name: "Hide P", exact: true }).click(); await expect(marker).toHaveCount(0);
  await page.getByTestId("main-viewer").focus(); await page.keyboard.press("Control+z"); await expect(marker).toHaveCount(1);
  await pins.getByLabel("Label for P", { exact: true }).fill("Peak"); await pins.getByRole("button", { name: "Rename P", exact: true }).click(); await expect(marker).toContainText("Peak:");
  await page.getByTestId("kernel-workspace-toggle").click(); await page.getByTestId("kernel-workspace-save").click();
  await page.getByTestId("kernel-workspace-reopen").click(); await page.getByTestId("kernel-workspace-toggle").click(); await expect(marker).toContainText("Peak:");
  await page.getByTestId("graph-gallery-open").click(); const gallery = page.getByTestId("graph-gallery");
  await gallery.getByLabel("Search graphs").fill("Two slopes"); await gallery.getByRole("button", { name: "Preview Two slopes", exact: true }).click();
  await gallery.getByRole("button", { name: "Open interactive Two slopes", exact: true }).click();
  const before = await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"));
  await page.getByRole("button", { name: "Parameter cards", exact: true }).click(); const cards = page.getByTestId("graph2d-parameter-cards");
  await cards.getByLabel("a card slider", { exact: true }).focus(); await page.keyboard.press("ArrowLeft"); await expect(cards).toContainText("a = 1.9");
  expect(await page.evaluate(() => localStorage.getItem("math3d.mixed-workspace.v1"))).toBe(before);
  await cards.getByRole("button", { name: "Cancel preview", exact: true }).click(); await expect(cards).toContainText("a = 2");
  await cards.getByLabel("a card slider", { exact: true }).focus(); await page.keyboard.press("ArrowLeft");
  await cards.getByRole("button", { name: "Apply preview value", exact: true }).click(); await expect(cards).toContainText("a = 1.9");
  await cards.getByRole("button", { name: "Play animation", exact: true }).click(); await expect(cards).toContainText("Frame 15 / 15");
  await cards.getByRole("button", { name: "Reset preview", exact: true }).click(); await expect(cards).toContainText("a = 1.9");
  await page.screenshot({ path: info.outputPath("parameter-cards.png") });
});
