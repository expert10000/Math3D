import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("GRA-16 desktop shows a checked known-tone spectrum with frequency units", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Data series");
    const editor = graphEditor(page);
    await editor.getByLabel("Data series name").fill("Eight hertz tone");
    const csv = Array.from({ length: 128 }, (_, index) =>
      `${index / 128},${(2.5 * Math.cos(2 * Math.PI * 8 * index / 128)).toPrecision(12)}`).join("\n");
    await editor.getByLabel("Data series import").fill(csv);
    await expect(editor.getByLabel("Import preview")).toContainText("128 rows");
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Fourier spectrum", exact: true });
    await panel.getByLabel("Fourier analysis row budget").selectOption("2000");
    await panel.getByLabel("Fourier window").selectOption("rectangular");
    await panel.getByRole("button", { name: "Analyze spectrum", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Current spectrum");
    await panel.getByLabel("Fourier analysis row budget").selectOption("10000");
    await expect(panel.getByRole("status")).toHaveCount(0);
    await panel.getByRole("button", { name: "Analyze spectrum", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Current spectrum");
    await expect(panel.getByTestId("graph2d-fourier-plot")).toBeVisible();
    await expect(panel.getByRole("table", { name: "Fourier numerical results" })).toContainText("cycles/s");
    await panel.getByRole("button", { name: "Strongest 12" }).click();
    await expect(panel.getByRole("table", { name: "Fourier numerical results" }).locator("tbody"))
      .toContainText("8.000000");
    await panel.getByRole("button", { name: "Highlight frequency bin 8" }).click();
    await expect(panel.getByTestId("graph2d-fourier-selected-bin")).toHaveAttribute("x1", "48");
    await panel.getByLabel("Fourier x unit").fill("ms");
    await expect(panel.getByRole("status")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});

test("Fourier row cap refuses a full source above the limit without changing the graph", async () => {
  test.setTimeout(90_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    await openGraphType(page, "Data series");
    const editor = graphEditor(page);
    await editor.getByLabel("Data series name").fill("Long signal");
    await editor.getByLabel("Data series import").fill(Array.from({ length: 2048 }, (_, index) =>
      `${index / 2048},${Math.cos(2 * Math.PI * 16 * index / 2048).toPrecision(12)}`).join("\n"));
    await saveGraphEditor(page);
    const panel = page.getByRole("region", { name: "Fourier spectrum", exact: true });
    const markers = page.locator("[data-graph2d-series-markers] circle");
    await expect.poll(() => markers.count()).toBeGreaterThan(0);
    const before = await markers.count();
    await panel.getByLabel("Fourier analysis row budget").selectOption("2000");
    await panel.getByRole("button", { name: "Analyze spectrum", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("2,048 checked rows");
    expect(await markers.count()).toBe(before);
    await panel.getByLabel("Fourier analysis row budget").selectOption("10000");
    await panel.getByRole("button", { name: "Analyze spectrum", exact: true }).click();
    await expect(panel.getByRole("status")).toHaveText("Current spectrum");
    await expect(panel).toContainText("2048 samples");
  } finally { await closeSurfaceApp(app); }
});
