import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("module capability discovery follows navigation and opens the verified Surface operation", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setSize(1700, 1000));
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("workspace-nav-surfaces").click();
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    const panel = ctx.page.getByTestId("scientific-capabilities-panel");
    const module = ctx.page.getByTestId("scientific-capabilities-module");
    await expect(panel).toBeVisible();
    await expect(module).toHaveValue("surface");
    await expect(ctx.page.getByTestId("available-operation-surface.curvature.compute")).toBeVisible();
    await expect(ctx.page.getByTestId("unavailable-operation-surface.curvature.analytic-reference"))
      .toBeVisible();
    await expect(ctx.page.getByTestId("workspace-feature-surface.surface-features")).toBeVisible();
    await panel.getByRole("button", { name: /^Create \(/ }).click();
    await expect(ctx.page.getByTestId("workspace-feature-surface.create.explicit")).toBeVisible();
    await expect(ctx.page.getByTestId("workspace-feature-surface.surface-features")).toHaveCount(0);
    await panel.getByRole("button", { name: /^Analyze \(/ }).click();
    await expect(ctx.page.getByTestId("workspace-feature-surface.surface-features")).toBeVisible();
    await panel.getByRole("button", { name: "Open workspace" }).click();
    await expect(panel).toHaveCount(0);
    await expect(ctx.page.getByTestId("surfaces-left-tab-analysis")).toHaveAttribute("aria-pressed", "true");
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    await module.selectOption("graph3d");
    await expect(panel).toContainText("Critical Points");
    await expect(panel).toContainText("No dedicated workspace feature");
    await expect(ctx.page.getByTestId("available-operation-graph3d.gradient.quadratic")).toBeVisible();
    await ctx.page.getByTestId("workspace-nav-mesh").click();
    await expect(module).toHaveValue("mesh");
    await expect(ctx.page.getByTestId("available-operation-mesh.normals.compute")).toBeVisible();
    await ctx.page.getByTestId("workspace-nav-surfaces").click();
    await expect(module).toHaveValue("surface");
    await panel.getByRole("button", { name: "Open computation" }).click();
    await expect(panel).toHaveCount(0);
    await expect(ctx.page.getByTestId("surface-module-actions")).toBeVisible();
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("Quantum capability discovery opens the verified examples entry", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    const panel = ctx.page.getByTestId("scientific-capabilities-panel");
    await ctx.page.getByTestId("scientific-capabilities-module").selectOption("quantum");
    await expect(panel.getByTestId("workspace-feature-quantum.create")).toBeVisible();
    await panel.getByRole("button", { name: "Open verified examples" }).click();
    await expect(ctx.page.getByRole("dialog", { name: "Verified quantum examples" })).toBeVisible();
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("verified Mesh normals route opens Mesh analysis", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("workspace-nav-mesh").click();
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    const operation = ctx.page.getByTestId("available-operation-mesh.normals.compute");
    await expect(operation).toBeVisible();
    await operation.getByRole("button", { name: "Open computation" }).click();
    await expect(ctx.page.getByTestId("scientific-capabilities-panel")).toHaveCount(0);
    await expect(ctx.page.getByTestId("mesh-workspace-left-tab-analyze"))
      .toHaveAttribute("aria-pressed", "true");
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("parametric Surface operation computes in the capabilities panel", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("workspace-nav-surfaces").click();
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    const editor = ctx.page.getByTestId("parametric-curvature-panel");
    await expect(editor).toBeVisible();
    await editor.getByRole("spinbutton", { name: "U samples" }).fill("5");
    await editor.getByRole("spinbutton", { name: "V samples" }).fill("5");
    await editor.getByRole("button", { name: "Compute curvature" }).click();
    await expect(editor.getByRole("status")).toContainText("25 samples", { timeout: 30_000 });
    await expect(editor.getByRole("status")).toContainText("reference passed");
    await expect(editor.getByRole("img", { name: "Gaussian curvature field" })).toBeVisible();
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("generic workflow editor runs a verified Mesh node", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    const editor = ctx.page.getByTestId("scientific-workflow-editor");
    await editor.locator("summary").first().click();
    await editor.getByRole("combobox", { name: "Workflow operation" })
      .selectOption("mesh.normals.compute");
    await editor.getByRole("button", { name: "Add step" }).click();
    await editor.getByRole("textbox", { name: "Step 1 input" }).fill(JSON.stringify({ mesh: {
      positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2],
    } }));
    await editor.getByRole("button", { name: "Run workflow" }).click();
    await expect(editor.getByRole("status")).toContainText("step1 · mesh.normals.compute · completed",
      { timeout: 30_000 });
  } finally {
    await closeSurfaceApp(ctx);
  }
});

test("a module operation opens the workflow editor and computes", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("scientific-capabilities-toggle").click();
    await ctx.page.getByTestId("scientific-capabilities-module").selectOption("number-theory");
    await ctx.page.getByTestId("available-operation-number-theory.modular-inverse.compute")
      .getByRole("button", { name: "Add to workflow" }).click();
    const editor = ctx.page.getByTestId("scientific-workflow-editor");
    await expect(editor).toHaveAttribute("open", "");
    await expect(editor.getByRole("textbox", { name: "Step 1 input" })).toHaveValue(
      /"value": 3/);
    await editor.getByRole("button", { name: "Run workflow" }).click();
    await expect(editor.getByRole("status")).toContainText(
      "step1 · number-theory.modular-inverse.compute · completed", { timeout: 30_000 });
    await editor.getByText("step1 · number-theory.modular-inverse.compute · completed").click();
    await expect(editor).toContainText('"inverse": 4');
  } finally {
    await closeSurfaceApp(ctx);
  }
});
