import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";
import { clickSurfaceViewerCanvas } from "./helpers/viewerPicking";

const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry"] as const;

async function firstVisible(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  for (let i = 0; i < count; i += 1) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error("No visible locator match found.");
}

async function findSectionButton(page: Page, label: (typeof sectionLabels)[number]): Promise<Locator> {
  const buttons = page.getByRole("button", { name: label, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i += 1) {
    const button = buttons.nth(i);
    if (!(await button.isVisible().catch(() => false))) continue;
    if ((await button.getAttribute("aria-pressed")) == null) continue;
    return button;
  }
  throw new Error(`Section button not found: ${label}`);
}

async function selectSection(page: Page, label: (typeof sectionLabels)[number]): Promise<void> {
  const button = await findSectionButton(page, label);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function openGeometryPrimitiveInMeshAnalyze(page: Page, primitive: "sphere" | "box"): Promise<void> {
  await resetSurfaceAppState(page);
  await selectSection(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible({ timeout: 15_000 });

  await firstVisible(page.getByTestId("geometry-workflow-step-create")).then((button) => button.click());
  await firstVisible(page.getByRole("button", { name: "Primitive", exact: true })).then((button) => button.click());
  await page.getByTestId(`geometry-gallery-quick-add-${primitive}`).click();
  await expect(page.getByTestId("geometry-pick-committed")).toBeVisible({ timeout: 15_000 });

  await firstVisible(page.getByTestId("geometry-workflow-step-analyze")).then((button) => button.click());
  await page.getByTestId("geometry-analysis-open-mesh-analyze").scrollIntoViewIfNeeded();
  await page.getByTestId("geometry-analysis-open-mesh-analyze").click();

  await expect(page.getByText(/Mesh \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/MESH \/ ANALYZE/i).first()).toBeVisible({ timeout: 15_000 });
}

async function openGeometrySphereInMeshAnalyze(page: Page): Promise<void> {
  await openGeometryPrimitiveInMeshAnalyze(page, "sphere");
}

async function openMeshPresetInAnalyze(page: Page, presetId: string): Promise<void> {
  await resetSurfaceAppState(page);
  await selectSection(page, "Mesh");
  await firstVisible(page.getByRole("button", { name: "Mesh presets", exact: true })).then((button) => button.click());
  await expect(page.getByTestId("mesh-preset-grid")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId(`mesh-preset-card-${presetId}`).click();
  await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) => button.click());
  await page.getByTestId("surfaces-left-tab-analysis").click();
  await expect(page.getByText(/MESH \/ ANALYZE/i).first()).toBeVisible({ timeout: 15_000 });
}

test("Mesh Analyze shows curvature range, independent Probe, and returns to Geometry", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;
  const diagnosticsFailures: string[] = [];

  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await page.setViewportSize({ width: 1920, height: 1080 });
    page.on("response", (response) => {
      if (response.url().includes("/api/worker/diagnostics") && response.status() >= 400) {
        diagnosticsFailures.push(`${response.status()} ${response.url()}`);
      }
    });

    await openGeometrySphereInMeshAnalyze(page);

    await expect(page.getByTestId("mesh-analyze-science-overlay")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mesh-analyze-range-source")).toContainText(/whole mesh/i);
    await expect(page.getByTestId("mesh-analyze-curvature-min")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-curvature-max")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-curvature-mean")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-curvature-std")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-sphere-sanity")).toContainText(/K expected/i);
    await expect(page.getByTestId("mesh-analyze-sphere-sanity")).toContainText(/measured/i);
    await page.getByTestId("mesh-analyze-invert-palette").click();
    await expect(page.getByTestId("mesh-analyze-invert-palette")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-palette-direction")).toContainText(/high -> low/i);
    await expect(page.getByTestId("mesh-analyze-auto-range")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-analyze-clamp-toggle").check();
    await expect(page.getByTestId("mesh-analyze-auto-range")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mesh-analyze-manual-clamp-hint")).toContainText(/Manual clamp active/i);
    await page.getByTestId("mesh-analyze-clamp-min").fill("0.5");
    await page.getByTestId("mesh-analyze-clamp-max").fill("1.5");
    await expect(page.getByTestId("mesh-analyze-range-source")).toContainText(/clamped/i);
    await page.getByTestId("mesh-analyze-reset-range").click();
    await expect(page.getByTestId("mesh-analyze-range-source")).not.toContainText(/clamped/i);
    await page.getByTestId("mesh-analyze-range-preset-percentile").click();
    await expect(page.getByTestId("mesh-analyze-range-source")).toContainText(/clamped/i);
    await page.getByTestId("mesh-analyze-range-preset-symmetric").click();
    await expect(page.getByTestId("mesh-analyze-clamp-toggle")).toBeChecked();
    await page.getByTestId("mesh-analyze-range-preset-full").click();
    await expect(page.getByTestId("mesh-analyze-range-source")).not.toContainText(/clamped/i);
    await expect(page.getByTestId("mesh-analyze-clean-counts")).toContainText(/Clean counts/i);
    await expect(page.getByTestId("mesh-analyze-clean-counts")).toContainText(/Boundary:\s*0/i);
    await expect(page.getByTestId("mesh-analyze-clean-counts")).toContainText(/Coincident:\s*0/i);
    await expect(page.getByTestId("mesh-analyze-diagnostics-boundary-count")).toBeVisible();
    await expect(page.getByTestId("mesh-analyze-diagnostics-boundary-count")).toContainText(/Boundary:\s*0 clean/i);
    await page.getByTestId("mesh-analyze-diagnostics-boundary-count").click();
    await expect(page.getByText(/No boundary edges: mesh is closed/i).first()).toBeVisible();
    await expect(page.getByTestId("mesh-analyze-diagnostic-overlay-label")).toContainText(/No boundary edges: mesh is closed/i);
    await expect(page.getByTestId("mesh-analyze-diagnostics-coincident-count")).toBeVisible();
    await expect(page.getByTestId("mesh-analyze-diagnostics-coincident-count")).toContainText(/Coincident:\s*0 clean/i);
    await page.getByTestId("mesh-analyze-diagnostics-coincident-count").click();
    await expect(page.getByText(/No coincident vertices found/i).first()).toBeVisible();
    await expect(page.getByTestId("mesh-analyze-diagnostic-overlay-label")).toContainText(/No coincident vertices found/i);

    const toolbar = page.getByTestId("mesh-analysis-context-toolbar");
    await toolbar.getByRole("button", { name: "Edge", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Edge", exact: true })).toHaveAttribute("aria-pressed", "true");
    const probe = page.getByTestId("mesh-analyze-probe-toggle");
    if ((await probe.getAttribute("aria-pressed")) !== "true") {
      await probe.click();
    }
    await expect(probe).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-probe-help")).toContainText(/Click mesh to record probe/i);
    await expect(toolbar.getByRole("button", { name: "Edge", exact: true })).toHaveAttribute("aria-pressed", "true");
    await clickSurfaceViewerCanvas(page, 0.5, 0.52);
    await expect(page.getByTestId("mesh-analyze-probe-K")).not.toContainText("n/a", { timeout: 15_000 });
    await expect(page.getByTestId("mesh-analyze-probe-H")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-probe-k1")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-probe-k2")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-probe-label")).toContainText(/Probe: vertex \d+ at/i);
    await expect(page.getByTestId("mesh-analyze-probe-history")).toBeVisible();
    await expect(page.getByTestId("mesh-analyze-probe-history")).toContainText(/vertex/i);
    await expect(page.getByTestId("mesh-analyze-science-overlay")).toHaveCSS("overflow-y", "auto");
    await expect(page.getByTestId("mesh-analyze-probe-history-row").first()).toContainText(/v\d+/);
    await page.getByTestId("mesh-analyze-probe-history-row").first().click();
    await expect(page.getByTestId("mesh-analyze-probe-label")).toContainText(/Probe: vertex \d+ at/i);
    await page.getByTestId("mesh-analyze-clear-probes").click();
    await expect(page.getByTestId("mesh-analyze-probe-history")).toHaveCount(0);
    await expect(toolbar.getByRole("button", { name: "Edge", exact: true })).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("mesh-analyze-return-geometry").click();
    await expect(page.getByText(/Geometry \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("app-status-bar")).toContainText(/Geometry viewer/i);
    await expect(page.getByTestId("geometry-object-action-status")).toContainText(/Returned to Geometry:/i);
    await expect(page.getByTestId("geometry-active-selection-card")).toContainText(/Sphere/i);
    expect(diagnosticsFailures).toEqual([]);
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("Mesh Analyze populates curvature range for torus knot preset", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;

  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await page.setViewportSize({ width: 1920, height: 1080 });

    await openMeshPresetInAnalyze(page, "mesh_knot");
    const toolbar = page.getByTestId("mesh-analysis-context-toolbar");
    const gaussianButton = toolbar.getByRole("button", { name: "K", exact: true });
    await expect(gaussianButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-view-clean")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-view-directions")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mesh-analyze-view-gauss")).toHaveAttribute("aria-pressed", "false");
    await expect(toolbar.getByRole("button", { name: "Gauss map", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mesh-analyze-toggle-chart-grid")).toHaveAttribute("aria-pressed", "false");

    await expect(page.getByTestId("mesh-analyze-science-overlay")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("mesh-analyze-range-source")).toContainText(/whole mesh/i);
    await expect(page.getByTestId("mesh-analyze-curvature-min")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-curvature-max")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-curvature-mean")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-curvature-std")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-clean-counts")).toContainText(/Boundary:\s*0/i);
    await expect(page.getByTestId("mesh-analyze-clean-counts")).toContainText(/Coincident:\s*0/i);
    await expect(page.getByTestId("mesh-analyze-reset")).toContainText(/Reset view/i);
    await page.getByTestId("mesh-analyze-view-gauss").click();
    await expect(page.getByTestId("mesh-analyze-view-gauss")).toHaveAttribute("aria-pressed", "true");
    await expect(toolbar.getByRole("button", { name: "Gauss map", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-analyze-toggle-directions").click();
    await page.getByTestId("mesh-analyze-toggle-chart-grid").click();
    await expect(page.getByTestId("mesh-analyze-overlay-crowd-hint")).toContainText(/Many overlays active/i);
    await page.getByTestId("mesh-analyze-view-clean").click();
    await expect(page.getByTestId("mesh-analyze-view-clean")).toHaveAttribute("aria-pressed", "true");
    await expect(toolbar.getByRole("button", { name: "Gauss map", exact: true })).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mesh-analyze-toggle-directions")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mesh-analyze-toggle-chart-grid")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("mesh-analyze-overlay-crowd-hint")).toHaveCount(0);
    await page.getByTestId("mesh-analysis-result-solid").click();
    await expect(page.getByTestId("mesh-analyze-result-off")).toContainText(/No curvature result selected/i);
    await expect(toolbar.getByRole("button", { name: "Gauss map", exact: true })).toBeDisabled();
    await page.getByTestId("mesh-analyze-show-k").click();
    await expect(gaussianButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-curvature-min")).not.toContainText("n/a");
    await page.getByTestId("mesh-analyze-reset").click();
    await expect(page.getByTestId("mesh-analyze-view-clean")).toHaveAttribute("aria-pressed", "true");
    await expect(gaussianButton).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-curvature-min")).not.toContainText("n/a");
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("Mesh Analyze diagnostics highlight boundary and coincident issues in the viewport", async () => {
  test.setTimeout(120_000);
  let ctx: LaunchedSurfaceApp | null = null;

  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    const { page } = ctx;
    await page.setViewportSize({ width: 1920, height: 1080 });

    await openGeometryPrimitiveInMeshAnalyze(page, "box");

    const boundaryCount = page.getByTestId("mesh-analyze-diagnostics-boundary-count");
    await expect(boundaryCount).toBeVisible({ timeout: 15_000 });
    await expect(boundaryCount).not.toContainText(/Boundary:\s*0 clean/i);
    await boundaryCount.click();
    await expect(page.getByTestId("mesh-analyze-diagnostic-focus-strip")).toContainText(
      /Diagnostics focus:\s*\d+ boundary edge/i
    );
    await expect(page.getByTestId("mesh-analyze-diagnostic-keep-visible")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-analyze-diagnostic-keep-visible").click();
    await expect(page.getByTestId("mesh-analyze-diagnostic-keep-visible")).toHaveAttribute("aria-pressed", "false");

    const coincidentCount = page.getByTestId("mesh-analyze-diagnostics-coincident-count");
    await expect(coincidentCount).toBeVisible();
    await expect(coincidentCount).not.toContainText(/Coincident:\s*0 clean/i);
    await coincidentCount.click();
    await expect(page.getByTestId("mesh-analyze-diagnostic-focus-strip")).toContainText(
      /Diagnostics focus:\s*\d+ coincident vert/i
    );
    await expect(page.getByTestId("mesh-analyze-diagnostic-keep-visible")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("mesh-analyze-diagnostic-clear").click();
    await expect(page.getByTestId("mesh-analyze-diagnostic-focus-strip")).toHaveCount(0);
  } finally {
    await closeSurfaceApp(ctx);
  }
});
