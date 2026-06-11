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
      expect(await ctx.app.evaluate(() => process.env.MATH3D_WORKER_FAILURE_INJECTION)).toBe("worker-success");
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);

      await setSimpleSurfaceExpression(ctx.page);
      await clickGenerate(ctx.page);

      const generated = await ctx.page.evaluate(async () => {
        const result = await window.vtkMesh?.previewImplicit({
          jobId: "surface-functional-success",
          expr: "x*x + y*y + z*z - 1",
          iso: 0,
          domain: { min: [-1, -1, -1], max: [1, 1, 1] },
          resolution: 24,
        });
        return result?.ok
          ? { ok: true, vertexCount: result.vertexCount, triCount: result.triCount }
          : { ok: false, error: result?.error ?? "VTK preview API unavailable" };
      });
      expect(generated).toEqual({ ok: true, vertexCount: 3, triCount: 1 });
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
