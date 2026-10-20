import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("every Graph Add editor can load a distinct editable preset", async () => {
  test.setTimeout(90_000);
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-graphs").click();
    const panel = page.getByLabel("Graph functions", { exact: true });
    const cases = [
      ["Add function", "New function", "damped-wave", "Damped wave"],
      ["Add parametric", "New parametric", "lissajous", "Lissajous"],
      ["Add polar", "New polar", "spiral", "Spiral"],
      ["Add implicit", "New implicit", "hyperbola", "Hyperbola"],
      ["Add slope field", "New slope field", "forced", "Driven field"],
      ["Add phase portrait", "New phase portrait", "damped", "Damped spiral"],
      ["Add time-dependent ODE", "New time-dependent ODE", "forced", "Forced response"],
      ["Add inequality", "New inequality", "half-disk", "Upper half-disk"],
      ["Add piecewise", "New piecewise function", "capped", "Capped parabola"],
      ["Add data series", "New data series", "gaps", "With gap"],
    ] as const;
    for (const [add, formName, preset, label] of cases) {
      await panel.getByRole("button", { name: add, exact: true }).click();
      const form = panel.getByRole("form", { name: formName });
      await expect(form).toBeVisible();
      await expect(form.locator(".graph2d-preset-picker")).toBeInViewport();
      await form.getByLabel("Start from preset").selectOption(preset);
      await expect(form.locator("input").first()).toHaveValue(label);
      await expect(form.locator('button[type="submit"]')).toBeEnabled();
      await form.getByRole("button", { name: "Cancel" }).click();
    }
    await expect(panel.getByText("No functions in this graph.")).toBeVisible();
    await panel.getByRole("button", { name: "Add function", exact: true }).click();
    const form = panel.getByRole("form", { name: "New function" });
    await form.getByLabel("Start from preset").selectOption("parabola");
    await form.locator('button[type="submit"]').click();
    await expect(panel.getByRole("button", { name: "Select Parabola" })).toBeVisible();
  } finally { await closeSurfaceApp(app); }
});
