import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState } from "./helpers/surfaceAppHarness";
import { graphEditor, openGraphType, saveGraphEditor } from "./helpers/graphAuthoring";

test("G2D50 keeps invalid polar bounds visible and disables measurement without clipping the Inspector", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId("workspace-nav-graphs").click();
    const functions = page.getByLabel("Graph functions");
    await openGraphType(page, "Polar");
    await graphEditor(page).getByLabel("Polar radius expression").fill("2*cos(theta)");
    await saveGraphEditor(page);
    await functions.getByRole("button", { name: "Select r" }).click();
    const inspector = page.getByLabel("Graph inspector");
    const measurements = inspector.getByLabel("Polar measurements");
    await measurements.getByLabel("Polar angle from").fill("13");
    await measurements.getByLabel("Polar angle to").fill("16.283185307");
    await expect(measurements.getByRole("button", { name: "Measure swept area" })).toBeDisabled();
    await expect(measurements.getByRole("button", { name: "Measure polar arc length" })).toBeDisabled();
    await expect(measurements.getByRole("status")).toContainText("authored angular domain");
    const bounds = await measurements.getByLabel("Polar angle to").evaluate(element => {
      const input = element.getBoundingClientRect();
      const panel = element.closest(".graph2d-right")!.getBoundingClientRect();
      return { inputRight: input.right, panelRight: panel.right };
    });
    expect(bounds.inputRight).toBeLessThanOrEqual(bounds.panelRight - 8);
    await expect(page.locator('[data-graph2d-path="polar_1"]')).toHaveAttribute("d", /[ML]/);
    await expect(page.getByText("Graph sampling failed", { exact: false })).toHaveCount(0);
    const resetRange = measurements.getByRole("button", { name: "Use source angle range" });
    await resetRange.focus();
    await expect(resetRange).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(measurements.getByLabel("Polar angle from")).toHaveValue("0");
    await measurements.getByLabel("Polar angle to").fill(String(Math.PI));
    await measurements.getByRole("button", { name: "Measure swept area" }).click();
    await expect(measurements.getByTestId("graph2d-polar-area-result")).toContainText("3.14159265");
  } finally { await closeSurfaceApp(app); }
});

test("G2D50 recovers a graph when the sampling worker fails to load", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.evaluate(() => {
      const NativeWorker = window.Worker;
      class FailedWorker {
        onmessage: Worker["onmessage"] = null;
        onerror: Worker["onerror"] = null;
        postMessage() { setTimeout(() => (this.onerror as ((event: ErrorEvent) => void) | null)?.(
          new ErrorEvent("error", { message: "injected worker fault" })), 0); }
        terminate() {}
      }
      window.Worker = class {
        constructor(url: string | URL, options?: WorkerOptions) {
          return String(url).includes("graph2dSamplingWorker") ? new FailedWorker() : new NativeWorker(url, options);
        }
      } as unknown as typeof Worker;
    });
    await page.getByTestId("workspace-nav-graphs").click();
    const functions = page.getByLabel("Graph functions");
    await openGraphType(page, "Function");
    await graphEditor(page).getByLabel("Function expression").fill("x^2");
    await saveGraphEditor(page);
    await expect(page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("d", /[ML]/);
    await expect(page.getByText("Graph sampling failed", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("Graph inspector").getByTestId("graph2d-sampling-status"))
      .toContainText("Adaptive bounded polyline");
  } finally { await closeSurfaceApp(app); }
});
