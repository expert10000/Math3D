import type { Locator, Page } from "@playwright/test";

const DEFAULT_CLICK_TIMEOUT_MS = Number(process.env.MATH3D_E2E_CLICK_TIMEOUT_MS ?? 6_000);
const DEFAULT_CLICK_RETRIES = Number(process.env.MATH3D_E2E_CLICK_RETRIES ?? 1);

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const clickFirstVisible = async (
  locator: Locator,
  targetLabel: string,
  options: { timeoutMs?: number; retries?: number } = {}
): Promise<void> => {
  const timeoutMs = options.timeoutMs ?? DEFAULT_CLICK_TIMEOUT_MS;
  const retries = Math.max(0, options.retries ?? DEFAULT_CLICK_RETRIES);
  const errors: string[] = [];
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const count = await locator.count().catch((error) => {
      errors.push(`count: ${toErrorMessage(error)}`);
      return 0;
    });

    for (let i = 0; i < count; i++) {
      const candidate = locator.nth(i);
      const visible = await candidate.isVisible().catch((error) => {
        errors.push(`index ${i} visible check: ${toErrorMessage(error)}`);
        return false;
      });
      if (!visible) continue;

      for (let attempt = 0; attempt <= retries; attempt++) {
        await candidate.scrollIntoViewIfNeeded({ timeout: timeoutMs }).catch(() => undefined);
        try {
          await candidate.click({ timeout: timeoutMs });
          return;
        } catch (error) {
          errors.push(`index ${i} click attempt ${attempt + 1}: ${toErrorMessage(error)}`);
        }

        try {
          await candidate.click({ timeout: timeoutMs, force: true });
          return;
        } catch (error) {
          errors.push(`index ${i} force-click attempt ${attempt + 1}: ${toErrorMessage(error)}`);
        }

        try {
          await candidate.dispatchEvent("click", undefined, { timeout: timeoutMs });
          return;
        } catch (error) {
          errors.push(`index ${i} dispatch-click attempt ${attempt + 1}: ${toErrorMessage(error)}`);
        }

        try {
          await candidate.evaluate((node) => {
            if (node instanceof HTMLElement) node.click();
          }, undefined, { timeout: timeoutMs });
          return;
        } catch (error) {
          errors.push(`index ${i} dom-click attempt ${attempt + 1}: ${toErrorMessage(error)}`);
        }

        await locator.page().waitForTimeout(80 * (attempt + 1));
      }
    }

    await locator.page().waitForTimeout(100);
  }

  const detail = errors.length ? ` (${errors[errors.length - 1]})` : "";
  throw new Error(`Visible element not found or not clickable: ${targetLabel}${detail}`);
};

export const clickFirstVisibleButton = async (
  page: Page,
  name: string,
  options?: { timeoutMs?: number; retries?: number }
): Promise<void> =>
  clickFirstVisible(page.getByRole("button", { name, exact: true }), `button "${name}"`, options);
