import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test.describe("Topology semantic safety", () => {
  test("analyzes read-only Mesh and scoped Geometry handoffs with visible fidelity", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      await ctx.page.getByTestId("workspace-nav-mesh").click();
      await expect(ctx.page.getByTestId("workspace-nav-mesh")).toHaveAttribute("aria-pressed", "true");
      await ctx.page.getByTestId("workspace-nav-topology").click();
      const panel = ctx.page.getByTestId("topology-interoperability-panel");
      await expect(panel).toBeVisible();
      await panel.getByTestId("topology-analyze-current-mesh").click();
      await expect(panel.getByTestId("topology-adapter-result")).toContainText(/Mesh · (ACCEPTED|UNSUPPORTED) · read-only/);
      await expect(panel.getByTestId("topology-adapter-result")).toContainText("exact-incidence");
      const meshLocate = panel.getByTestId("topology-locate-source-face");
      if (await meshLocate.count()) {
        await meshLocate.click();
        await expect(ctx.page.getByTestId("workspace-nav-mesh")).toHaveAttribute("aria-pressed", "true");
      }

      await ctx.page.getByTestId("workspace-nav-geometry").click();
      await expect(ctx.page.getByTestId("workspace-nav-geometry")).toHaveAttribute("aria-pressed", "true");
      await ctx.page.getByTestId("workspace-nav-topology").click();
      await expect(panel.getByTestId("topology-analyze-current-geometry")).toBeEnabled();
      await panel.getByTestId("topology-analyze-current-geometry").click();
      await expect(panel.getByTestId("topology-adapter-result")).toContainText(/Geometry · (ACCEPTED|UNSUPPORTED) · read-only/);
      await expect(panel.getByTestId("topology-adapter-result")).toContainText("selected Geometry display tessellation");
      await expect(panel.getByTestId("topology-adapter-result")).toContainText("tessellated-approximation");
      const geometryLocate = panel.getByTestId("topology-locate-source-face");
      if (await geometryLocate.count()) {
        await geometryLocate.click();
        await expect(ctx.page.getByTestId("workspace-nav-geometry")).toHaveAttribute("aria-pressed", "true");
      }
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

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
      await expect(ctx.page.getByTestId("topology-homology-status")).toContainText("exact");

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
      await expect(ctx.page.getByTestId("topology-homology-preview")).toContainText("Exact homology preview");
      await expect(ctx.page.getByTestId("topology-homology-z-h1")).toContainText("H1 ≅");
      await expect(ctx.page.getByTestId("topology-homology-z2-h1")).toContainText("dimension");
      await ctx.page.getByRole("button", { name: "Algebra View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-algebra-view")).toBeVisible();
      await expect(ctx.page.getByTestId("topology-algebra-provenance")).toContainText("Source structural hash:");
      await expect(ctx.page.getByTestId("topology-algebra-provenance")).toContainText("Canonical complex hash:");
      await expect(ctx.page.getByTestId("topology-algebra-provenance")).toContainText("Matrix artifact:");
      await expect(ctx.page.getByTestId("topology-algebra-provenance")).toContainText("never from the displayed R³ realization");
      await expect(ctx.page.getByTestId("topology-integer-homology-status")).toContainText("NOT RUN");
      await expect(ctx.page.getByTestId("topology-run-integer-homology")).toBeEnabled();
      await expect(ctx.page.getByTestId("topology-local-z2-feedback")).toContainText("Local finite-field feedback");
      await expect(ctx.page.getByTestId("topology-local-z2-status")).toContainText("EXACT · coefficients Z/2Z");
      await expect(ctx.page.getByTestId("topology-local-z2-feedback")).toContainText("does not compute integral homology or torsion");
      await expect(ctx.page.getByTestId("topology-algebra-matrices")).toContainText("∂₁ : C₁ → C₀ over Z");
      await ctx.page.locator('[data-testid^="topology-algebra-matrix-boundary1-"]').first().click();
      await expect(ctx.page.getByTestId("topology-algebra-matrix-evidence")).toContainText("Atomic incidence contributions:");
      await expect(ctx.page.getByTestId("topology-algebra-matrix-evidence")).toContainText("Locate source");
      await expect(ctx.page.getByTestId("topology-algebra-groups")).toContainText("Homology over Z/2Z");
      await expect(ctx.page.getByTestId("topology-algebra-snf")).toContainText("SNF diagonals");
      await expect(ctx.page.getByTestId("topology-algebra-euler-check")).toContainText("Euler–homology consistency: PASS");
      await expect(ctx.page.getByTestId("topology-fundamental-group")).toContainText("Fundamental group π₁ presentation");
      await expect(ctx.page.getByTestId("topology-pi1-abelianization-check")).toContainText("PASS");

      await ctx.page.getByRole("button", { name: "Compare View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-comparison-outcome")).toContainText("DISTINGUISHED");
      await expect(ctx.page.getByTestId("topology-comparison-report")).toContainText("Matching computed invariants do not prove equivalence");
      await ctx.page.getByLabel("Source A").selectOption("torus_square");
      await ctx.page.getByLabel("Source B").selectOption("torus_square");
      await expect(ctx.page.getByTestId("topology-comparison-outcome")).toContainText("INCONCLUSIVE");
      await expect(ctx.page.getByTestId("topology-comparison-outcome")).toContainText("equivalence remains unproved");

      await ctx.page.getByTestId("topology-preset-card-projective_plane").click();
      await ctx.page.getByRole("button", { name: "Complex View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-homology-z-h1")).toContainText("Z/2Z");
      await ctx.page.getByRole("button", { name: "Algebra View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-local-z2-betti")).toContainText("1, 1, 1");
      await expect(ctx.page.getByTestId("topology-surface-classification")).toContainText("ELIGIBLE");
      await expect(ctx.page.getByTestId("topology-surface-classification-label")).toContainText("Projective plane");
      await expect(ctx.page.getByTestId("topology-surface-check-connected")).toContainText("PASS");
      await expect(ctx.page.getByTestId("topology-surface-check-edge-links")).toContainText("PASS");
      await expect(ctx.page.getByTestId("topology-surface-check-vertex-links")).toContainText("PASS");
      await expect(ctx.page.getByTestId("topology-surface-check-boundary-circles")).toContainText("PASS");
      await expect(ctx.page.getByTestId("topology-surface-check-euler-characteristic")).toContainText("PASS");
      await expect(ctx.page.getByTestId("topology-surface-classification-provenance")).toContainText("finite-surface-classification@2");
      await expect(ctx.page.getByTestId("topology-surface-classification-provenance")).toContainText("source r");
      await expect(ctx.page.getByTestId("topology-certified-orientability")).toContainText("No");
      await ctx.page.getByRole("button", { name: "Realization View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-realization-authority")).toHaveAttribute("data-realization-kind", "immersed");
      await expect(ctx.page.getByTestId("topology-realization-authority")).toContainText("non-authoritative");
      await expect(ctx.page.getByTestId("topology-active-realization-kind")).toContainText("Immersed R³ model");

      await ctx.page.getByTestId("topology-preset-card-mobius_from_rectangle").click();
      await ctx.page.getByRole("button", { name: "Realization View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-story-formal-certificate")).toContainText("Möbius band");
      await expect(ctx.page.getByTestId("topology-story-formal-certificate")).toContainText("not from this R³ rendering or preset name");

      await ctx.page.getByTestId("topology-preset-card-dunce_cap").click();
      await ctx.page.getByRole("button", { name: "Algebra View", exact: true }).click();
      await expect(ctx.page.getByTestId("topology-surface-classification")).toContainText("WITHHELD");
      await expect(ctx.page.getByTestId("topology-surface-classification-label")).toContainText("No formal surface name");
      await expect(ctx.page.getByTestId("topology-surface-check-edge-links")).toContainText("WITHHELD");
      await expect(ctx.page.getByTestId("topology-surface-check-euler-characteristic")).toContainText("WITHHELD");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
