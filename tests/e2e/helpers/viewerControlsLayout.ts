import { expect, type Page } from "@playwright/test";

type ViewerControlsWorkspace = "geometry" | "mesh";
type ViewerControlsMode = "normal" | "compact" | "hidden";

const VIEWPORT_SIZES = [
  { width: 1680, height: 980 },
  { width: 1280, height: 820 },
] as const;

const settleViewerLayout = async (page: Page) => {
  await page.waitForTimeout(80);
};

export async function expectViewerControlsResponsiveLayout(
  page: Page,
  workspace: ViewerControlsWorkspace,
  mode: ViewerControlsMode
): Promise<void> {
  const strip = page.getByTestId(`${workspace}-viewer-controls-strip`);
  const modeControl = page.getByTestId(`${workspace}-viewer-controls-mode`);
  const showChip = page.getByTestId(`${workspace}-viewer-controls-show`);

  for (const viewport of VIEWPORT_SIZES) {
    await page.setViewportSize(viewport);
    await settleViewerLayout(page);

    if (mode === "hidden") {
      await expect(strip).toBeHidden();
      await expect(showChip).toBeVisible();
      const result = await page.evaluate((showTestId) => {
        const chip = document.querySelector(`[data-testid="${showTestId}"]`);
        const rect = chip?.getBoundingClientRect();
        if (!rect) return { ok: false, reason: "restore chip missing" };
        const withinViewport = rect.left >= 0 && rect.top >= 0 && rect.right <= window.innerWidth && rect.bottom <= window.innerHeight;
        return { ok: withinViewport, reason: `restore chip rect ${rect.left},${rect.top},${rect.right},${rect.bottom}` };
      }, `${workspace}-viewer-controls-show`);
      expect(result.ok, result.reason).toBe(true);
      continue;
    }

    await expect(strip).toBeVisible();
    await expect(modeControl).toHaveAttribute("data-mode", mode);

    const result = await page.evaluate(
      ({ stripTestId, modeTestId }) => {
        const stripElement = document.querySelector(`[data-testid="${stripTestId}"]`);
        const modeElement = document.querySelector(`[data-testid="${modeTestId}"]`);
        const stripRect = stripElement?.getBoundingClientRect();
        const modeRect = modeElement?.getBoundingClientRect();
        if (!stripElement || !stripRect || !modeElement || !modeRect) {
          return {
            ok: false,
            reason: "strip or mode selector missing",
            overflow: 0,
            overlappedLabels: [] as string[],
          };
        }
        const horizontalOverflow = Math.max(0, stripElement.scrollWidth - stripElement.clientWidth);
        const visibleChildren = Array.from(stripElement.children).filter((child) => {
          const rect = child.getBoundingClientRect();
          const style = window.getComputedStyle(child);
          return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        });
        const overlappedLabels = visibleChildren
          .filter((child) => {
            const rect = child.getBoundingClientRect();
            const sharesModeRow = rect.top < modeRect.bottom && rect.bottom > modeRect.top;
            return sharesModeRow && rect.right > modeRect.left - 8;
          })
          .map((child) => (child.textContent ?? child.getAttribute("data-testid") ?? child.tagName).trim().replace(/\s+/g, " ").slice(0, 80));
        const stripFitsViewport = stripRect.left >= 0 && stripRect.right <= window.innerWidth + 1;
        return {
          ok: horizontalOverflow <= 2 && stripFitsViewport && overlappedLabels.length === 0,
          reason: `overflow=${horizontalOverflow}, strip=${stripRect.left}-${stripRect.right}, modeLeft=${modeRect.left}, overlaps=${overlappedLabels.join(" | ")}`,
          overflow: horizontalOverflow,
          overlappedLabels,
        };
      },
      {
        stripTestId: `${workspace}-viewer-controls-strip`,
        modeTestId: `${workspace}-viewer-controls-mode`,
      }
    );

    expect(result.ok, result.reason).toBe(true);
  }
}
