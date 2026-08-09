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

async function openGeometrySphereInMeshAnalyze(page: Page): Promise<void> {
  await resetSurfaceAppState(page);
  await selectSection(page, "Geometry");
  await expect(page.getByRole("heading", { name: "Geometry Viewer", exact: true })).toBeVisible({ timeout: 15_000 });

  await firstVisible(page.getByTestId("geometry-workflow-step-create")).then((button) => button.click());
  await firstVisible(page.getByRole("button", { name: "Primitive", exact: true })).then((button) => button.click());
  await page.getByTestId("geometry-gallery-quick-add-sphere").click();
  await expect(page.getByTestId("geometry-pick-committed")).toBeVisible({ timeout: 15_000 });

  await firstVisible(page.getByTestId("geometry-workflow-step-analyze")).then((button) => button.click());
  await page.getByTestId("geometry-analysis-open-mesh-analyze").scrollIntoViewIfNeeded();
  await page.getByTestId("geometry-analysis-open-mesh-analyze").click();

  await expect(page.getByText(/Mesh \/ Workspace/i).first()).toBeVisible({ timeout: 15_000 });
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
    await page.getByTestId("mesh-analyze-clamp-min").fill("0.5");
    await page.getByTestId("mesh-analyze-clamp-max").fill("1.5");
    await expect(page.getByTestId("mesh-analyze-range-source")).toContainText(/clamped/i);
    await page.getByTestId("mesh-analyze-reset-range").click();
    await expect(page.getByTestId("mesh-analyze-range-source")).not.toContainText(/clamped/i);

    const toolbar = page.getByTestId("mesh-analysis-context-toolbar");
    await toolbar.getByRole("button", { name: "Edge", exact: true }).click();
    await expect(toolbar.getByRole("button", { name: "Edge", exact: true })).toHaveAttribute("aria-pressed", "true");
    const probe = page.getByTestId("mesh-analyze-probe-toggle");
    if ((await probe.getAttribute("aria-pressed")) !== "true") {
      await probe.click();
    }
    await expect(probe).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("mesh-analyze-probe-help")).toContainText(/independent of edge pick/i);
    await expect(toolbar.getByRole("button", { name: "Edge", exact: true })).toHaveAttribute("aria-pressed", "true");
    await clickSurfaceViewerCanvas(page, 0.5, 0.52);
    await expect(page.getByTestId("mesh-analyze-probe-K")).not.toContainText("n/a", { timeout: 15_000 });
    await expect(page.getByTestId("mesh-analyze-probe-H")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-probe-k1")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-probe-k2")).not.toContainText("n/a");
    await expect(page.getByTestId("mesh-analyze-probe-label")).toContainText(/Probe: vertex \d+ at/i);
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
