import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  type LaunchedSurfaceApp,
} from "./helpers/surfaceAppHarness";

const SECTION_LABELS = ["Surfaces", "Mesh", "Volume", "Curves", "Topology", "Geometry"] as const;
type SectionLabel = (typeof SECTION_LABELS)[number];

const findSectionButton = async (page: Page, label: SectionLabel): Promise<Locator | null> => {
  const buttons = page.getByRole("button", { name: label, exact: true });
  const count = await buttons.count();
  for (let i = 0; i < count; i++) {
    const button = buttons.nth(i);
    if (!(await button.isVisible())) continue;
    const pressedAttr = await button.getAttribute("aria-pressed");
    if (pressedAttr == null) continue;
    return button;
  }
  return null;
};

const getAvailableSectionLabels = async (page: Page): Promise<SectionLabel[]> => {
  const available: SectionLabel[] = [];
  for (const label of SECTION_LABELS) {
    if (await findSectionButton(page, label)) available.push(label);
  }
  return available;
};

const getActiveSectionLabel = async (page: Page, labels: SectionLabel[]): Promise<SectionLabel> => {
  for (const label of labels) {
    const button = await findSectionButton(page, label);
    if (!button) continue;
    if ((await button.getAttribute("aria-pressed")) === "true") return label;
  }
  throw new Error("Could not determine active section tab.");
};

const selectSection = async (page: Page, labels: SectionLabel[], label: SectionLabel): Promise<void> => {
  const button = await findSectionButton(page, label);
  if (!button) throw new Error(`Section button not found: ${label}`);
  await button.click();
  await expect.poll(async () => getActiveSectionLabel(page, labels)).toBe(label);
};

const buildAlternatingWalk = (start: SectionLabel, alternate: SectionLabel, steps: number): SectionLabel[] => {
  const walk: SectionLabel[] = [];
  let current = start;
  for (let i = 0; i < steps; i++) {
    const next = current === start ? alternate : start;
    walk.push(next);
    current = next;
  }
  return walk;
};

