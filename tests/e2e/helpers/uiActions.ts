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
  const count = await locator.count();
  const errors: string[] = [];

  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);
    if (!(await candidate.isVisible())) continue;

    for (let attempt = 0; attempt <= retries; attempt++) {
      await candidate.scrollIntoViewIfNeeded().catch(() => undefined);
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
        await candidate.evaluate((node) => {
          if (node instanceof HTMLElement) node.click();
        });
        return;
      } catch (error) {
        errors.push(`index ${i} dom-click attempt ${attempt + 1}: ${toErrorMessage(error)}`);
      }

      await locator.page().waitForTimeout(80 * (attempt + 1));
    }
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
