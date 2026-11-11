import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { instantiateMath3DProjectTemplate, createProjectStudyFromDocuments, serializeMath3DProject } from "@math3d/core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { bytesToMiB, sampleProcessTreeSafely } from "./helpers/processMemory";

const receipt = (testInfo: TestInfo, name: string, details: Record<string, unknown>) => {
  const directory = process.env.MATH3D_STRESS_REPORT_DIR ? path.resolve(process.env.MATH3D_STRESS_REPORT_DIR) : testInfo.outputDir;
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `${name}.json`), JSON.stringify({
    schema: "math3d.release20.resilience.v1", recordedAt: new Date().toISOString(),
    build: JSON.parse(readFileSync("dist/build-identity.json", "utf8")),
    host: { os: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length },
    ...details,
  }, null, 2) + "\n");
};

const rssMiB = async (pid: number) => {
  const snapshot = await sampleProcessTreeSafely(pid, 0);
  if (snapshot.error || snapshot.rssBytes <= 0) throw new Error(snapshot.error || "No process-tree RSS sample.");
  return Number(bytesToMiB(snapshot.rssBytes).toFixed(1));
};

async function openGuidedCatenary(page: Page) {
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByRole("button", { name: "Starter projects", exact: true }).click();
  await panel.getByTestId("project-gallery-guided").click();
  await panel.getByTestId("curated-study-open-catenary-study").click();
  await expect(panel.getByTestId("project-study-view")).toBeVisible({ timeout: 60_000 });
  await panel.getByTestId("project-research-nav-source").click();
  await expect(panel).toHaveCount(0);
}

test("100 connected module switches retain a responsive viewer and bounded sampled RSS", async ({}, testInfo) => {
  test.setTimeout(10 * 60_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page, errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await openGuidedCatenary(page);
    const pid = ctx.app.process().pid;
    if (!pid) throw new Error("Electron PID unavailable.");
    const checkpoints: { action: number; route: string; rssMiB: number }[] =
      [{ action: 0, route: "source", rssMiB: await rssMiB(pid) }];
    const routes = ["graphs", "surfaces", "mesh", "volume", "projects"] as const;
    for (let action = 1; action <= 100; action++) {
      const route = routes[(action - 1) % routes.length]!;
      if (route === "projects") {
        await page.getByTestId("projects-toggle").click();
        const panel = page.getByTestId("project-explorer-panel");
        await expect(panel).toBeVisible();
        await panel.getByRole("button", { name: "Close project explorer" }).click();
        await expect(panel).toHaveCount(0);
      } else {
        const button = page.getByTestId(`workspace-nav-${route}`);
        await button.click();
        await expect(button).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
      }
      await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
      if (action % 10 === 0) checkpoints.push({ action, route, rssMiB: await rssMiB(pid) });
    }
    await page.waitForTimeout(5_000);
    checkpoints.push({ action: 100, route: "idle-after-5s", rssMiB: await rssMiB(pid) });
    expect(errors).toEqual([]);
    expect(checkpoints).toHaveLength(12);
    receipt(testInfo, "m3d20-10-navigation-100", { routeSequence: routes, actionCount: 100,
      checkpoints, peakSampledRssMiB: Math.max(...checkpoints.map(item => item.rssMiB)),
      pageErrors: errors, whiteScreensObserved: 0 });
  } finally { await closeSurfaceApp(ctx); }
});

