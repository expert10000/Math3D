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

export async function expectViewportPreviewOverlay(
  page: Page,
  workspace: "geometry" | "mesh",
  preview: string | RegExp,
  viewportPreviewTestId?: string
): Promise<void> {
  const previewLocator = page.getByTestId(viewportPreviewTestId ?? `${workspace}-viewport-command-preview`);
  await expect(previewLocator).toContainText(preview);
  await expect(previewLocator).toHaveAttribute("data-has-overlay", "true");
  await expect(previewLocator).toHaveAttribute("data-overlay-count", /^[1-9]\d*$/);
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
  clickViewportPreview = false,
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
  clickViewportPreview?: boolean;
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
  const viewportPreviewLocator = page.getByTestId(viewportPreviewTestId ?? `${workspace}-viewport-command-preview`);
  if (viewportPreview) {
    await expectViewportPreviewOverlay(page, workspace, viewportPreview, viewportPreviewTestId);
    await expect(viewportPreviewLocator.getByTestId(`${viewportPreviewTestId ?? `${workspace}-viewport-command-preview`}-details`)).toContainText(
      /Operation/
    );
    await expect(viewportPreviewLocator.getByTestId(`${viewportPreviewTestId ?? `${workspace}-viewport-command-preview`}-details`)).toContainText(
      /Selected/
    );
    await expect(viewportPreviewLocator.getByTestId(`${viewportPreviewTestId ?? `${workspace}-viewport-command-preview`}-details`)).toContainText(
      /Overlay/
    );
  }
  if (runWithKeyboard) {
    await page.keyboard.press("Enter");
  } else if (clickViewportPreview) {
    await viewportPreviewLocator.click();
  } else if (applyPreviewTestId) {
    await page.getByTestId(applyPreviewTestId).click();
  } else {
    await action.click();
  }
  await expect(page.getByTestId(`${workspace}-context-confirmation`)).toContainText(confirmation);
  await expect(page.getByTestId(`${workspace}-context-last-command`)).toBeVisible();
  await expect(page.getByTestId(`${workspace}-context-undo-last`)).toBeVisible();
}

export async function runContextualObjectModeCheck({
  page,
  workspace,
  pickMode,
  openWorkspace,
  selectObject,
  chipLabel,
  selectionLabel,
  preview,
  viewportPreview,
  wholeObjectBadgeTestId,
  wholeObjectBadgeLabel,
  actionExpectations,
  forbiddenSelectionHints = [],
}: {
  page: Page;
  workspace: "geometry" | "mesh";
  pickMode: "object" | "auto";
  openWorkspace: () => Promise<void>;
  selectObject?: () => Promise<void>;
  chipLabel: string | RegExp;
  selectionLabel: string | RegExp;
  preview: string | RegExp;
  viewportPreview: string | RegExp;
  wholeObjectBadgeTestId: string;
  wholeObjectBadgeLabel: string | RegExp;
  actionExpectations: readonly { testId: string; label: string | RegExp; enabled?: boolean }[];
  forbiddenSelectionHints?: readonly (string | RegExp)[];
}): Promise<void> {
  await openWorkspace();
  await chooseContextualPickMode(page, workspace, pickMode);
  if (selectObject) await selectObject();

  await expect(page.getByTestId(`${workspace}-context-pick-${pickMode}`)).toContainText(chipLabel);
  await expect(page.getByTestId(`${workspace}-context-pick-${pickMode}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`${workspace}-context-selection-label`)).toContainText(selectionLabel);
  await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
  await expect(page.getByTestId(`${workspace}-viewport-command-preview`)).toContainText(viewportPreview);
  await expect(page.getByTestId(wholeObjectBadgeTestId)).toContainText(wholeObjectBadgeLabel);

  for (const action of actionExpectations) {
    const actionLocator = page.getByTestId(action.testId);
    await expect(actionLocator).toBeVisible();
    await expect(actionLocator).toContainText(action.label);
    if (action.enabled) await expect(actionLocator).toBeEnabled();
  }

  for (const hint of forbiddenSelectionHints) {
    await expect(page.getByTestId(`${workspace}-context-selection-label`)).not.toContainText(hint);
  }
}

export async function runContextualEntityModeCheck({
  page,
  workspace,
  pickMode,
  openWorkspace,
  pickEntity,
  selectionLabel,
  preview,
  viewportPreview,
  cardType,
  cardId,
  cardActions,
  actionExpectations,
}: {
  page: Page;
  workspace: "geometry" | "mesh";
  pickMode: "face" | "edge" | "vertex";
  openWorkspace?: () => Promise<void>;
  pickEntity: () => Promise<void>;
  selectionLabel: string | RegExp;
  preview: string | RegExp;
  viewportPreview: string | RegExp;
  cardType: "Face" | "Edge" | "Vertex";
  cardId: string | RegExp;
  cardActions: string | RegExp;
  actionExpectations: readonly { testId: string; label: string | RegExp; enabled?: boolean }[];
}): Promise<void> {
  if (openWorkspace) await openWorkspace();
  await chooseContextualPickMode(page, workspace, pickMode);
  await pickEntity();

  await expect(page.getByTestId(`${workspace}-context-pick-${pickMode}`)).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`${workspace}-context-selection-label`)).toContainText(selectionLabel);
  await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
  await expectViewportPreviewOverlay(page, workspace, viewportPreview);
  const activeCard = page.getByTestId(`${workspace}-active-selection-card`);
  if (!(await activeCard.isVisible().catch(() => false))) {
    const selectionTab = page.getByTestId(`${workspace}-inspector-tab-selection`);
    if (await selectionTab.isVisible().catch(() => false)) await selectionTab.click();
  }
  await expect(activeCard).toBeVisible();
  await expect(page.getByTestId(`${workspace}-active-selection-card-workspace`)).toHaveText(
    workspace === "mesh" ? "Mesh" : "Geometry"
  );
  await expect(page.getByTestId(`${workspace}-active-selection-card-type`)).toHaveText(cardType);
  await expect(page.getByTestId(`${workspace}-active-selection-card-id`)).toContainText(cardId);
  await expect(page.getByTestId(`${workspace}-active-selection-card-actions`)).toContainText(cardActions);

  for (const action of actionExpectations) {
    const actionLocator = page.getByTestId(action.testId);
    await expect(actionLocator).toBeVisible();
    await expect(actionLocator).toContainText(action.label);
    if (action.enabled) await expect(actionLocator).toBeEnabled();

    const cardActionTestId = action.testId.replace(`${workspace}-context-`, `${workspace}-active-selection-action-`);
    const cardActionLocator = page.getByTestId(cardActionTestId);
    await expect(cardActionLocator).toBeVisible();
    await expect(cardActionLocator).toContainText(action.label);
    if (action.enabled) await expect(cardActionLocator).toBeEnabled();
  }
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
