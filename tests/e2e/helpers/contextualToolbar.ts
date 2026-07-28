import { expect, type Locator, type Page } from "@playwright/test";

export type ContextualPickMode = "object" | "face" | "edge" | "vertex" | "auto";

export async function chooseContextualPickMode(
  page: Page,
  workspace: "geometry" | "mesh",
  pickMode: ContextualPickMode
): Promise<void> {
  await expect(page.getByTestId(`${workspace}-context-toolbar`)).toBeVisible();
  await page.getByTestId(`${workspace}-context-pick-${pickMode}`).click();
}

export async function expectContextualActionReady(action: Locator): Promise<void> {
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
}

export async function choosePickAndExpectActionReady(
  page: Page,
  workspace: "geometry" | "mesh",
  pickMode: ContextualPickMode,
  action: Locator
): Promise<void> {
  await chooseContextualPickMode(page, workspace, pickMode);
  await expectContextualActionReady(action);
}
