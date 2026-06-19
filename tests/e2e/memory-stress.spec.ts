import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const enabled = process.env.MATH3D_RUN_MEMORY_STRESS_E2E === "1";
const cycles = Math.max(2, Number(process.env.MATH3D_MEMORY_STRESS_CYCLES ?? 4));
const navigationDwellMs = Math.max(
  100,
  Number(process.env.MATH3D_MEMORY_NAVIGATION_DWELL_MS ?? 100)
);
const sectionLabels = ["Surfaces", "Volume", "Geometry", "Curves", "Topology"] as const;

const visibleSectionButton = async (page: Page, label: string): Promise<Locator> => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const buttons = page.getByRole("button", { name: label, exact: true });
    for (let index = 0; index < (await buttons.count()); index++) {
      const button = buttons.nth(index);
      try {
        if (
          (await button.isVisible({ timeout: 250 })) &&
          (await button.getAttribute("aria-pressed", { timeout: 250 })) != null
        ) {
          return button;
        }
      } catch {
        // The root Suspense fallback can replace navigation between these calls.
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Visible workspace section not found: ${label}`);
};

const selectSection = async (page: Page, label: string) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const button = await visibleSectionButton(page, label);
      await button.click({ force: true, timeout: 1_000 });
      await expect
        .poll(
          async () => {
            try {
              return (await visibleSectionButton(page, label)).getAttribute("aria-pressed", {
                timeout: 250,
              });
            } catch {
              return null;
            }
          },
          { timeout: 5_000 }
        )
        .toBe("true");
      return;
    } catch {
      await page.waitForTimeout(100);
    }
  }
  throw new Error(`Could not select workspace section: ${label}`);
};

const selectSurfaceFamily = async (page: Page, testId: string) => {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const candidates = page.getByTestId(testId);
    for (let index = 0; index < (await candidates.count()); index++) {
      const candidate = candidates.nth(index);
      if (await candidate.isVisible()) {
        try {
          await candidate.click({ force: true, timeout: 1_000 });
          return;
        } catch {
          // Retry if React replaced the button during the click.
        }
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error(`Visible surface family control not found: ${testId}`);
};

test.describe("Renderer memory stress", () => {
  test.setTimeout(5 * 60 * 1000);
  test.skip(!enabled, "Set MATH3D_RUN_MEMORY_STRESS_E2E=1 to run the stress gate.");

  test("repeated viewer navigation returns to lifecycle and memory thresholds", async ({}, testInfo) => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await selectSection(ctx.page, "Surfaces");
      await selectSurfaceFamily(ctx.page, "surface-family-implicit");
      await ctx.page.waitForTimeout(1_000);

      const diagnosticsAvailable = await ctx.page.evaluate(() => {
        const diagnostics = (window as any).__math3dMemoryDiagnostics;
        diagnostics?.mark("memory-stress");
        return !!diagnostics;
      });
      expect(diagnosticsAvailable).toBe(true);

      for (let cycle = 0; cycle < cycles; cycle++) {
        await selectSurfaceFamily(ctx.page, "surface-family-parametric");
        await ctx.page.waitForTimeout(navigationDwellMs);
        await selectSurfaceFamily(ctx.page, "surface-family-implicit");
        await ctx.page.waitForTimeout(navigationDwellMs);
        for (const label of sectionLabels.slice(1)) {
          await selectSection(ctx.page, label);
          await ctx.page.waitForTimeout(navigationDwellMs);
        }
        await selectSection(ctx.page, "Surfaces");
        await ctx.page.waitForTimeout(navigationDwellMs);
      }

      await selectSurfaceFamily(ctx.page, "surface-family-implicit");
      await ctx.page.waitForTimeout(3_000);

      const thresholds = {
        maxHeapGrowthBytes: Number(process.env.MATH3D_MEMORY_MAX_HEAP_GROWTH_BYTES ?? 536_870_912),
        maxActiveContextGrowth: 0,
        maxContextImbalance: 0,
        maxHistoryMeshGrowthBytes: Number(
          process.env.MATH3D_MEMORY_MAX_HISTORY_GROWTH_BYTES ?? 67_108_864
        ),
      };
      const exported = await ctx.page.evaluate(
        ({ baseline, limits }) =>
          (window as any).__math3dMemoryDiagnostics.exportJson(baseline, limits),
        { baseline: "memory-stress", limits: thresholds }
      );
      await testInfo.attach("memory-diagnostics.json", {
        body: Buffer.from(exported),
        contentType: "application/json",
      });
      const parsed = JSON.parse(exported);
      expect(parsed.report, "Memory diagnostics baseline was not found").toBeTruthy();
      expect(parsed.report.violations).toEqual([]);
      expect(parsed.report.passed).toBe(true);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
