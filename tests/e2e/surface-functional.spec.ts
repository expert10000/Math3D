import { expect, test } from "@playwright/test";
import {
  assertGenerateButtonReset,
  clickGenerate,
  closeSurfaceApp,
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
      await openSurfaceGenerator(ctx.page);
      await waitForWorkerReady(ctx.page);

      await setSimpleSurfaceExpression(ctx.page);
      await clickGenerate(ctx.page);

      await expect(ctx.page.getByTestId("app-status-bar")).toContainText("3 vertices / 1 faces", {
        timeout: 10_000,
      });
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

      const banner = ctx.page.getByTestId("error-banner").first();
      await expect(banner).toBeVisible({ timeout: 60_000 });
      const message = (await banner.innerText()).trim();
      expect(message.length).toBeGreaterThan(12);
      expect(/error|invalid|failed|worker|python/i.test(message)).toBeTruthy();

      await assertGenerateButtonReset(ctx.page);

      await setSimpleSurfaceExpression(ctx.page);
      await expect(ctx.page.getByTestId("surface-input").first()).toHaveValue("x*x + y*y + z*z - 1");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