test.describe("Workspace navigation", () => {
  test("Volume stays in its own workspace and keeps gallery plus detailed controls", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const volumeNav = ctx.page.getByTestId("workspace-nav-volume");
      await volumeNav.click();

      await expect(volumeNav).toHaveAttribute("aria-pressed", "true");
      await expect(ctx.page.getByText("Volume / Workspace", { exact: true })).toBeVisible();

      const presetGrid = ctx.page.getByTestId("volume-preset-grid");
      const detailedControls = ctx.page.getByTestId("volume-detailed-controls");
      await expect(presetGrid).toBeVisible();
      await expect(detailedControls).toBeVisible();
      await expect(detailedControls.getByText("Volume grid", { exact: true })).toBeVisible();

      const volumeInspector = ctx.page.getByTestId("volume-inspector");
      await expect(volumeInspector).toBeVisible();
      await expect(volumeInspector.getByTestId("volume-details-card")).toBeVisible();
      await expect(volumeInspector.getByText("Analytic scalar field", { exact: true })).toBeVisible();
      await expect(volumeInspector.getByText("Mesh Details", { exact: true })).toHaveCount(0);
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 1 · definition 1 · grid 1"
      );
      await volumeInspector.getByTestId("volume-inspector-tab-diagnostics").click();
      await expect(volumeInspector.getByTestId("volume-compute-diagnostics")).toContainText("reviewed Volume memory envelope");
      await expect(volumeInspector.getByTestId("volume-diagnostics-card")).toContainText("Native Web Worker");
      await expect(volumeInspector.getByTestId("volume-diagnostics-card")).toContainText("Memory guard");
      await volumeInspector.getByTestId("volume-inspector-tab-volume").click();

      const layoutPresets = detailedControls.getByTestId("volume-layout-presets");
      await expect(layoutPresets.getByRole("button", { name: "Quad", exact: true })).toHaveAttribute("aria-pressed", "true");
      const volume3d = detailedControls.getByRole("button", { name: "3D", exact: true });
      await volume3d.click();
      await expect(volume3d).toHaveAttribute("aria-pressed", "true");
      await expect(ctx.page.getByTestId("volume-slice-grid")).toHaveAttribute("data-volume-layout", "3d");
      await expect(ctx.page.getByTestId("volume-spatial-pane").locator("canvas")).toBeVisible();
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 1 · definition 1 · grid 1"
      );
      await detailedControls.getByRole("button", { name: "Slices", exact: true }).click();
      await expect(ctx.page.getByTestId("volume-slice-grid")).toHaveAttribute("data-volume-layout", "slices");
      await layoutPresets.getByRole("button", { name: "Quad", exact: true }).click();

      const sliceGrid = ctx.page.getByTestId("volume-slice-grid");
      await expect(sliceGrid).toHaveAttribute("data-volume-layout", "quad");
      await expect(sliceGrid).toBeVisible();
      await expect(ctx.page.getByTestId("volume-overview-pane")).toBeVisible();
      for (const paneId of ["xy", "xz", "yz"] as const) {
        const pane = ctx.page.getByTestId(`volume-slice-pane-${paneId}`);
        await expect(pane).toBeVisible();
        const box = await pane.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.width ?? 0).toBeGreaterThan(100);
        expect(box?.height ?? 0).toBeGreaterThan(100);
      }

      for (let resizeIndex = 0; resizeIndex < 10; resizeIndex += 1) {
        await ctx.page.setViewportSize(
          resizeIndex % 2 === 0 ? { width: 1480, height: 900 } : { width: 1380, height: 820 }
        );
        await ctx.page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        for (const paneId of ["xy", "xz", "yz"] as const) {
          const box = await ctx.page.getByTestId(`volume-slice-pane-${paneId}`).boundingBox();
          expect(box).not.toBeNull();
          expect(box?.width ?? 0).toBeGreaterThan(100);
          expect(box?.height ?? 0).toBeGreaterThan(100);
        }
      }

      for (const layout of ["XY", "XZ", "YZ"] as const) {
        await layoutPresets.getByRole("button", { name: layout, exact: true }).click();
        await expect(sliceGrid).toHaveAttribute("data-volume-layout", layout.toLowerCase());
        const pane = ctx.page.getByTestId(`volume-slice-pane-${layout.toLowerCase()}`);
        const box = await pane.boundingBox();
        expect(box).not.toBeNull();
        expect(box?.width ?? 0).toBeGreaterThan(300);
        expect(box?.height ?? 0).toBeGreaterThan(250);
      }
      await layoutPresets.getByRole("button", { name: "Quad", exact: true }).click();
      await ctx.page.getByRole("button", { name: "Focus 3D pane", exact: true }).click();
      await expect(sliceGrid).toHaveAttribute("data-volume-layout", "3d");
      await ctx.page.getByRole("button", { name: "Restore Volume layout", exact: true }).click();
      await expect(sliceGrid).toHaveAttribute("data-volume-layout", "quad");
      await detailedControls.getByLabel("XY plane").uncheck();
      await detailedControls.getByRole("button", { name: "Fit volume", exact: true }).click();
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 1 · definition 1 · grid 1"
      );
      await detailedControls.getByLabel("XY plane").check();

      await expect(ctx.page.getByTestId("volume-orientation-xy-horizontal")).toHaveText("+X");
      await expect(ctx.page.getByTestId("volume-orientation-xy-vertical")).toHaveText("+Y");
      await volumeInspector.getByTestId("volume-inspector-tab-slice").click();
      const sliceCard = volumeInspector.getByTestId("volume-slice-card");
      await expect(sliceCard).toContainText("analytic");
      await expect(sliceCard.getByTestId("volume-navigation-linked")).toBeChecked();
      await expect(sliceCard.getByTestId("volume-navigation-snap")).toBeChecked();

      const xyViewer = ctx.page.getByTestId("volume-slice-viewer-xy");
      await xyViewer.locator("canvas").dispatchEvent("wheel", { deltaY: 100 });
      await expect(sliceCard.getByTestId("volume-navigation-announcement")).toContainText("Z slice 34 of 64");
      await xyViewer.focus();
      await xyViewer.press("PageUp");
      await expect(sliceCard.getByTestId("volume-navigation-announcement")).toContainText("coarse 5");

      const xyBox = await xyViewer.boundingBox();
      expect(xyBox).not.toBeNull();
      if (xyBox) {
        await ctx.page.mouse.move(xyBox.x + xyBox.width * 0.45, xyBox.y + xyBox.height * 0.45);
        await ctx.page.mouse.down();
        await ctx.page.mouse.move(xyBox.x + xyBox.width * 0.58, xyBox.y + xyBox.height * 0.58, { steps: 4 });
        await ctx.page.mouse.up();
        await expect(sliceCard.getByTestId("volume-navigation-announcement")).toContainText("Z slice probe moved");
      }

      await sliceCard.getByTestId("volume-navigation-linked").uncheck();
      const xzViewer = ctx.page.getByTestId("volume-slice-viewer-xz");
      await xzViewer.locator("canvas").dispatchEvent("wheel", { deltaY: 100 });
      await expect(sliceCard).toContainText("Pane slices");
      await sliceCard.getByTestId("volume-reset-probe").click();
      await expect(sliceCard.getByTestId("volume-navigation-announcement")).toContainText("reset to center voxel");

      await sliceCard.getByLabel("Pinned probe name").fill("Center");
      await sliceCard.getByTestId("volume-pin-probe").click();
      await xyViewer.focus();
      await xyViewer.press("ArrowUp");
      await sliceCard.getByLabel("Pinned probe name").fill("Next slice");
      await sliceCard.getByTestId("volume-pin-probe").click();
      await expect(sliceCard.getByTestId("volume-pinned-probe")).toHaveCount(2);
      const compareChecks = sliceCard.getByTestId("volume-pinned-probe").locator('input[type="checkbox"]');
      await compareChecks.nth(0).check();
      await compareChecks.nth(1).check();
      await expect(sliceCard.getByTestId("volume-probe-comparison")).toBeVisible();
      await sliceCard.getByLabel("Volume orientation convention").selectOption("radiological");
      await expect(ctx.page.getByTestId("volume-orientation-xy-horizontal")).toHaveText("−X");

      await volumeInspector.getByTestId("volume-inspector-tab-derived").click();
      await expect(volumeInspector.getByTestId("volume-derived-card")).toContainText(
        "No derived isosurface result is active."
      );
      await volumeInspector.getByTestId("volume-inspector-tab-volume").click();

      await expect(detailedControls.getByTestId("volume-allocation-plan")).toContainText(/262\D144 samples/);
      await expect(detailedControls.getByLabel("Centering")).toHaveValue("point");
      await expect(detailedControls.getByLabel("Interpolation")).toHaveValue("linear");
      await detailedControls.getByLabel("Volume dim Nx").fill("63");
      await expect(detailedControls.getByTestId("volume-sampling-status")).toContainText("current grid is unchanged until Apply");
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 1 · definition 1 · grid 1"
      );
      await detailedControls.getByTestId("volume-apply-sampling").click();
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 2 · definition 1 · grid 2"
      );
      await volumeInspector.getByTestId("volume-inspector-tab-slice").click();
      await expect(volumeInspector.getByTestId("volume-pinned-probe").first()).toContainText("stale revision");
      await volumeInspector.getByTestId("volume-inspector-tab-volume").click();

      await detailedControls.getByTestId("volume-show-isosurface").check();
      await expect(ctx.page.getByTestId("volume-slice-viewer-free")).toHaveAttribute("data-camera-fit-target", "mesh");
      await detailedControls.getByRole("button", { name: "Fit mesh", exact: true }).click();
      await expect(ctx.page.getByTestId("volume-slice-viewer-free")).toHaveAttribute("data-camera-fit-target", "mesh");
      await detailedControls.getByTestId("volume-apply-isosurface").click();
      await volumeInspector.getByTestId("volume-inspector-tab-derived").click();
      await expect(volumeInspector.getByTestId("volume-derived-result-current")).toBeVisible();
      await expect(volumeInspector.getByTestId("volume-derived-result-current")).toContainText(/\d[\d\s,.]* V · \d[\d\s,.]* F/);
      await expect(volumeInspector.getByTestId("volume-derived-result-current")).toContainText("gradient-derived");
      await volumeInspector.getByTestId("volume-derived-result-current").getByTestId("volume-derived-open-analysis").click();
      await expect(ctx.page.getByTestId("workspace-nav-mesh")).toHaveAttribute("aria-pressed", "true");
      await expect(ctx.page.getByTestId("volume-handoff-return")).toBeVisible();
      await ctx.page.getByTestId("volume-handoff-return").click();
      await expect(volumeNav).toHaveAttribute("aria-pressed", "true");

      await detailedControls.getByLabel("Volume dim Ny").fill("63");
      await volumeInspector.getByTestId("volume-inspector-tab-volume").click();
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 2 · definition 1 · grid 2"
      );
      await detailedControls.getByTestId("volume-apply-sampling").click();
      await expect(volumeInspector.getByTestId("volume-details-card")).toContainText(
        "Volume 3 · definition 1 · grid 3"
      );
      await detailedControls.getByTestId("volume-apply-isosurface").click();
      await volumeInspector.getByTestId("volume-inspector-tab-derived").click();
      await expect(volumeInspector.getByTestId("volume-derived-result-stale").first()).toBeVisible();
      await expect(volumeInspector.getByTestId("volume-derived-result-current")).toBeVisible();

      const galleryBox = await presetGrid.boundingBox();
      const detailedBox = await detailedControls.boundingBox();
      expect(galleryBox).not.toBeNull();
      expect(detailedBox).not.toBeNull();
      expect((detailedBox?.y ?? 0)).toBeGreaterThan((galleryBox?.y ?? 0));

      await ctx.page.getByTestId("volume-action-new").click();
      await expect(volumeNav).toHaveAttribute("aria-pressed", "true");
      await expect(detailedControls.getByLabel("F(x,y,z)")).toBeVisible();

      await ctx.page.getByTestId("volume-action-gallery").click();
      await expect(volumeNav).toHaveAttribute("aria-pressed", "true");
      await expect(presetGrid).toBeVisible();

      const volumePresetImages = presetGrid.locator("img.gallery-scan-card-preview-image");
      await expect(volumePresetImages).toHaveCount(9);
      const volumePresetImageSources = await volumePresetImages.evaluateAll((images) =>
        images.map((image) => image.getAttribute("src") ?? "")
      );
      expect(
        volumePresetImageSources.every((source) =>
          source.replace(/\\/g, "/").includes("/gallery-images/captured/volume/")
        )
      ).toBe(true);
      for (let imageIndex = 0; imageIndex < await volumePresetImages.count(); imageIndex += 1) {
        const image = volumePresetImages.nth(imageIndex);
        await image.scrollIntoViewIfNeeded();
        await expect.poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
      }

      await ctx.page.getByTestId("volume-preset-card-torus").click();
      await expect(volumeNav).toHaveAttribute("aria-pressed", "true");
      await expect(ctx.page.getByTestId("volume-preset-card-torus").getByText("Active", { exact: true })).toBeVisible();

      await ctx.page.getByTestId("volume-action-demo").click();
      await expect(volumeNav).toHaveAttribute("aria-pressed", "true");
      await expect(ctx.page.getByText("Volume / Field / Sphere", { exact: true })).toBeVisible();
      await expect(volumeInspector.getByTestId("volume-inspector-selection")).toContainText("Volume: Sphere");
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  test("surface New and Demo actions preserve the active family", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);
      await ctx.page.getByTestId("workspace-nav-surfaces").click();

      const implicit = ctx.page.getByTestId("surface-family-implicit").first();
      await implicit.click();
      await ctx.page.getByTestId("surfaces-action-demo").click();
      await expect(ctx.page.getByText("Surfaces / Implicit", { exact: true })).toBeVisible();

      const explicit = ctx.page.getByTestId("surface-family-explicit").first();
      await explicit.click();
      await ctx.page.getByTestId("surfaces-action-new").click();
      await expect(ctx.page.getByText("Surfaces / Explicit", { exact: true })).toBeVisible();

      const spline = ctx.page.getByTestId("surface-family-spline").first();
      await spline.click();
      await ctx.page.getByTestId("surfaces-action-demo").click();
      await expect(ctx.page.getByText("Surfaces / Spline", { exact: true })).toBeVisible();

      const constructed = ctx.page.getByTestId("surface-family-constructed").first();
      await constructed.click();
      await ctx.page.getByTestId("surfaces-action-demo").click();
      await expect(ctx.page.getByText("Surfaces / Constructed / Rotational", { exact: true })).toBeVisible();
    } finally {
      await closeSurfaceApp(ctx);
    }
  });

  for (const depth of [1, 2, 5, 10] as const) {
    test(`back/forward supports history depth ${depth}`, async () => {
      let ctx: LaunchedSurfaceApp | null = null;
      try {
        ctx = await launchSurfaceApp();
        await resetSurfaceAppState(ctx.page);

        const labels = await getAvailableSectionLabels(ctx.page);
        expect(labels.length).toBeGreaterThanOrEqual(2);

        const back = ctx.page.getByRole("button", { name: "Workspace back", exact: true }).first();
        const forward = ctx.page.getByRole("button", { name: "Workspace forward", exact: true }).first();
        await expect(back).toBeDisabled();
        await expect(forward).toBeDisabled();

        const start = await getActiveSectionLabel(ctx.page, labels);
        const alternate = labels.find((label) => label !== start);
        expect(alternate).toBeTruthy();
        const walk = buildAlternatingWalk(start, alternate as SectionLabel, depth);
        const visited: SectionLabel[] = [start];
        for (const label of walk) {
          await selectSection(ctx.page, labels, label);
          visited.push(label);
        }

        await expect(back).toBeEnabled();
        await expect(forward).toBeDisabled();

        for (let idx = visited.length - 2; idx >= 0; idx--) {
          await back.click();
          await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(visited[idx]);
        }
        await expect(back).toBeDisabled();
        await expect(forward).toBeEnabled();

        for (let idx = 1; idx < visited.length; idx++) {
          await forward.click();
          await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(visited[idx]);
        }
        await expect(forward).toBeDisabled();
      } finally {
        await closeSurfaceApp(ctx);
      }
    });
  }

  test("new navigation after back clears forward history", async () => {
    let ctx: LaunchedSurfaceApp | null = null;
    try {
      ctx = await launchSurfaceApp();
      await resetSurfaceAppState(ctx.page);

      const labels = await getAvailableSectionLabels(ctx.page);
      expect(labels.length).toBeGreaterThanOrEqual(2);

      const back = ctx.page.getByRole("button", { name: "Workspace back", exact: true }).first();
      const forward = ctx.page.getByRole("button", { name: "Workspace forward", exact: true }).first();

      await expect(back).toBeDisabled();
      await expect(forward).toBeDisabled();

      const start = await getActiveSectionLabel(ctx.page, labels);
      const target1 = labels.find((label) => label !== start);
      expect(target1).toBeTruthy();
      await selectSection(ctx.page, labels, target1 as SectionLabel);

      const target2 = labels.find((label) => label !== start && label !== target1);
      expect(target2).toBeTruthy();
      await selectSection(ctx.page, labels, target2 as SectionLabel);

      await expect(back).toBeEnabled();
      await expect(forward).toBeDisabled();

      await back.click();
      await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(target1 as SectionLabel);
      await expect(forward).toBeEnabled();

      const target3 = labels.find((label) => label !== target1);
      expect(target3).toBeTruthy();
      await selectSection(ctx.page, labels, target3 as SectionLabel);

      await expect(forward).toBeDisabled();
      await expect(back).toBeEnabled();

      await back.click();
      await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(target1 as SectionLabel);

      await forward.click();
      await expect.poll(async () => getActiveSectionLabel(ctx.page, labels)).toBe(target3 as SectionLabel);
    } finally {
      await closeSurfaceApp(ctx);
    }
  });
});
