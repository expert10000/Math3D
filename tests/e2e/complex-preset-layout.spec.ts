import { expect, test } from "@playwright/test";
import {
  closeSurfaceApp,
  launchSurfaceApp,
  resetSurfaceAppState,
  resizeSurfaceAppWindow,
} from "./helpers/surfaceAppHarness";

test("Function Explorer preset labels stay readable and selection updates the source at three content widths", async () => {
  const ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
  try {
    const page = ctx.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-complex_analysis").click();
    await page.getByRole("banner").getByRole("button", { name: "Function Explorer", exact: true }).click();

    const cases = [
      { width: 800, label: "1/z", expression: "1/z" },
      { width: 1100, label: "sqrt(z)", expression: "sqrt(z)" },
      { width: 1600, label: "z^(1/3)", expression: "z^(1/3)" },
    ] as const;
    for (const { width, label, expression } of cases) {
      await resizeSurfaceAppWindow(ctx, width, 900);
      await page.getByRole("button", { name: "Gallery", exact: true }).click();
      if (width === 800) {
        await page.screenshot({ path: test.info().outputPath("function-explorer-gallery-800.png") });
      }
      const gallery = page.getByText("Preset gallery", { exact: true }).locator("..");
      const cards = gallery.locator("button").filter({ has: page.locator("span").filter({ hasText: /^f\(z\) = / }) });
      await expect(cards).toHaveCount(20);
      const unreadable = await cards.evaluateAll((buttons) => buttons.flatMap((button) => {
        let clip: Element | null = button.parentElement;
        while (clip && getComputedStyle(clip).overflowX === "visible") clip = clip.parentElement;
        const clipRight = clip?.getBoundingClientRect().right ?? innerWidth;
        return Array.from(button.querySelectorAll("span")).slice(0, 2).flatMap((span) => {
          const right = span.getBoundingClientRect().right;
          return span.scrollWidth > span.clientWidth + 1 || right > clipRight + 1
            ? [{ text: span.textContent, scrollWidth: span.scrollWidth, clientWidth: span.clientWidth, right, clipRight }]
            : [];
        });
      }));
      expect(unreadable, `preset label/formula clipping at ${width}px`).toEqual([]);

      const card = gallery.locator("button").filter({ has: page.getByText(label, { exact: true }) });
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await expect(card).toHaveCSS("background-color", "rgb(238, 242, 255)");
      await expect(page.getByText(`f(z) = ${expression}`, { exact: true }).first()).toBeVisible();
      await page.getByRole("button", { name: "Setup", exact: true }).click();
      await expect(page.getByRole("textbox", { name: "Complex function expression" })).toHaveValue(expression);
      await expect(page.getByRole("heading", { name: "Z-plane (domain)" })).toBeVisible();
      await expect(page.getByText("INSPECTOR", { exact: true })).toBeVisible();
    }
  } finally {
    await closeSurfaceApp(ctx);
  }
});
