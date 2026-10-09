import { expect, test } from "@playwright/test";
import { openLastSavedProject, closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, resizeSurfaceAppWindow, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("Catenoid's saved Mesh opens in the normal Mesh workspace", async () => {
  test.setTimeout(90_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    const page = ctx.page;
    // Simulate a user whose normal Surface workspace last used the busy
    // analysis preset. Opening a saved Mesh must still start with a clear view.
    await page.evaluate(() => localStorage.setItem("math3d.ui.viewportPreset.v1", "analysis"));
    await page.reload();
    await page.getByTestId("projects-toggle").click();
    await page.getByTestId("project-template-open-catenoid-evidence").click();
    const project = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const mesh = project.workspace.entries.find((entry: any) => entry.module === "mesh");
    await page.getByTestId("project-viewer-document").selectOption(mesh.expected.id);
    const editor = page.getByTestId("project-source-editor");
    await expect(editor).toHaveAttribute("data-document-id", mesh.expected.id);
    await expect(page.getByTestId("module-workspace")).toBeVisible();
    await expect(page.getByTestId("surface-primary-viewer")).toHaveAttribute("data-document-id", mesh.expected.id);
    await expect(page.getByTestId("surface-primary-viewer").getByTestId("surface-viewer-canvas-host").locator("canvas")).toBeVisible();
    await expect(page.getByTestId("surface-left-panel")).toBeVisible();
    await expect(page.getByTestId("surface-right-panel")).toBeVisible();
    await expect(page.getByTestId("surface-viewport-panel-hide")).toHaveCount(0);
    await expect(page.getByText("Whole mesh selected", { exact: true })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("catenoid-mesh-native.png") });
    await page.getByTestId("mesh-viewer-controls-show").click();
    const controls = page.getByTestId("mesh-viewer-controls-strip");
    await expect(controls.getByRole("checkbox", { name: "Bounding box" })).not.toBeChecked();
    await expect(controls.getByRole("checkbox", { name: "Coordinates" })).not.toBeChecked();
    await expect(controls.getByRole("checkbox", { name: "Wireframe" })).not.toBeChecked();
    await expect(controls.getByTestId("surface-viewport-panel-toggle")).not.toBeChecked();
    await expect(controls.getByTestId("mesh-display-command-preview-overlays-toggle")).not.toBeChecked();
    await controls.getByRole("checkbox", { name: "Bounding box" }).check();
    await editor.getByTestId("project-source-back-to-surface").click();
    await page.getByTestId("project-viewer-document").selectOption(mesh.expected.id);
    await page.getByTestId("mesh-viewer-controls-show").click();
    await expect(page.getByTestId("mesh-viewer-controls-strip").getByRole("checkbox", { name: "Bounding box" })).not.toBeChecked();
    await editor.getByTestId("project-mesh-study-view").click();
    await expect(page.getByTestId("document-mesh-viewport")).toHaveAttribute("data-document-id", mesh.expected.id);
    await page.getByTestId("project-mesh-module-view").click();
    await expect(page.getByTestId("module-workspace")).toBeVisible();
    await editor.getByTestId("project-source-back-to-surface").click();
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-module", "surface");
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-view", "surface");
  } finally { await closeSurfaceApp(ctx); }
});

