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
      await expect(volumeInspector.getByText("Scalar volume grid", { exact: true })).toBeVisible();
      await expect(volumeInspector.getByText("Mesh Details", { exact: true })).toHaveCount(0);

      const sliceGrid = ctx.page.getByTestId("volume-slice-grid");
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

      await volumeInspector.getByTestId("volume-inspector-tab-derived").click();
      await expect(volumeInspector.getByTestId("volume-derived-card")).toContainText(
        "No derived isosurface result is active."
      );

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
