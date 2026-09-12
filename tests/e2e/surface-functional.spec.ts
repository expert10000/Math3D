import { expect, test } from "@playwright/test";
import {
  assertGenerateButtonReset,
  clickGenerate,
  closeSurfaceApp,
  expectSurfaceExpressionValue,
  launchSurfaceApp,
  openSurfaceGenerator,
  openParametricSurface,
  readWorkerStatusText,
  setSurfaceExpression,
  setSimpleSurfaceExpression,
  waitForWorkerReady,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

test.describe("Surface functional flow", () => {
  test("Test 1 — startup smoke", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);

      await expect.poll(async () => (await readWorkerStatusText(ctx.page)).toLowerCase()).not.toContain(
        "worker unavailable"
      );
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      await expect(ctx.page.getByTestId("surface-analysis-computation-panel")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-computation-differential-geometry")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-computation-chart-diagnostics")).toBeVisible();
      await ctx.page.getByTestId("surface-computation-differential-geometry").focus();
      await ctx.page.keyboard.press("Tab");
      await expect(ctx.page.getByTestId("surface-computation-curvature-field")).toBeFocused();
      await expect(ctx.page.getByTestId("surface-derived-mesh-bridge")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-analysis-legacy-tools")).not.toHaveAttribute("open", "");
      await ctx.page.getByTestId("surface-analysis-open-configuration").click();
      await expect(ctx.page.getByTestId("surface-analysis-open-configuration")).toHaveAttribute("aria-expanded", "true");
      await expect(ctx.page.getByTestId("surface-analysis-legacy-tools")).toHaveAttribute("open", "");
      await expect(ctx.page.getByTestId("surface-analysis-inspector")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-analysis-contract")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await expect(ctx.page.getByTestId("surface-analysis-contract-identity")).toContainText("implicit");
      await expect(ctx.page.getByTestId("surface-analysis-contract-identity")).toContainText("revision 1");
      await ctx.page.getByTestId("surface-analysis-inspector-provenance").click();
      await expect(ctx.page.getByRole("tabpanel")).toContainText("Representation:");
      await ctx.page.getByTestId("surfaces-left-tab-view").click();
      await expect(ctx.page.getByTestId("surface-analysis-display-controls")).toBeVisible();
      await expect.poll(async () => ctx!.page.evaluate(() => {
        const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
        return raw ? JSON.parse(raw).definitions?.length ?? 0 : 0;
      })).toBeGreaterThan(0);
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 2 — simple geometry generate", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp({
        MATH3D_WORKER_FAILURE_INJECTION: "worker-success",
      });
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);

      await setSimpleSurfaceExpression(ctx.page);
      await clickGenerate(ctx.page);

      await expect.poll(async () => {
        const text = await ctx!.page.getByTestId("app-status-bar").innerText();
        const match = text.match(/(\d[\d,]*)\s+vertices\s*\/\s*(\d[\d,]*)\s+faces/i);
        if (!match) return false;
        const vertices = Number(match[1].replace(/,/g, ""));
        const faces = Number(match[2].replace(/,/g, ""));
        return vertices > 0 && faces > 0;
      }, { timeout: 10_000 }).toBe(true);
      await expect(ctx.page.getByTestId("app-status-bar")).toContainText("type mesh");
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 3 — canonical curvature result lifecycle", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      await ctx.page.getByTestId("surface-computation-curvature-field").click();
      const compute = ctx.page.getByTestId("surface-curvature-compute-button");
      await expect(compute).toBeEnabled({ timeout: 10_000 });
      await compute.click();
      await expect(ctx.page.getByTestId("surface-curvature-execution-state")).toHaveText(/Execution: (ready|cached)/);
      await expect(ctx.page.getByTestId("surface-curvature-result")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-curvature-statistics")).toContainText("RMS");
      await expect(ctx.page.getByTestId("surface-curvature-display-controls")).toBeVisible();

      await ctx.page.getByLabel("Curvature scalar field").selectOption("shapeIndex");
      await ctx.page.getByLabel("Curvature palette").selectOption("grayscale");
      await ctx.page.getByLabel("Curvature range").selectOption("percentile");
      await expect(ctx.page.getByTestId("surface-curvature-statistics")).toContainText("shapeIndex");

      const resultPanel = ctx.page.getByTestId("surface-curvature-result");
      await resultPanel.getByRole("button", { name: "Save", exact: true }).click();
      await expect.poll(async () => ctx!.page.evaluate(() => {
        const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
        return raw ? JSON.parse(raw).savedResults?.filter((entry: { kind?: string }) => entry.kind === "curvature-field").length ?? 0 : 0;
      })).toBe(1);
      await resultPanel.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(resultPanel).toContainText("Baseline stored");
      await resultPanel.getByRole("button", { name: "Hide", exact: true }).click();
      await expect(resultPanel.getByRole("button", { name: "Show", exact: true })).toBeVisible();
      await resultPanel.getByRole("button", { name: "Show", exact: true }).click();
      await resultPanel.getByRole("button", { name: "Recompute", exact: true }).click();
      await expect(ctx.page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 4 — canonical local probe and Euler evidence", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      await ctx.page.getByTestId("surface-computation-surface-probe").click();
      await ctx.page.getByTestId("surface-probe-current-sample").click();
      const probe = ctx.page.getByTestId("surface-local-probe-result");
      await expect(probe).toBeVisible({ timeout: 10_000 });
      await expect(probe).toContainText("Position:");
      await expect(probe).toContainText("I = (E,F,G):");
      await expect(probe).toContainText("II = (L,M,N):");
      await expect(probe).toContainText("Euler:");
      await ctx.page.getByTestId("surface-probe-angle").fill("60");
      await expect(ctx.page.getByTestId("surface-probe-normal-curvature")).toContainText("cos²");
      await probe.getByRole("button", { name: "Pin probe" }).click();
      await expect(probe).toContainText("Pinned probes (1)");
      await probe.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(probe).toContainText("Baseline");
      await probe.getByRole("button", { name: "Hide probe evidence" }).click();
      await expect(probe.getByRole("button", { name: "Show probe evidence" })).toBeVisible();
      await probe.getByRole("button", { name: /Replay probe-/ }).click();
      await expect(ctx.page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 5 — persistent Surface curve and feature layers", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();

      await ctx.page.getByTestId("surface-computation-surface-curves").click();
      await ctx.page.getByTestId("surface-collect-curve-layers").click();
      const layers = ctx.page.getByTestId("surface-result-layers");
      await expect(layers).toBeVisible();
      for (const kind of ["geodesic", "principal-k1", "principal-k2", "asymptotic", "level"]) {
        await expect(ctx.page.getByTestId(`surface-result-layer-${kind}`)).toBeVisible();
      }
      const geodesic = ctx.page.getByTestId("surface-result-layer-geodesic");
      const visibility = geodesic.getByRole("button", { name: /^(Hide|Show)$/ });
      const before = await visibility.textContent();
      await visibility.click();
      await expect(geodesic.getByRole("button", { name: before === "Hide" ? "Show" : "Hide", exact: true })).toBeVisible();
      await geodesic.getByRole("button", { name: "Save", exact: true }).click();
      await geodesic.getByRole("button", { name: "Compare", exact: true }).click();
      await expect(layers).toContainText("Baseline Geodesics stored");
      await ctx.page.getByTestId("surface-result-layer-principal-k2").getByRole("button", { name: "Remove", exact: true }).click();
      await expect(ctx.page.getByTestId("surface-result-layer-principal-k2")).toHaveCount(0);

      await ctx.page.getByTestId("surface-computation-surface-features").click();
      await ctx.page.getByTestId("surface-collect-feature-layers").click();
      for (const kind of ["ridge", "valley", "umbilic", "parabolic", "critical-point", "representation-singularity"]) {
        await expect(ctx.page.getByTestId(`surface-result-layer-${kind}`)).toBeVisible();
      }
      const critical = ctx.page.getByTestId("surface-result-layer-critical-point");
      await expect(critical).toContainText("empty");
      await critical.getByRole("button", { name: "Save", exact: true }).click();
      await critical.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(critical).toHaveCount(0);
      await expect.poll(async () => ctx!.page.evaluate(() => {
        const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
        return raw ? JSON.parse(raw).savedResults?.filter((entry: { kind?: string }) => entry.kind === "surface-curves" || entry.kind === "surface-features").length ?? 0 : 0;
      })).toBeGreaterThanOrEqual(2);
      await expect(ctx.page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 6 — parameter-domain chart diagnostics", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openParametricSurface(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      await ctx.page.getByTestId("surface-computation-chart-diagnostics").click();
      const compute = ctx.page.getByTestId("surface-chart-compute-button");
      await expect(compute).toBeEnabled({ timeout: 10_000 });
      await compute.click();
      const chart = ctx.page.getByTestId("surface-chart-result");
      await expect(chart).toBeVisible();
      await expect(ctx.page.getByTestId("surface-chart-metric-statistics")).toContainText("det(g)");
      await expect(ctx.page.getByTestId("surface-chart-domain-view")).toBeVisible();
      const boundary = chart.getByRole("button", { name: "Hide Chart boundary", exact: true });
      await boundary.click();
      await expect(chart.getByRole("button", { name: "Show Chart boundary", exact: true })).toBeVisible();
      await chart.getByRole("button", { name: "Save", exact: true }).click();
      await chart.getByRole("button", { name: "Recompute", exact: true }).click();
      await expect(ctx.page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 7 — provenance-linked derived SurfaceMesh lifecycle", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openParametricSurface(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      const bridge = ctx.page.getByTestId("surface-derived-mesh-bridge");
      await expect(bridge).toBeVisible();
      await expect(ctx.page.getByTestId("surface-derived-mesh-provenance")).toContainText("live-current");
      await expect(ctx.page.getByTestId("surface-derived-mesh-provenance")).toContainText("source revision");
      await ctx.page.getByTestId("surface-derived-mesh-regenerate").click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-provenance")).toContainText("mesh revision 2");
      await ctx.page.getByTestId("surface-derived-mesh-bake").click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-provenance")).toContainText("frozen-snapshot");
      await bridge.getByRole("button", { name: "Detach", exact: true }).click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-provenance")).toContainText("detached");
      await ctx.page.getByTestId("surface-derived-mesh-inspect").click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-inspector")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-derived-mesh-inspector")).toContainText("Tessellation:");
      await expect(ctx.page.getByTestId("surface-derived-mesh-inspector")).toContainText("Regeneration history");
      await expect.poll(async () => ctx!.page.evaluate(() => {
        const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
        return raw ? JSON.parse(raw).derivedMeshes?.length ?? 0 : 0;
      })).toBeGreaterThanOrEqual(3);
      await bridge.getByRole("button", { name: "Delete", exact: true }).click();
      await expect.poll(async () => ctx!.page.evaluate(() => {
        const raw = localStorage.getItem("math3d.surfaceAnalysis.workspace.v1");
        return raw ? JSON.parse(raw).derivedMeshes?.length ?? 0 : 0;
      })).toBeGreaterThanOrEqual(2);
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 8 — live mesh, baked snapshot, Mesh Analysis and mapped return", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openParametricSurface(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      await ctx.page.getByTestId("surface-computation-surface-probe").click();
      await ctx.page.getByTestId("surface-probe-current-sample").click();

      await ctx.page.getByTestId("surface-derived-mesh-live").click();
      const sourceCard = ctx.page.getByTestId("surface-mesh-source-handoff");
      await expect(sourceCard).toBeVisible();
      await expect(sourceCard).toContainText("live-current");
      await expect(sourceCard).toContainText("mapped selection");
      await ctx.page.getByTestId("surface-mesh-return-source").click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-bridge")).toBeVisible();

      await ctx.page.getByTestId("surface-derived-mesh-bake").click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-provenance")).toContainText("frozen-snapshot");
      await ctx.page.getByTestId("surface-derived-mesh-open-analysis").click();
      await expect(sourceCard).toBeVisible();
      await expect(sourceCard).toContainText("frozen-snapshot");
      await expect(sourceCard).toContainText("Torus");
      await ctx.page.getByTestId("surface-mesh-return-source").click();
      await expect(ctx.page.getByTestId("surface-derived-mesh-bridge")).toBeVisible();
      await expect(ctx.page.getByText(/Returned to Torus revision .* mapped selection restored/)).toBeVisible();
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 9 — invalid input failure", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp({
        MATH3D_WORKER_FAILURE_INJECTION: "worker-invalid-expression",
      });
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);

      await setSurfaceExpression(ctx.page, "x***y");
      await clickGenerate(ctx.page);
      await assertGenerateButtonReset(ctx.page);

      await setSimpleSurfaceExpression(ctx.page);
      await expectSurfaceExpressionValue(ctx.page, "x*x + y*y + z*z - 1");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("Test 10 — compact derived-mesh backend bridge routes to shared Mesh operations", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await openParametricSurface(ctx.page);
      await ctx.page.getByTestId("surfaces-left-tab-analysis").click();
      const provenance = ctx.page.getByTestId("surface-derived-mesh-provenance");
      await expect(provenance).toContainText("native-tessellation");
      await expect(provenance).toContainText("Watertight:");
      await expect(provenance).toContainText("boundary edges:");
      await expect(ctx.page.getByTestId("surface-derived-mesh-backend-status")).toContainText("Advanced parameters");
      const remesh = ctx.page.getByTestId("surface-derived-mesh-remesh");
      await expect(remesh).toBeEnabled({ timeout: 15_000 });
      await remesh.click();
      await expect(ctx.page.getByTestId("mesh-workspace-left-tab-operations")).toHaveAttribute("aria-pressed", "true");
      await expect(ctx.page.getByTestId("mesh-workspace-operation-registry-row-cgal-remesh")).toBeVisible();
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
