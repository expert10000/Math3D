import { expect, test, type ElementHandle } from "@playwright/test";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls, projectFreezeFixture } from "./helpers/projectFreeze";

async function expectReleased(canvas: ElementHandle<HTMLElement | SVGElement>) {
  await expect.poll(() => canvas.evaluate(element => ({
    connected: element.isConnected,
    contextLost: (element as HTMLCanvasElement).getContext("webgl2")?.isContextLost() ?? false,
  }))).toEqual({ connected: false, contextLost: true });
}

test("PC10 releases the verified Geometry overlay viewer without changing its sources", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-coordinate-overlay-study").click();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace);
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Verified A/B overlay" });
    await expect(view.getByText("Source-declared coordinate frames, axes, handedness, and units match this overlay.")).toBeVisible();
    const canvas = await view.getByRole("region", { name: /Overlay/ }).locator("canvas").first().elementHandle();
    if (!canvas) throw new Error("Verified overlay did not create a canvas.");
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toHaveCount(0);
    await expectReleased(canvas);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace)).toEqual(before);
  } finally { await closeSurfaceApp(ctx); }
});

test("PC10 releases both retained/current Surface viewers and preserves their revisions", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-template-open-surface-generation-study").click();
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace);
    await panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByLabel("Saved composition").selectOption({ label: "Before / after · linked u,v" });
    const a = view.getByRole("region", { name: /A: Bowl → saddle/ });
    const b = view.getByRole("region", { name: /B: Bowl → saddle/ });
    await expect(a).toContainText("retained checkpoint r1");
    await expect(b).toContainText("current r2");
    const canvases = await Promise.all([a, b].map(pane => pane.locator("canvas").first().elementHandle()));
    if (canvases.some(canvas => !canvas)) throw new Error("Both Surface comparison canvases are required.");
    const bounds = await a.locator("canvas").first().boundingBox();
    if (!bounds) throw new Error("Retained Surface canvas has no viewport bounds.");
    await page.mouse.click(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.55);
    await expect(view.getByText(/Selected u=/)).toBeVisible();
    await expect(view.locator("footer")).toContainText("r1");
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toHaveCount(0);
    for (const canvas of canvases) await expectReleased(canvas!);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!).workspace)).toEqual(before);
  } finally { await closeSurfaceApp(ctx); }
});

test("PC10 releases Mesh and Geometry side-by-side viewers while retaining checked resources", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const fixture = projectFreezeFixture();
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, controls = freezeControls(page);
    await controls.importOpen(fixture.raw);
    const before = await controls.save();
    await controls.panel.getByTestId("project-open-composition").click();
    const view = page.getByTestId("project-composition-view");
    await view.getByTestId("project-composition-source-0").selectOption(fixture.targets.mesh);
    await view.getByTestId("project-composition-source-1").selectOption(fixture.targets.geometry);
    const a = view.getByRole("region", { name: /A:/ }), b = view.getByRole("region", { name: /B:/ });
    const canvases = await Promise.all([a, b].map(pane => pane.locator("canvas").first().elementHandle()));
    if (canvases.some(canvas => !canvas)) throw new Error("Mesh and Geometry canvases are required.");
    await expect(view.getByRole("alert")).toHaveCount(0);
    await view.getByRole("button", { name: "Close" }).click();
    await expect(view).toHaveCount(0);
    for (const canvas of canvases) await expectReleased(canvas!);
    expect((await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!))).workspace).toEqual(before.workspace);
  } finally { await closeSurfaceApp(ctx); }
});
