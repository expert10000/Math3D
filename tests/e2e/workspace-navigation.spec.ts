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
