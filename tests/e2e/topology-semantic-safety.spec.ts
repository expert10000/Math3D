import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe("Topology semantic safety", () => {
  test("labels realization authority and separates formal counts from display geometry", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByTestId("workspace-nav-topology").click();
      await expect(ctx.page.getByRole("heading", { name: "Topology Module" })).toBeVisible();

      await expect(ctx.page.getByTestId("topology-count-source")).toContainText("Source diagram cells");
      await expect(ctx.page.getByTestId("topology-count-refinement")).toContainText("Build refinement cells");
      await expect(ctx.page.getByTestId("topology-count-canonical")).toContainText("Canonical quotient cells");
      await expect(ctx.page.getByTestId("topology-count-display")).toContainText("Display geometry only");
      await expect(ctx.page.getByTestId("topology-source-provenance")).toContainText("Authoritative source: fundamental-diagram");
      await expect(ctx.page.getByTestId("topology-source-provenance")).toContainText("Source revision: fnv1a32:");
      await expect(ctx.page.getByTestId("topology-canonical-provenance")).toContainText("Derived canonical 2-complex: schema v1");
      await expect(ctx.page.getByTestId("topology-canonical-euler")).toContainText("Canonical Euler characteristic");
      await expect(ctx.page.getByTestId("topology-computed-components")).toContainText("Computed connected components");
      await expect(ctx.page.getByTestId("topology-recognized-boundary")).toContainText("Recognized boundary hint");
      await expect(ctx.page.getByTestId("topology-formal-classification")).toContainText("withheld");
      await expect(ctx.page.getByTestId("topology-structural-validation-status")).toContainText("certified-within-model");

      await ctx.page.getByRole("button", { name: "Complex View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-complex-view")).toBeVisible();
      await expect(ctx.page.getByTestId("topology-structural-validation-summary")).toContainText("Canonical finite 2-complex structural validation");
      await expect(ctx.page.getByTestId("topology-complex-vertices")).toContainText("0-cells / vertices");
      await expect(ctx.page.getByTestId("topology-complex-edges")).toContainText("1-cells / oriented edges");
      await expect(ctx.page.getByTestId("topology-complex-faces")).toContainText("2-cells / attachments");
      await ctx.page.getByTestId("topology-complex-faces").locator('[data-testid^="topology-complex-cell-2-"]').first().click();
      await expect(ctx.page.getByTestId("topology-complex-selected-cell")).toContainText("source 2-cell");
      await expect(ctx.page.getByTestId("topology-complex-boundary-dimensions")).toContainText("Expected operator shapes");
      await expect(ctx.page.getByTestId("topology-cellular-boundary-operators")).toContainText("∂₁ : C₁ → C₀");
      await expect(ctx.page.getByTestId("topology-cellular-boundary-operators")).toContainText("∂₂ : C₂ → C₁");
      await expect(ctx.page.getByTestId("topology-chain-condition")).toContainText("∂₁∂₂ = 0: PASS");

      await ctx.page.getByTestId("topology-preset-card-projective_plane").click();
      await ctx.page.getByRole("button", { name: "Realization View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-realization-authority")).toHaveAttribute("data-realization-kind", "immersed");
      await expect(ctx.page.getByTestId("topology-realization-authority")).toContainText("non-authoritative");
      await expect(ctx.page.getByTestId("topology-active-realization-kind")).toContainText("Immersed R³ model");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
