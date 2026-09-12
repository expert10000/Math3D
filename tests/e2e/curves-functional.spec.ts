import { expect, test } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

test.describe("Curves canonical workspace", () => {
  test("publishes revisioned Curve provenance and persists lightweight definitions", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const curvesTab = ctx.page.getByRole("button", { name: "Curves", exact: true }).first();
      await curvesTab.click();
      await expect(curvesTab).toHaveAttribute("aria-pressed", "true");

      const professionalShell = ctx.page.getByTestId("curves-professional-shell");
      await expect(professionalShell).toBeVisible();
      await expect(professionalShell).toContainText("Panel");
      await expect(professionalShell).toContainText("Actions");
      await expect(professionalShell).toContainText("Tools");
      await ctx.page.getByTestId("curve-panel-analysis").click();
      await expect(ctx.page.getByTestId("curve-workspace-analysis")).toBeVisible();
      await expect(ctx.page.getByTestId("curve-inspector")).toBeVisible();
      await ctx.page.getByTestId("curve-inspector-tab-sampling").click();
      await expect(ctx.page.getByTestId("curve-inspector-content-sampling")).toContainText("arc-length entries");
      await expect(ctx.page.getByTestId("curve-viewport-display-controls")).toContainText("Control polygon");
      await expect(ctx.page.getByTestId("app-status-bar")).toContainText("Curve circle2d");
      await expect(ctx.page.getByTestId("curve-differential-summary")).toContainText("Differential field:");
      await expect(ctx.page.getByTestId("curve-differential-summary")).toContainText("turning number:");
      await expect(ctx.page.getByTestId("curve-frame-kind")).toContainText("frenet");
      await expect(ctx.page.getByTestId("curve-scalar-plots")).toBeVisible();
      await expect(ctx.page.getByTestId("curve-plot-speed")).toContainText("Speed");
      await expect(ctx.page.getByTestId("curve-plot-sampling-error")).toContainText("Sampling error");
      await ctx.page.getByTestId("curve-plot-speed").locator("svg").click({ position: { x: 180, y: 35 } });
      await expect(ctx.page.getByTestId("curve-inspector-content-probe")).toBeVisible();
      await expect(ctx.page.getByTestId("curve-probe-source")).toContainText("plot");
      await ctx.page.getByTestId("curve-arc-length-slider").fill("0.72");
      await expect(ctx.page.getByTestId("curve-probe-source")).toContainText("arc-length-slider");
      await ctx.page.getByTestId("curve-pin-probe").click();
      await ctx.page.getByTestId("curve-arc-length-slider").fill("0.28");
      await ctx.page.getByTestId("curve-pin-probe").click();
      await ctx.page.getByTestId("curve-add-probe-annotations").click();
      await expect(ctx.page.getByTestId("curve-pinned-probes")).toContainText("Pinned probes (3)");
      await expect(ctx.page.getByTestId("curve-probe-comparison")).toContainText("Compare latest");
      await expect(ctx.page.getByTestId("curve-probe-annotation-count")).toContainText("Annotations: 9");
      const osculatingToggle = ctx.page.getByTestId("curve-viewport-display-controls").getByLabel("Osculating", { exact: true });
      await osculatingToggle.check();
      await expect(osculatingToggle).toBeChecked();

      const contract = ctx.page.getByTestId("curve-canonical-contract");
      await contract.scrollIntoViewIfNeeded();
      await expect(contract).toBeVisible();
      await expect(contract).toContainText("Canonical Curve contract");
      await expect(contract).toContainText("ID: circle2d · revision 1");
      await expect(contract).toContainText("parametric · 2D · source curves");
      await expect(contract).toContainText("Result: ready");

      const robustSampling = ctx.page.getByTestId("curve-robust-sampling-summary");
      await expect(robustSampling).toContainText("sampled length:");
      await expect(robustSampling).toContainText("t↔s table:");
      await expect(ctx.page.getByTestId("curve-probe-arc-coordinate")).toContainText("s/L =");

      const sampleCount = ctx.page.getByTestId("curve-sample-count");
      const strictCount = Number((await sampleCount.textContent())?.match(/\d+/)?.[0]);
      await ctx.page.getByTestId("curve-adaptive-tolerance").fill("0.1");
      await expect.poll(async () => Number((await sampleCount.textContent())?.match(/\d+/)?.[0])).toBeLessThan(strictCount);

      await ctx.page.getByTestId("curve-panel-gallery").click();
      const custom = ctx.page.getByRole("button", { name: /Custom x\(t\), y\(t\)/ }).first();
      await custom.click();
      await expect(contract).toContainText("ID: custom2d · revision 1");
      await ctx.page.getByRole("textbox", { name: "x(t)", exact: true }).fill("2*cos(t)");
      await expect(contract).toContainText("ID: custom2d · revision 2");

      await expect.poll(async () => ctx?.page.evaluate(() => {
        const serialized = localStorage.getItem("math3d.curveAnalysis.workspace.v1");
        if (!serialized) return null;
        const document = JSON.parse(serialized) as {
          version?: number;
          definitions?: Array<{ identity?: { curveId?: string; curveRevision?: number }; fingerprint?: string }>;
          savedProbes?: unknown[];
          annotations?: unknown[];
        };
        const latest = document.definitions?.filter((entry) => entry.identity?.curveId === "custom2d").at(-1);
        return {
          version: document.version,
          curveId: latest?.identity?.curveId,
          revision: latest?.identity?.curveRevision,
          hasFingerprint: Boolean(latest?.fingerprint),
          savedProbes: document.savedProbes?.length,
          annotations: document.annotations?.length,
          containsTypedArrays: serialized.includes("Float64Array"),
        };
      })).toEqual({ version: 1, curveId: "custom2d", revision: 2, hasFingerprint: true, savedProbes: 3, annotations: 9, containsTypedArrays: false });
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
