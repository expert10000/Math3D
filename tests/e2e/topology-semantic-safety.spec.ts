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
      await expect(ctx.page.getByTestId("topology-canonical-euler")).toContainText("Canonical Euler characteristic");
      await expect(ctx.page.getByTestId("topology-computed-components")).toContainText("Computed connected components");
      await expect(ctx.page.getByTestId("topology-recognized-boundary")).toContainText("Recognized boundary hint");
      await expect(ctx.page.getByTestId("topology-formal-classification")).toContainText("withheld");

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