test("native Surface and sampled views retain ownership, draft, camera and Mesh evidence", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page); await resizeSurfaceAppWindow(ctx, 1600, 1000);
    let page = ctx.page;
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const editor = page.getByTestId("project-source-editor"), viewport = page.getByTestId("document-viewport");
    await expect(viewport).toHaveAttribute("data-view", "surface");
    const id = (await editor.getAttribute("data-document-id"))!, hash = (await editor.getAttribute("data-source-hash"))!;
    await expect(viewport).toHaveAttribute("data-document-id", id); await expect(viewport).toHaveAttribute("data-source-hash", hash);
    await expect(page.getByTestId("surface-viewer-canvas-host")).toHaveCount(1);
    await editor.getByTestId("document-related").getByRole("button", { name: /^Source graph2d/ }).click();
    await expect(page.getByTestId("app-shell")).not.toHaveAttribute("data-project-document-id", id);
    await page.getByTestId("project-navigation-back").click(); await expect(viewport).toHaveAttribute("data-source-hash", hash);
    await page.getByTestId("document-custom-view").click();
    await editor.getByRole("tab", { name: "Source/Object", exact: true }).click();
    await editor.getByTestId("project-source-json").locator("summary").click();
    await editor.getByTestId("project-source-definition").fill("Unapplied draft remains attached to the owning Surface.");
    const canvas = viewport.getByTestId("surface-viewer-canvas-host").locator("canvas"), box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 90, box.y + box.height / 2 + 35, { steps: 10 }); await page.mouse.up();
    await editor.getByTestId("document-view-choice").selectOption("sampled");
    await expect(viewport).toHaveAttribute("data-view", "sampled"); await expect(editor).toHaveAttribute("data-source-hash", hash);
    await expect(editor.getByTestId("project-source-definition")).toHaveValue("Unapplied draft remains attached to the owning Surface.");
    const ui = await page.evaluate(() => Object.entries(localStorage).find(([key]) => key.startsWith("math3d.document-presentation.v1."))?.[1]);
    expect(JSON.parse(ui!).camera).toBeTruthy();
    await page.getByRole("button", { name: "Project", exact: true }).click();
    const panel = page.getByTestId("project-explorer-panel");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.project.v1")!));
    const mesh = saved.workspace.entries.find((entry: any) => entry.module === "mesh");
    await panel.getByTestId("project-viewer-document").selectOption(mesh.expected.id);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-module", "mesh");
    await expect(page.getByTestId("module-workspace")).toBeVisible();
    await expect(page.getByTestId("surface-primary-viewer")).toHaveAttribute("data-document-id", mesh.expected.id);
    await expect(page.getByTestId("surface-left-panel")).toBeVisible();
    await expect(page.getByTestId("surface-right-panel")).toBeVisible();
    await page.getByTestId("project-mesh-study-view").click();
    await expect(page.getByTestId("document-mesh-viewport")).toHaveAttribute("data-document-id", mesh.expected.id);
    await expect(page.getByTestId("document-mesh-viewport")).toHaveAttribute("data-field-colours", "true");
    await expect(page.getByTestId("project-curvature-legend")).toHaveAttribute("data-source-id", mesh.expected.id);
    await expect(page.getByTestId("project-curvature-legend")).toHaveAttribute("data-source-revision", String(mesh.expected.revision));
    await panel.getByTestId("project-navigation-back").click(); await expect(viewport).toHaveAttribute("data-workbench", "module");
    await panel.getByTestId("project-navigation-forward").click(); await expect(page.getByTestId("module-workspace")).toBeVisible();
    await panel.getByTestId("project-navigation-back").click();
    await page.getByTestId("document-custom-view").click();
    await expect(viewport).toHaveAttribute("data-view", "sampled");
    await panel.getByTestId("project-placement-right").click();
    const profile = ctx.profileDir; await ctx.app.close(); ctx = null;
    ctx = await launchSurfaceApp({}, profile); page = ctx.page;
    await openLastSavedProject(page);
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-workbench", "module");
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-id", id);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-source-hash", hash);
    await expect(page.getByTestId("project-explorer-panel")).toHaveAttribute("data-project-placement", "left");
    await page.getByTestId("document-custom-view").click();
    await expect(page.getByTestId("document-viewport")).toHaveAttribute("data-view", "sampled");
    await page.getByTestId("document-view-choice").selectOption("surface");
    await page.screenshot({ path: test.info().outputPath("native-catenoid-cold-restart.png") });
    await page.getByTestId("project-viewer-document").selectOption(mesh.expected.id);
    await page.getByTestId("project-mesh-study-view").click();
    await page.getByTestId("project-source-editor").getByRole("tab", { name: "Inspector", exact: true }).click();
    await page.getByTestId("project-curvature-map").selectOption("H"); await page.reload(); await openLastSavedProject(page);
    await page.getByTestId("project-mesh-study-view").click();
    await expect(page.getByTestId("document-mesh-viewport")).toHaveAttribute("data-document-id", mesh.expected.id);
    await expect(page.getByTestId("project-curvature-map")).toHaveValue("H");
    await expect(page.getByTestId("project-curvature-legend")).toHaveAttribute("data-field", "H");
    await page.screenshot({ path: test.info().outputPath("saved-catenoid-mesh-field.png") });
  } finally { await closeSurfaceApp(ctx); }
});

test("stale selections recover when the saved Project is opened explicitly", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const id = await page.getByTestId("project-source-editor").getAttribute("data-document-id");
    await page.evaluate(() => { const project = JSON.parse(localStorage.getItem("math3d.project.v1")!); localStorage.setItem("math3d.project-resume.v1", JSON.stringify({ projectId: project.identity.id, documentId: "missing" })); });
    await page.reload(); await expect(page.getByTestId("project-source-editor")).toHaveCount(0);
    await openLastSavedProject(page);
    await expect(page.getByTestId("project-source-editor")).toHaveAttribute("data-document-id", id!);
    await expect(page.getByTestId("project-resume-status")).toContainText("selection is unavailable");
  } finally { await closeSurfaceApp(ctx); }
});

test("opening preserves unapplied source entered while resources are being prepared", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const page = ctx.page, panel = page.getByTestId("project-explorer-panel"), editor = page.getByTestId("project-source-editor");
    await page.getByTestId("projects-toggle").click(); await page.getByTestId("project-template-open-catenoid-evidence").click();
    const id = await editor.getAttribute("data-document-id"), hash = await editor.getAttribute("data-source-hash");
    const saved = await page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    await page.getByTestId("surfaces-left-tab-object").click();
    await editor.getByTestId("project-source-json").locator("summary").click();
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-template-select").selectOption("derivative-study"); await panel.getByTestId("project-template-preview").click();
    await expect(panel.getByTestId("project-import-open")).toBeEnabled();
    await page.evaluate(() => {
      const state = window as any, original = crypto.subtle.digest.bind(crypto.subtle);
      state.releaseProjectDigest = null;
      crypto.subtle.digest = async (...args: Parameters<SubtleCrypto["digest"]>) => {
        crypto.subtle.digest = original;
        await new Promise<void>(resolve => { state.releaseProjectDigest = resolve; });
        return original(...args);
      };
    });
    await panel.getByTestId("project-import-open").click();
    await expect.poll(() => page.evaluate(() => typeof (window as any).releaseProjectDigest)).toBe("function");
    await page.evaluate(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-testid="project-source-definition"]')!;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "Draft typed during opening must survive.");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      (window as any).releaseProjectDigest();
    });
    await expect(panel.getByTestId("project-message")).toContainText("workspace changed");
    await expect(editor).toHaveAttribute("data-document-id", id!); await expect(editor).toHaveAttribute("data-source-hash", hash!);
    await expect(editor.getByTestId("project-source-definition")).toHaveValue("Draft typed during opening must survive.");
    expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBe(saved);
  } finally { await closeSurfaceApp(ctx); }
});
