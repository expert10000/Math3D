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
      await expect(ctx.page.getByTestId("surface-analysis-contract")).toBeVisible();
      await expect(ctx.page.getByTestId("surface-analysis-contract-state")).toHaveText("ready");
      await expect(ctx.page.getByTestId("surface-analysis-contract-identity")).toContainText("implicit");
      await expect(ctx.page.getByTestId("surface-analysis-contract-identity")).toContainText("revision 1");
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

  test("Test 3 — invalid input failure", async () => {
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
