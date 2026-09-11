import { expect, test } from "@playwright/test";
import {
  assertGenerateButtonReset,
  clickGenerate,
  closeSurfaceApp,
  expectSurfaceExpressionValue,
  launchSurfaceApp,
  openSurfaceGenerator,
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

  test("Test 5 — invalid input failure", async () => {
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
});
