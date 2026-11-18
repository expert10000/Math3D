import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("M4.2 distinguishes open and non-manifold topology from triangle validity", async () => {
  test.setTimeout(150_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const page = app.page;
    await page.setViewportSize({ width: 1920, height: 1080 });
    await resetSurfaceAppState(page);
    const meshButtons = page.getByRole("button", { name: "Mesh", exact: true });
    for (let index = 0; index < await meshButtons.count(); index += 1) {
      const button = meshButtons.nth(index);
      if (await button.isVisible() && await button.getAttribute("aria-pressed") !== null) { await button.click(); break; }
    }
    await page.getByRole("button", { name: "Mesh tools", exact: true }).first().click();
    await page.getByTestId("mesh-workspace-source-summary").getByRole("button", { name: "+ Add" }).click();
    const importPanel = page.getByTestId("mesh-workspace-open-mesh-file");
    await importPanel.getByRole("checkbox", { name: "Weld coincident vertices" }).uncheck();
    const fileInput = importPanel.locator('input[type="file"]');
    await fileInput.setInputFiles(resolve("tests/assets/meshes/problematic/15_open_boundary.obj"));

    await page.getByTestId("shared-inspector-tab-diagnostics").click();
    const source = page.getByTestId("mesh-topology-indexed-source");
    const suitability = page.getByTestId("mesh-topology-suitability");
    const health = page.getByTestId("mesh-inspector-canonical-health");
    await expect(source).toContainText(/Vertices 8 · Faces 10/);
    await expect(source).toContainText(/Boundary edges 4 · Boundary loops 1 · Non-manifold edges 0/);
    await expect(source).toContainText("Manifold yes · Closed no · Watertight no");
    await expect(suitability).toContainText("Closed-solid suitability: no — open boundary");
    await expect(suitability).toContainText("Triangle validity: valid");
    await expect(suitability).toContainText(/Self-intersections: (not checked|\d+ suspected pairs? \(sampled)/);
    await expect(health).toContainText("Status: Open sheet (not closed solid)");
    await expect(health).not.toContainText("Status: Invalid");

    await fileInput.setInputFiles(resolve("tests/assets/meshes/problematic/16_non_manifold_edge.obj"));
    await expect(source).toContainText(/Vertices 5 · Faces 3/);
    await expect(source).toContainText("Boundary edges 6");
    await expect(source).toContainText(/Boundary loops \d+/);
    await expect(source).toContainText("Non-manifold edges 1");
    await expect(source).toContainText("Manifold no · Closed no · Watertight no");
    await expect(suitability).toContainText("Closed-solid suitability: no — non-manifold topology");
    await expect(suitability).toContainText("Triangle validity: valid");
    await expect(suitability).toContainText("Self-intersections:");
    await expect(health).toContainText("Status: Non-manifold mesh (not closed solid)");
  } finally {
    await closeSurfaceApp(app);
  }
});
