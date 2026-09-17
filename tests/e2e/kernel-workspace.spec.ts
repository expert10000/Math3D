import { expect, test } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("GK16/GK17 shared provenance and mixed workspace replay are visible in the app", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("workspace-nav-volume").click();
    await ctx.page.getByTestId("kernel-workspace-toggle").click();
    const panel = ctx.page.getByTestId("kernel-workspace-panel");
    await expect(panel.getByTestId("kernel-platform-capabilities")).toContainText("Platform: desktop");
    await expect(panel.getByTestId("kernel-active-evidence")).toContainText("volume · current");
    await panel.getByTestId("kernel-workspace-save").click();
    await expect(panel.getByTestId("kernel-workspace-message")).toContainText("Saved");
    const saved = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1") ?? "{}"));
    expect(saved.format).toBe("math3d.mixed-workspace");
    expect(saved.entries.map((entry: { module: string }) => entry.module)).toEqual(expect.arrayContaining(["geometry", "surface", "curve", "volume", "complex"]));
    expect(JSON.stringify(saved)).not.toContain('"scalars"');
    await ctx.page.reload();
    await expect(ctx.page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await ctx.page.getByTestId("kernel-workspace-toggle").click();
    await panel.getByTestId("kernel-workspace-reopen").click();
    await expect(panel.getByTestId("kernel-workspace-message")).toContainText("Reopened and replay-verified");
    await expect(panel.getByTestId("kernel-workspace-entry-volume")).toBeVisible();
    await ctx.page.getByTestId("workspace-nav-topology").click();
    await expect(panel.getByTestId("kernel-active-evidence")).toContainText("topology · current");
    await panel.getByTestId("kernel-workspace-save").click();
    const withTopology = await ctx.page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1") ?? "{}"));
    expect(withTopology.entries.some((entry: { module: string }) => entry.module === "topology")).toBe(true);
  } finally { if (ctx) await closeSurfaceApp(ctx); }
});

test("GK16 lineage navigates from an extracted result to its Volume source", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("workspace-nav-volume").click();
    await ctx.page.getByTestId("volume-detailed-controls").getByTestId("volume-apply-isosurface").click();
    await ctx.page.getByTestId("kernel-workspace-toggle").click();
    const panel = ctx.page.getByTestId("kernel-workspace-panel");
    await panel.getByTestId("kernel-workspace-save").click();
    await expect(panel.getByTestId("kernel-workspace-message")).toContainText("Saved");
    await expect(panel.getByTestId("kernel-workspace-lineage").first()).toContainText("volume.extract.isosurface");
    await panel.getByTestId("kernel-workspace-lineage").first().getByRole("button", { name: "Go to volume source" }).click();
    await expect(ctx.page.getByTestId("workspace-nav-volume")).toHaveAttribute("aria-pressed", "true");
    await ctx.page.reload();
    await expect(ctx.page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await ctx.page.getByTestId("kernel-workspace-toggle").click();
    await panel.getByTestId("kernel-workspace-reopen").click();
    await expect(panel.getByTestId("kernel-workspace-reopened")).toContainText(/[1-9]\d* missing artifacts/);
  } finally { if (ctx) await closeSurfaceApp(ctx); }
});
