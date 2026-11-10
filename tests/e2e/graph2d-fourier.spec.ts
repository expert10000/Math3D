import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
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
    await expect(panel.getByTestId("graph2d-result-evidence")).toHaveAttribute("data-qualification", "current");
    await panel.getByLabel("Fourier analysis row budget").selectOption("10000");
    await expect(panel.getByRole("status")).toHaveCount(0);
    await panel.getByRole("button", { name: "Analyze spectrum", exact: true }).click();
    await expect(panel.getByTestId("graph2d-result-evidence")).toHaveAttribute("data-qualification", "current");
    await expect(panel.getByTestId("graph2d-fourier-plot")).toBeVisible();
    const evidencePath = test.info().outputPath("fourier-evidence.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), evidencePath);
    await panel.getByTestId("graph2d-result-export-evidence-json").click();
    await expect.poll(() => { try { return JSON.parse(readFileSync(evidencePath, "utf8")); }
      catch { return null; } }).not.toBeNull();
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
    expect(evidence.schema).toBe("math3d.graph2d-result-evidence/v1");
    expect(evidence.assessment.status).toBe("current");
    expect(evidence.summary.samples).toBe(128);
    expect(evidence.summary.channels).toBe(1);
    const diagnostics = panel.getByTestId("gf20-spectral-diagnostics");
    await expect(diagnostics.getByRole("img", { name: "Power spectral density" })).toBeVisible();
    await expect(diagnostics.getByRole("img", { name: "Autocorrelation by lag" })).toBeVisible();
    await expect(diagnostics).toContainText("One-sided window-energy periodogram");
    await expect(diagnostics.getByRole("button", { name: "Export PSD and autocorrelation CSV" })).toBeEnabled();
    await expect(panel.getByRole("table", { name: "Fourier numerical results" })).toContainText("cycles/s");
    await panel.getByRole("button", { name: "Strongest 12" }).click();
    await expect(panel.getByRole("table", { name: "Fourier numerical results" }).locator("tbody"))
      .toContainText("8.000000");
    await panel.getByRole("button", { name: "Highlight frequency bin 8" }).click();
    await expect(panel.getByTestId("graph2d-fourier-selected-bin")).toHaveAttribute("x1", "48");
    await panel.getByLabel("Fourier x unit").fill("ms");
    await expect(panel.getByRole("status")).toHaveCount(0);
    await expect(panel.getByTestId("gf20-spectral-diagnostics")).toHaveCount(0);
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
    await expect(panel.getByTestId("graph2d-result-evidence")).toHaveAttribute("data-qualification", "current");
    await expect(panel).toContainText("2048 samples");
  } finally { await closeSurfaceApp(app); }
});

test("GRA-16 desktop compares two checked channels without merging their spectra", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 850 });
    await page.getByTestId("workspace-nav-graphs").click();
    for (const [name, frequency] of [["Eight hertz", 8], ["Twelve hertz", 12]] as const) {
      await openGraphType(page, "Data series");
      const editor = graphEditor(page);
      await editor.getByLabel("Data series name").fill(name);
      await editor.getByLabel("Data series import").fill(Array.from({ length: 128 }, (_, index) =>
        `${index / 128},${Math.cos(2 * Math.PI * frequency * index / 128).toPrecision(12)}`).join("\n"));
      await saveGraphEditor(page);
    }
    const panel = page.getByRole("region", { name: "Fourier spectrum", exact: true });
    await panel.getByLabel("Fourier window").selectOption("rectangular");
    await panel.getByRole("checkbox").check();
    await panel.getByRole("button", { name: "Analyze spectrum", exact: true }).click();
    await expect(panel.getByTestId("graph2d-result-evidence")).toHaveAttribute("data-qualification", "current");
    await expect(panel).toContainText("2 channels");
    await expect(panel.getByRole("heading", { name: /Eight hertz/ })).toBeVisible();
    await expect(panel.getByRole("heading", { name: /Twelve hertz/ })).toBeVisible();
    await panel.getByLabel("Fourier channel to inspect").selectOption({ label: "Eight hertz" });
    await panel.getByRole("button", { name: "Strongest 12" }).click();
    await expect(panel.getByRole("table", { name: "Fourier numerical results" }).locator("tbody"))
      .toContainText("8.000000");
    await panel.getByLabel("Fourier channel to inspect").selectOption({ label: "Twelve hertz" });
    await panel.getByRole("button", { name: "Strongest 12" }).click();
    await expect(panel.getByRole("table", { name: "Fourier numerical results" }).locator("tbody"))
      .toContainText("12.00000");
  } finally { await closeSurfaceApp(app); }
});
