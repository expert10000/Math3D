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

export async function runContextualActionFlow({
  page,
  workspace,
  pickMode,
  pickEntity,
  actionTestId,
  preview,
  viewportPreview,
  viewportPreviewTestId,
  applyPreviewTestId,
  confirmation,
  runWithKeyboard = false,
}: {
  page: Page;
  workspace: "geometry" | "mesh";
  pickMode: ContextualPickMode;
  pickEntity: () => Promise<void>;
  actionTestId: string;
  preview?: string | RegExp;
  viewportPreview?: string | RegExp;
  viewportPreviewTestId?: string;
  applyPreviewTestId?: string;
  confirmation: string | RegExp;
  runWithKeyboard?: boolean;
}): Promise<void> {
  await chooseContextualPickMode(page, workspace, pickMode);
  await pickEntity();
  const action = page.getByTestId(actionTestId);
  await expectContextualActionReady(action);
  if (preview) {
    await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
  }
  if (viewportPreview) {
    await expect(page.getByTestId(viewportPreviewTestId ?? `${workspace}-viewport-command-preview`)).toContainText(
      viewportPreview
    );
  }
  if (runWithKeyboard) {
    await page.keyboard.press("Enter");
  } else if (applyPreviewTestId) {
    await page.getByTestId(applyPreviewTestId).click();
  } else {
    await action.click();
  }
  await expect(page.getByTestId(`${workspace}-context-confirmation`)).toContainText(confirmation);
  await expect(page.getByTestId(`${workspace}-context-last-command`)).toBeVisible();
  await expect(page.getByTestId(`${workspace}-context-undo-last`)).toBeVisible();
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
