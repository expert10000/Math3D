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
    await panel.getByLabel("Fourier window").selectOption("rectangular");
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
