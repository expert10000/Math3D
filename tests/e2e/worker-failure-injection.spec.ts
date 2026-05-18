import { expect, test } from "@playwright/test";
import {
  assertGenerateButtonReset,
  clickGenerate,
  closeSurfaceApp,
  launchSurfaceApp,
  openSurfaceGenerator,
  setSurfaceExpression,
  setSimpleSurfaceExpression,
  waitForWorkerReady,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

type FailureCase = {
  name: string;
  mode: string;
  expectedMessage: RegExp;
};

const cases: FailureCase[] = [
  {
    name: "worker missing",
    mode: "worker-missing",
    expectedMessage: /worker is missing|worker unavailable|not found/i,
  },
  {
    name: "worker timeout",
    mode: "worker-timeout",
    expectedMessage: /timed out|timeout/i,
  },
  {
    name: "worker malformed error",
    mode: "worker-malformed-error",
    expectedMessage: /request failed|worker|python/i,
  },
];

test.describe("Worker failure injection", () => {
  for (const failureCase of cases) {
    test(`handles ${failureCase.name} without UI hang`, async () => {
      let ctx: LaunchedSurfaceApp | null = null;
      try {
        ctx = await launchSurfaceApp({
          MATH3D_WORKER_FAILURE_INJECTION: failureCase.mode,
        });

        await openSurfaceGenerator(ctx.page);
        await waitForWorkerReady(ctx.page);

        await setSimpleSurfaceExpression(ctx.page);
        await clickGenerate(ctx.page);

        const banner = ctx.page.getByTestId("error-banner").first();
        await expect(banner).toBeVisible({ timeout: 60_000 });
        await expect(banner).toContainText(failureCase.expectedMessage);

        await assertGenerateButtonReset(ctx.page);

        await setSurfaceExpression(ctx.page, "x*y + z");
        await expect(ctx.page.getByTestId("surface-input").first()).toHaveValue("x*y + z");
      } finally {
        await closeSurfaceApp(ctx);
      }
    });
  }
});
