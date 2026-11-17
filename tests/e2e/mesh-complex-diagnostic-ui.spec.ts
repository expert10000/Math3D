import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openSurfaceGenerator, resetSurfaceAppState } from "./helpers/surfaceAppHarness";

const capture = async (locator: import("@playwright/test").Locator, name: string) => {
  if (!process.env.MATH3D_UI_CAPTURE_DIR) return;
  mkdirSync(process.env.MATH3D_UI_CAPTURE_DIR, { recursive: true });
  await locator.screenshot({ path: join(process.env.MATH3D_UI_CAPTURE_DIR, `${name}-source-build.png`) });
};

test("Surface computation keeps source and derived revisions together", async () => {
  const app = await launchSurfaceApp();
  try {
    await resetSurfaceAppState(app.page);
    await openSurfaceGenerator(app.page);
    await app.page.getByTestId("surfaces-left-tab-analysis").click();
    const header = app.page.getByTestId("surface-representation-header");
    await expect(header).toBeVisible();
    await expect(header.getByTestId("surface-representation-source")).toContainText(/revision \d+/);
    await expect(header.getByTestId("surface-representation-derived")).toContainText(/Live tessellation|No derived mesh|mesh revision/);
    await capture(header, "surface-representations");
  } finally { await closeSurfaceApp(app); }
});

test("Mesh Run explains a missing implicit source beside the disabled action", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-mesh").click();
    await page.getByRole("button", { name: "Mesh tools", exact: true }).first().click();
    const card = page.getByTestId("mesh-workspace-operation-registry").first();
    await expect(card).toBeVisible();
    await card.getByTestId("mesh-workspace-operation-registry-row-implicit-preview").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-implicit-preview")).toBeDisabled();
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-blocker")).toContainText("Open an implicit Surface source first");
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toBeAttached();
    await capture(card.getByTestId("mesh-workspace-operation-registry-run-action"), "mesh-run-blocker");
  } finally { await closeSurfaceApp(app); }
});

test("Complex Map scopes open-sheet diagnostics to its sampled display Mesh", async () => {
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByTestId("shared-inspector-tab-summary").click();
    const summary = page.getByTestId("shared-inspector-shell");
    await expect(summary.getByTestId("shared-inspector-summary")).toContainText("Complex map / sampled display Mesh");
    await expect(summary.getByTestId("complex-map-diagnostic-scope")).toContainText("Inspect function, domain and branch validity in Function Explorer");
    await expect(summary.getByTestId("mesh-health-status")).toContainText("Open sampled sheet");
    await capture(summary.getByTestId("mesh-summary-card"), "complex-display-mesh-scope");
    await page.getByRole("banner").getByRole("button", { name: "Function Explorer", exact: true }).click();
    await expect(page.getByTestId("complex-map-diagnostic-scope")).toHaveCount(0);
  } finally { await closeSurfaceApp(app); }
});
