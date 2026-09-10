import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const sectionLabels = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry"] as const;

type MeshBenchmarkHook = {
  loadBenchmarkModel: (id: string) => Promise<{ ok: boolean; error?: string }>;
};

type MeshAnalysisHook = {
  compareGraphAndSurfacePath: () => Promise<{
    ok: boolean;
    graphLength?: number;
    surfaceLength?: number;
    graphMethod?: string;
    surfaceMethod?: string;
    error?: string;
  }>;
};

async function firstVisible(locator: Locator): Promise<Locator> {
  for (let index = 0; index < await locator.count(); index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  throw new Error("No visible locator match found.");
}

async function selectSection(page: Page, label: (typeof sectionLabels)[number]): Promise<void> {
  const buttons = page.getByRole("button", { name: label, exact: true });
  for (let index = 0; index < await buttons.count(); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible().catch(() => false))) continue;
    if ((await button.getAttribute("aria-pressed")) == null) continue;
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    return;
  }
  throw new Error(`Section button not found: ${label}`);
}

async function openMeshAnalyze(page: Page): Promise<void> {
  await firstVisible(page.getByRole("button", { name: "Mesh tools", exact: true })).then((button) => button.click());
  await page.getByTestId("surfaces-left-tab-analysis").click();
  await expect(page.getByText(/MESH \/ ANALYZE/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("mesh-analyze-taxonomy")).toBeVisible();
}

async function openPreset(page: Page, presetId: string): Promise<void> {
  await resetSurfaceAppState(page);
  await selectSection(page, "Mesh");
  await firstVisible(page.getByRole("button", { name: "Mesh presets", exact: true })).then((button) => button.click());
  await page.getByTestId(`mesh-preset-card-${presetId}`).click();
  await openMeshAnalyze(page);
}

async function loadBenchmark(page: Page, benchmarkId: string): Promise<void> {
  await resetSurfaceAppState(page);
  await selectSection(page, "Mesh");
  await page.waitForFunction(
    () => !!(window as Window & { __MATH3D_E2E_MESH_BENCHMARK__?: MeshBenchmarkHook }).__MATH3D_E2E_MESH_BENCHMARK__,
    undefined,
    { timeout: 20_000 }
  );
  const result = await page.evaluate(async (id) => {
    const hook = (window as Window & { __MATH3D_E2E_MESH_BENCHMARK__?: MeshBenchmarkHook }).__MATH3D_E2E_MESH_BENCHMARK__;
    return hook ? hook.loadBenchmarkModel(id) : { ok: false, error: "Benchmark hook unavailable." };
  }, benchmarkId);
  expect(result.ok, result.error).toBeTruthy();
  await openMeshAnalyze(page);
}

async function withApp(run: (page: Page) => Promise<void>): Promise<void> {
  let context: LaunchedSurfaceApp | null = null;
  try {
    context = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await context.page.setViewportSize({ width: 1920, height: 1080 });
    await run(context.page);
  } finally {
    await closeSurfaceApp(context);
  }
}

test("v1 clean-sphere workflow preserves clean topology and the left / center / right scientific layout", async () => {
  test.setTimeout(120_000);
  await withApp(async (page) => {
    await openPreset(page, "mesh_icosphere");
    await expect(page.getByTestId("mesh-analyze-curvature-worker-status")).toContainText(/Worker: ready/i, { timeout: 30_000 });
    await expect(page.getByTestId("mesh-analyze-health-badge")).toContainText(
      /State check:\s*Warning.*suspected intersections/i
    );
    await page.getByTestId("mesh-inspector-tab-diagnostics").click();
    await expect(page.getByTestId("mesh-analyze-diagnostics-boundary-count")).toContainText(/Boundary:\s*0 clean/i);
    await expect(page.getByTestId("mesh-analyze-diagnostics-coincident-count")).toContainText(/Coincident:\s*0 clean/i);

    const left = await page.getByTestId("surface-left-panel").boundingBox();
    const center = await page.getByTestId("surface-primary-viewer").boundingBox();
    const right = await page.getByTestId("surface-right-panel").boundingBox();
    expect(left).not.toBeNull();
    expect(center).not.toBeNull();
    expect(right).not.toBeNull();
    expect(left!.x + left!.width).toBeLessThanOrEqual(center!.x + 1);
    expect(center!.x + center!.width).toBeLessThanOrEqual(right!.x + 1);
    await expect(page.getByRole("button", { name: "VTK", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "CGAL", exact: true })).toHaveCount(0);
  });
});

test("v1 Fandisk workflow publishes curvature and feature classification", async () => {
  test.setTimeout(150_000);
  await withApp(async (page) => {
    await loadBenchmark(page, "fandisk");
    await expect(page.getByTestId("mesh-analyze-curvature-worker-status")).toContainText(/Worker: ready/i, { timeout: 45_000 });
    await page.getByTestId("mesh-analysis-nav-surface-features").click();
    await expect(page.getByTestId("mesh-analyze-surface-feature-config")).toContainText(/classification.*valid vertices/i, { timeout: 45_000 });
    await expect(page.getByTestId("mesh-analyze-surface-feature-summary")).toContainText(/feature edges/i);
  });
});

test("v1 Stanford Bunny workflow completes analysis in workers", async () => {
  test.setTimeout(180_000);
  await withApp(async (page) => {
    await loadBenchmark(page, "stanford-bunny");
    await expect(page.getByTestId("mesh-analyze-curvature-worker-status")).toContainText(/Worker: ready/i, { timeout: 60_000 });
    await page.getByTestId("mesh-analysis-nav-surface-features").click();
    await expect(page.getByTestId("mesh-analyze-surface-feature-config")).toContainText(/classification.*valid vertices/i, { timeout: 60_000 });
    await page.getByTestId("mesh-inspector-tab-history").click();
    await expect(page.getByTestId("mesh-analysis-computation-history")).toContainText(/Mesh analysis worker/i);
  });
});

test("v1 problem-mesh workflow exposes open boundaries through canonical diagnostics", async () => {
  test.setTimeout(120_000);
  await withApp(async (page) => {
    await loadBenchmark(page, "open-boundary");
    await expect(page.getByTestId("mesh-analyze-health-badge")).toContainText(/State check:\s*Invalid/i);
    await page.getByTestId("mesh-inspector-tab-diagnostics").click();
    const boundary = page.getByTestId("mesh-analyze-diagnostics-boundary-count");
    await expect(boundary).toContainText(/Boundary:\s*4/i);
    await boundary.click();
    await expect(page.getByTestId("mesh-analyze-diagnostic-focus-strip")).toContainText(/4 boundary edges/i);
  });
});

test("v1 graph-versus-surface workflow distinguishes edge routing from CGAL surface distance", async () => {
  test.setTimeout(150_000);
  await withApp(async (page) => {
    await loadBenchmark(page, "open-boundary");
    await expect(page.getByTestId("mesh-analyze-curvature-worker-status")).toContainText(/Worker: ready/i, { timeout: 30_000 });
    await page.getByTestId("mesh-analysis-nav-geodesics").click();
    await expect(page.getByTestId("mesh-analysis-context-category")).toHaveText("Distances & Geodesics");
    await page.waitForFunction(
      () => !!(window as Window & { __MATH3D_E2E_MESH_ANALYSIS__?: MeshAnalysisHook }).__MATH3D_E2E_MESH_ANALYSIS__,
      undefined,
      { timeout: 20_000 }
    );
    const comparison = await page.evaluate(async () => {
      const hook = (window as Window & { __MATH3D_E2E_MESH_ANALYSIS__?: MeshAnalysisHook }).__MATH3D_E2E_MESH_ANALYSIS__;
      return hook ? hook.compareGraphAndSurfacePath() : { ok: false, error: "Analysis hook unavailable." };
    }) as Awaited<ReturnType<MeshAnalysisHook["compareGraphAndSurfacePath"]>>;
    expect(comparison.ok, comparison.error).toBeTruthy();
    expect(comparison.graphMethod).toBe("approximate-edge-graph");
    expect(comparison.surfaceMethod).toBe("cgal-surface-shortest-path");
    expect(comparison.graphLength).toBeGreaterThan((comparison.surfaceLength ?? Number.POSITIVE_INFINITY) * 1.3);
  });
});
