import { expect, test, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const expectStatus = async (page: Page, text: string) => {
  await expect(page.getByTestId("app-status-bar")).toContainText(text, { timeout: 15_000 });
};

const clickFirstVisibleButton = async (page: Page, name: string) => {
  const buttons = page.getByRole("button", { name, exact: true });
  for (let index = 0; index < (await buttons.count()); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    await button.click();
    return;
  }
  throw new Error(`Visible button not found: ${name}`);
};

test.describe("v1.5.0 platform compatibility baseline", () => {
  test("Topology preset, editor, exact analysis, and realization views remain reachable", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1700, 1050));
      await resetSurfaceAppState(ctx.page);

      await ctx.page.getByTestId("workspace-nav-topology").click();
      await expect(ctx.page.getByRole("heading", { name: "Topology Module" })).toBeVisible();
      await ctx.page.getByTestId("topology-preset-card-torus_square").click();
      await expect(ctx.page.getByTestId("topology-selected-preset")).toHaveText("Torus square");

      await ctx.page.getByRole("button", { name: "Editor mode", exact: true }).click();
      const word = ctx.page.getByTestId("topology-guided-word-input");
      await word.fill("a b a^-1 b^-1");
      await expect(ctx.page.getByTestId("topology-guided-word-classification")).toContainText("Torus");
      await ctx.page.getByTestId("topology-build-reviewed-word").click();

      await ctx.page.getByRole("button", { name: "Complex View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-complex-view")).toBeVisible();
      await expect(ctx.page.getByTestId("topology-chain-condition")).toContainText("PASS");
      await ctx.page.getByRole("button", { name: "Algebra View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-algebra-view")).toBeVisible();
      await expect(ctx.page.getByTestId("topology-algebra-groups")).toContainText("Z^2");
      await ctx.page.getByRole("button", { name: "Realization View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-realization-authority")).toBeVisible();
      await expect(ctx.page.getByTestId("topology-realization-authority")).toContainText("non-authoritative");
      await expectStatus(ctx.page, "Topology quotient module");
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("all Complex laboratories and the 3D handoff remain reachable", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1700, 1050));
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByTestId("workspace-nav-complex_analysis").click();

      await clickFirstVisibleButton(ctx.page, "Function Explorer");
      await expectStatus(ctx.page, "Complex Function Explorer");
      await expect(ctx.page.getByText("Function Explorer - general complex functions", { exact: true })).toBeVisible();

      await clickFirstVisibleButton(ctx.page, "Möbius Lab");
      await expectStatus(ctx.page, "Mobius viewer");
      await expect(ctx.page.getByText("Möbius map", { exact: true }).first()).toBeVisible();

      await clickFirstVisibleButton(ctx.page, "Riemann Sphere");
      await expectStatus(ctx.page, "Mobius viewer");
      await expect(ctx.page.getByText("Riemann Sphere / Stereographic Projection Lab", { exact: true })).toBeVisible();

      await clickFirstVisibleButton(ctx.page, "Residue Lab");
      await expectStatus(ctx.page, "Residue Lab");
      await expect(ctx.page.getByText("Residue Lab - contour and singularities", { exact: true })).toBeVisible();

      await clickFirstVisibleButton(ctx.page, "Branch Lab");
      await expectStatus(ctx.page, "Branch Lab");
      await expect(ctx.page.getByText("Branch Lab - branch cuts and monodromy", { exact: true })).toBeVisible();

      await clickFirstVisibleButton(ctx.page, "Covering Lab");
      await expectStatus(ctx.page, "Covering Map Lab");
      await expect(
        ctx.page.getByText("Covering Map Lab - cover space, base space, fibers, deck transformations", { exact: true })
      ).toBeVisible();

      await clickFirstVisibleButton(ctx.page, "Complex map");
      await expectStatus(ctx.page, "Complex viewer");
      await expect(ctx.page.getByTestId("surface-viewer-canvas-host").first()).toBeVisible();
      await expect(ctx.page.getByTestId("error-banner")).toHaveCount(0);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
