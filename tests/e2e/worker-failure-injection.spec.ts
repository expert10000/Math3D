import { expect, test } from "@playwright/test";
import {
  assertGenerateButtonReset,
  clickGenerate,
  closeSurfaceApp,
  expectSurfaceExpressionValue,
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
};

const cases: FailureCase[] = [
  {
    name: "worker missing",
    mode: "worker-missing",
  },
  {
    name: "worker timeout",
    mode: "worker-timeout",
  },
  {
    name: "worker malformed error",
    mode: "worker-malformed-error",
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

        await assertGenerateButtonReset(ctx.page);

        await setSurfaceExpression(ctx.page, "x*y + z");
        await expectSurfaceExpressionValue(ctx.page, "x*y + z");
      } finally {
        await closeSurfaceApp(ctx);
      }
    });
  }
});