test("Volume survives context loss, cancelled extraction and a newer completed job", async ({}, testInfo) => {
  test.setTimeout(4 * 60_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    const page = ctx.page;
    await page.getByTestId("workspace-nav-volume").click();
    const controls = page.getByTestId("volume-detailed-controls");
    await controls.getByRole("button", { name: "3D", exact: true }).click();
    await page.getByTestId("shared-inspector-tab-geometry").click();
    await page.getByTestId("volume-inspector").getByTestId("volume-inspector-view").selectOption("rendering");
    const status = page.getByTestId("volume-direct-render-status");
    await expect(status).toBeVisible();
    const canvas = page.getByTestId("volume-spatial-pane").locator("canvas[data-engine]").first();
    await expect(canvas).toBeVisible();
    const supported = await canvas.evaluate(element => {
      const gl = (element as HTMLCanvasElement).getContext("webgl2");
      const extension = gl?.getExtension("WEBGL_lose_context");
      extension?.loseContext();
      if (extension) window.setTimeout(() => extension.restoreContext(), 1_500);
      return Boolean(extension);
    });
    expect(supported, "Reference host must expose WEBGL_lose_context for this check").toBe(true);
    await expect(status).toContainText("context-lost", { timeout: 15_000 });
    await expect(status).not.toContainText("context-lost", { timeout: 30_000 });
    await controls.getByRole("button", { name: "Quad", exact: true }).click();
    await expect(page.getByTestId("volume-slice-pane-xy")).toBeVisible();
    for (const axis of ["Nx", "Ny", "Nz"]) await controls.getByLabel(`Volume dim ${axis}`).fill("128");
    await controls.getByTestId("volume-apply-sampling").click();
    await controls.getByTestId("volume-apply-isosurface").click();
    await controls.getByTestId("volume-cancel-isosurface").click();
    await expect(controls.getByTestId("volume-isosurface-lifecycle")).toContainText("cancelled", { timeout: 30_000 });
    await controls.getByLabel("Volume dim Nx").fill("127");
    await controls.getByTestId("volume-apply-sampling").click();
    await controls.getByTestId("volume-apply-isosurface").click();
    await expect(controls.getByTestId("volume-isosurface-lifecycle")).toContainText("complete", { timeout: 120_000 });
    await page.waitForTimeout(1_000);
    await expect(controls.getByTestId("volume-isosurface-lifecycle")).toContainText("complete");
    receipt(testInfo, "m3d20-10-volume-failures", { contextLoss: "observed and restored",
      cancellation: "cancelled old extraction", sourceEdit: "Nx 128 to 127", newerResult: "complete" });
  } finally { await closeSurfaceApp(ctx); }
});

test("four-pane Study reopens after a desktop restart", async ({}, testInfo) => {
  test.setTimeout(3 * 60_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const base = instantiateMath3DProjectTemplate("coordinate-overlay-study", "m3d20-10-quad");
    expect(base.workspace.entries).toHaveLength(4);
    const project = createProjectStudyFromDocuments(base, ["m3d20-10", "quad"], "Four source stress Study",
      base.workspace.entries.map(entry => entry.expected.id));
    const study = project.workspace.studies![0]!;
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    let page = ctx.page, panel = page.getByTestId("project-explorer-panel");
    await page.getByTestId("projects-toggle").click();
    await panel.getByTestId("project-import-file").setInputFiles({ name: "quad-project.json",
      mimeType: "application/json", buffer: Buffer.from(serializeMath3DProject(project)) });
    await panel.getByTestId("project-import-open").click();
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-research-nav-studies").click();
    await panel.getByTestId(`project-study-open-${study.id}`).click();
    await expect(panel.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "quad");
    await expect(panel.locator('[data-testid^="project-study-pane-pane-"]')).toHaveCount(4);
    await expect(panel.getByTestId("project-study-pane-preview")).toHaveCount(0);
    await panel.getByTestId("project-study-preview-toggle-pane-4").click();
    await expect(panel.getByTestId("project-study-preview-withheld")).toContainText(/Saved preview unavailable|no read-only Study pane viewer yet/);
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }, profile);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    await openLastSavedProject(page);
    await panel.getByTestId("project-gallery-layout-toggle").click();
    await panel.getByTestId("project-research-nav-studies").click();
    await panel.getByTestId(`project-study-open-${study.id}`).click();
    await expect(panel.getByTestId("project-study-panes")).toHaveAttribute("data-layout", "quad");
    await expect(panel.locator('[data-testid^="project-study-pane-pane-"]')).toHaveCount(4);
    await expect(panel.getByTestId("project-study-pane-preview")).toHaveCount(0);
    receipt(testInfo, "m3d20-10-quad-restart", { projectId: project.identity.id, studyId: study.id,
      panes: 4, geometryPreview: "explicitly withheld", lazyPreviewAfterRestart: true,
      restart: "graceful desktop close and relaunch", savedProjectReopened: true });
  } finally { await closeSurfaceApp(ctx); }
});
