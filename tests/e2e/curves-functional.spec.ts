import { expect, test } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

test.describe("Curves canonical workspace", () => {
  test("orchestrates revision-safe scientific result cards and layered presets", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByRole("button", { name: "Curves", exact: true }).first().click();
      await ctx.page.getByTestId("curve-panel-analysis").click();
      const lifecycle = ctx.page.getByTestId("curve-result-lifecycle");
      await expect(lifecycle).toBeVisible();
      await expect(lifecycle).toContainText("Analysis-layer presets");
      await ctx.page.getByTestId("curve-analysis-preset").selectOption("curvature-lab");
      await ctx.page.getByTestId("curve-apply-analysis-preset").click();
      await expect(ctx.page.getByTestId("curve-active-analysis-preset")).toContainText("Curvature lab · current · Curve r1");
      const cards = ctx.page.getByTestId("curve-result-cards").locator("article");
      await expect(cards).toHaveCount(3);
      await expect(cards.first()).toContainText("Math3D Curve Core");
      await expect(cards.first()).toContainText("Uncertainty:");
      await cards.first().getByRole("button", { name: "Hide" }).click();
      await expect(cards.first().getByRole("button", { name: "Show" })).toBeVisible();
      await cards.first().getByRole("button", { name: "Select" }).click();
      await cards.first().getByRole("button", { name: "Pin" }).click();
      await cards.first().getByRole("button", { name: "Save" }).click();
      await cards.nth(0).getByRole("button", { name: "Compare" }).click();
      await cards.nth(1).getByRole("button", { name: "Compare" }).click();
      await expect(ctx.page.getByTestId("curve-result-comparison")).toContainText("Common domain");
      await expect.poll(async () => ctx?.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.curveAnalysis.workspace.v1") ?? "{}").savedResults?.some((entry: { variant?: string }) => entry.variant?.startsWith("preset:")))).toBe(true);

      await ctx.page.getByTestId("curve-panel-gallery").click();
      await ctx.page.getByRole("button", { name: /Custom x\(t\), y\(t\)/ }).first().click();
      await ctx.page.getByRole("textbox", { name: "x(t)", exact: true }).fill("2*cos(t)");
      await ctx.page.getByTestId("curve-panel-analysis").click();
      await expect(ctx.page.getByTestId("curve-active-analysis-preset")).toContainText("stale");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("runs curve work in a revision-guarded Worker and reuses the dependency cache", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByRole("button", { name: "Curves", exact: true }).first().click();
      await ctx.page.getByTestId("curve-inspector-tab-sampling").click();
      const panel = ctx.page.getByTestId("curve-worker-panel");
      await expect(panel).toBeVisible();
      await ctx.page.getByTestId("curve-worker-operation").selectOption("sampling");
      await ctx.page.getByTestId("curve-worker-workload").selectOption("1k");
      await ctx.page.getByTestId("curve-worker-run").click();
      await expect(ctx.page.getByTestId("curve-worker-lifecycle")).toContainText("ready", { timeout: 15_000 });
      await expect(ctx.page.getByTestId("curve-worker-lifecycle")).toContainText("Progressive result: coarse-preview");
      await expect(ctx.page.getByTestId("curve-worker-lifecycle")).toContainText(/3,?000 values/);
      await expect(ctx.page.getByTestId("curve-worker-cache")).toContainText("Cache: 1 artifacts");
      await ctx.page.getByTestId("curve-worker-run").click();
      await expect(ctx.page.getByTestId("curve-worker-lifecycle")).toContainText("cached");
      await expect(ctx.page.getByTestId("curve-worker-cache")).toContainText("render 4096 · plots 2048 · glyphs 512");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("inspects optional VTK and CGAL capabilities with deterministic native fallback", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByRole("button", { name: "Curves", exact: true }).first().click();
      await ctx.page.getByTestId("curve-inspector-tab-backend").click();
      const panel = ctx.page.getByTestId("curve-backend-panel");
      await expect(panel).toBeVisible();
      await expect(ctx.page.getByTestId("curve-backend-availability")).toContainText("math3d-native · available · curve-core-v1");
      await expect(ctx.page.getByTestId("curve-backend-availability")).toContainText("vtk · optional / unavailable · not-installed");
      await expect(ctx.page.getByTestId("curve-backend-availability")).toContainText("cgal · optional / unavailable · not-installed");
      await expect(ctx.page.getByTestId("curve-backend-authority")).toContainText("Math3D Curve Core authoritative");
      await ctx.page.getByTestId("curve-backend-vtk-compare").click();
      await expect(ctx.page.getByTestId("curve-backend-execution")).toContainText("fallback · math3d-native curve-core-v1");
      await expect(ctx.page.getByTestId("curve-backend-execution")).toContainText("mapping complete");
      await ctx.page.getByTestId("curve-backend-cgal-compare").click();
      await expect(ctx.page.getByTestId("curve-backend-execution")).toContainText("polyline-simplify");
      await expect(ctx.page.getByTestId("curve-backend-execution")).toContainText("Used deterministic Math3D native fallback");
      await expect(panel).toContainText("Advanced engine parameters remain in Services or Mesh Analysis");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("creates provenance-linked CurveMesh variants and round-trips Mesh boundaries into Curves", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      const curvesTab = ctx.page.getByRole("button", { name: "Curves", exact: true }).first();
      await curvesTab.click();
      await ctx.page.getByTestId("curve-panel-curvemesh").click();

      const workflow = ctx.page.getByTestId("curve-mesh-workflow");
      await expect(workflow).toBeVisible();
      await ctx.page.getByTestId("curve-mesh-output").selectOption("tube");
      await workflow.getByLabel("Seam policy").selectOption("duplicate");
      await workflow.getByLabel("Longitudinal resolution").fill("24");
      await workflow.getByLabel("Radial resolution").fill("8");
      await ctx.page.getByTestId("curve-mesh-generate").click();
      await expect(ctx.page.getByTestId("curve-mesh-result")).toContainText("tube · live-current · mesh r1");
      await expect(ctx.page.getByTestId("curve-mesh-result")).toContainText("map complete");
      await expect(ctx.page.getByTestId("curve-mesh-map")).toContainText("complete");

      await workflow.getByLabel("Tube radius").fill("0.12");
      await expect(ctx.page.getByTestId("curve-mesh-result")).toContainText("stale");
      await workflow.getByRole("button", { name: "Regenerate" }).click();
      await expect(ctx.page.getByTestId("curve-mesh-result")).toContainText("live-current · mesh r2");
      await ctx.page.getByTestId("curve-mesh-analysis").click();
      await expect(ctx.page.getByRole("button", { name: "Mesh", exact: true }).first()).toHaveAttribute("aria-pressed", "true");

      await curvesTab.click();
      await ctx.page.getByTestId("curve-panel-curvemesh").click();
      await ctx.page.getByTestId("mesh-curve-extraction-kind").selectOption("boundary-loops");
      await ctx.page.getByTestId("mesh-curve-extract").click();
      await expect(ctx.page.getByTestId("mesh-curve-extracted")).toContainText("polyline approximation");
      await ctx.page.getByTestId("mesh-curve-fit").click();
      await expect(ctx.page.getByTestId("curve-mesh-status")).toContainText("Spline fit");
      await ctx.page.getByTestId("mesh-curve-extracted").getByRole("button", { name: "Open in Curves" }).click();
      await expect(ctx.page.getByTestId("curve-canonical-contract")).toContainText("source mesh");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("round-trips Geometry and Surface curves with visible fidelity, chart mapping, and stale guards", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByRole("button", { name: "Curves", exact: true }).first().click();
      await ctx.page.getByTestId("curve-panel-definition").click();

      const interop = ctx.page.getByTestId("curve-interoperability");
      await expect(interop).toBeVisible();
      await ctx.page.getByTestId("curve-interop-source-kind").selectOption({ label: "Geometry analytic curve" });
      await ctx.page.getByTestId("curve-interop-open").click();
      await expect(ctx.page.getByTestId("curve-interop-exchange")).toContainText("exact · current");
      await expect(ctx.page.getByTestId("curve-interop-exchange")).toContainText("Evaluator preserved");
      await expect(ctx.page.getByTestId("curve-interop-selection")).toContainText("source parameter");
      await ctx.page.getByTestId("curve-to-surface-kind").selectOption("revolution");
      await ctx.page.getByTestId("curve-to-surface-request").click();
      await expect(ctx.page.getByTestId("curve-interop-status")).toContainText("Surface request ready: revolution");

      await ctx.page.getByTestId("curve-interop-source-kind").selectOption({ label: "Surface geodesic" });
      await ctx.page.getByTestId("curve-interop-open").click();
      await expect(ctx.page.getByTestId("curve-interop-exchange")).toContainText("polyline-approximation · current");
      await expect(ctx.page.getByTestId("curve-interop-exchange")).toContainText("surface-chart");
      await expect(ctx.page.getByTestId("curve-interop-selection")).toContainText("chart");
      await ctx.page.getByTestId("curve-to-surface-kind").selectOption("tube-surface");
      await ctx.page.getByTestId("curve-to-surface-request").click();
      await expect(ctx.page.getByTestId("curve-interop-status")).toContainText("1 warning");
      await ctx.page.getByTestId("curve-interop-stale").click();
      await expect(ctx.page.getByTestId("curve-interop-exchange")).toContainText("stale");
      await ctx.page.getByTestId("curve-to-surface-request").click();
      await expect(ctx.page.getByTestId("curve-interop-status")).toContainText("Stale Curve inputs");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("edits Bezier controls and NURBS weights with revisioned undo and construction evidence", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByRole("button", { name: "Curves", exact: true }).first().click();
      await ctx.page.getByRole("button", { name: /Bezier cubic/ }).first().click();
      await ctx.page.getByTestId("curve-panel-definition").click();

      const editor = ctx.page.getByTestId("curve-spline-editor");
      await expect(editor).toBeVisible();
      await expect(ctx.page.getByTestId("curve-spline-contract")).toContainText("bezier · degree 3");
      await expect(ctx.page.getByTestId("curve-spline-evidence")).toContainText("De Casteljau evidence");
      await ctx.page.getByTestId("curve-control-1").click();
      await editor.getByLabel("Control y").fill("2.5");
      await ctx.page.getByTestId("curve-spline-apply-control").click();
      await expect(ctx.page.getByTestId("curve-spline-contract")).toContainText("revision 2");
      await ctx.page.getByTestId("curve-spline-undo").click();
      await expect(ctx.page.getByTestId("curve-spline-contract")).toContainText("revision 1");
      await ctx.page.getByTestId("curve-spline-redo").click();
      await expect(ctx.page.getByTestId("curve-spline-contract")).toContainText("revision 2");
      await ctx.page.getByTestId("curve-viewport-display-controls").getByLabel("Control polygon", { exact: true }).check();

      await ctx.page.getByTestId("curve-panel-gallery").click();
      await ctx.page.getByRole("button", { name: /NURBS quarter arc/ }).first().click();
      await ctx.page.getByTestId("curve-panel-definition").click();
      await expect(ctx.page.getByTestId("curve-spline-contract")).toContainText("nurbs · degree 2");
      await ctx.page.getByTestId("curve-spline-selection-mode").selectOption("weight");
      await ctx.page.getByTestId("curve-control-1").click();
      await ctx.page.getByTestId("curve-spline-weight").fill("0.9");
      await ctx.page.getByTestId("curve-spline-apply-weight").click();
      await expect(ctx.page.getByTestId("curve-spline-contract")).toContainText("revision 2");
      await expect(ctx.page.getByTestId("curve-spline-evidence")).toContainText("De Boor evidence");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("previews and commits dependency-aware derived curve branches", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByRole("button", { name: "Curves", exact: true }).first().click();
      await ctx.page.getByTestId("curve-panel-derived").click();

      const workflow = ctx.page.getByTestId("curve-derived-workflow");
      await expect(workflow).toBeVisible();
      await expect(ctx.page.getByTestId("curve-derived-source")).toContainText("circle2d");
      await ctx.page.getByTestId("curve-derived-preview").click();
      await expect(ctx.page.getByTestId("curve-derived-preview-result")).toContainText("ready · 1 branch");
      await expect(ctx.page.getByTestId("curve-derived-preview-result")).toContainText("Correspondence:");
      await ctx.page.getByTestId("curve-derived-commit").click();
      await expect(ctx.page.getByTestId("curve-derived-records")).toContainText("Committed dependencies (1)");
      await expect(ctx.page.getByTestId("curve-derived-records")).toContainText("circle2d@1");

      await ctx.page.getByTestId("curve-derived-operation").selectOption("split");
      await ctx.page.getByTestId("curve-derived-preview").click();
      await expect(ctx.page.getByTestId("curve-derived-preview-result")).toContainText("ready · 2 branches");
      await ctx.page.getByRole("button", { name: "Branch 2" }).click();

      await ctx.page.getByTestId("curve-derived-operation").selectOption("projection-surface");
      await ctx.page.getByTestId("curve-derived-preview").click();
      await expect(ctx.page.getByTestId("curve-derived-preview-result")).toContainText("capability-required");
      await expect(ctx.page.getByTestId("curve-derived-preview-result")).toContainText("backend-unavailable");
      await expect(ctx.page.getByTestId("curve-derived-commit")).toBeDisabled();
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

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
      await ctx.page.getByTestId("curve-inspector-tab-diagnostics").click();
      await expect(ctx.page.getByTestId("curve-diagnostic-status")).toContainText("OK");
      await expect(ctx.page.getByTestId("curve-diagnostic-summaries")).toContainText("geometry 1");
      await ctx.page.getByTestId("curve-diagnostic-save").click();
      await ctx.page.getByTestId("curve-diagnostic-recompute").click();
      await ctx.page.getByTestId("curve-diagnostic-save").click();
      await expect(ctx.page.getByTestId("curve-diagnostic-comparison")).toContainText("unchanged");
      await ctx.page.getByTestId("curve-diagnostic-list").getByRole("button").first().click();
      await expect(ctx.page.getByTestId("curve-probe-source")).toContainText("diagnostic");
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
          savedResults?: Array<{ kind?: string }>;
        };
        const latest = document.definitions?.filter((entry) => entry.identity?.curveId === "custom2d").at(-1);
        return {
          version: document.version,
          curveId: latest?.identity?.curveId,
          revision: latest?.identity?.curveRevision,
          hasFingerprint: Boolean(latest?.fingerprint),
          savedProbes: document.savedProbes?.length,
          annotations: document.annotations?.length,
          diagnosticSnapshots: document.savedResults?.filter((entry) => entry.kind === "curve-diagnostics").length,
          containsTypedArrays: serialized.includes("Float64Array"),
        };
      })).toEqual({ version: 1, curveId: "custom2d", revision: 2, hasFingerprint: true, savedProbes: 3, annotations: 9, diagnosticSnapshots: 2, containsTypedArrays: false });
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
