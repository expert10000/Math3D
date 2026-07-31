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

export async function expectCommandPreviewOverlayToggle({
  page,
  workspace,
  preview,
  viewportPreview,
  viewportPreviewTestId,
}: {
  page: Page;
  workspace: "geometry" | "mesh";
  preview: string | RegExp;
  viewportPreview: string | RegExp;
  viewportPreviewTestId?: string;
}): Promise<void> {
  const legend = page.getByTestId(`${workspace}-command-preview-legend`);
  const toggle = page.getByTestId(`${workspace}-command-preview-overlays-toggle`);
  const stripPreview = page.getByTestId(`${workspace}-context-preview`);
  const viewportPreviewLocator = page.getByTestId(viewportPreviewTestId ?? `${workspace}-viewport-command-preview`);

  await expect(legend).toBeVisible();
  await expect(legend).toContainText("Preview");
  await expect(legend).toContainText("Selected");
  await expect(legend).toContainText("Applied");
  await expect(legend).toContainText("Removed");

  await expect(toggle).toBeVisible();
  await toggle.setChecked(false);
  await expect(stripPreview).toContainText(preview);
  await expect(viewportPreviewLocator).toBeHidden();

  await toggle.setChecked(true);
  await expect(stripPreview).toContainText(preview);
  await expectViewportPreviewOverlay(page, workspace, viewportPreview, viewportPreviewTestId);
}

export async function expectDisplayToolbarCommandPreviewToggle({
  page,
  workspace,
  preview,
  viewportPreview,
  viewportPreviewTestId,
}: {
  page: Page;
  workspace: "geometry" | "mesh";
  preview: string | RegExp;
  viewportPreview: string | RegExp;
  viewportPreviewTestId?: string;
}): Promise<void> {
  const toggle = page.getByTestId(`${workspace}-display-command-preview-overlays-toggle`);
  const stripPreview = page.getByTestId(`${workspace}-context-preview`);
  const viewportPreviewLocator = page.getByTestId(viewportPreviewTestId ?? `${workspace}-viewport-command-preview`);

  await expect(toggle).toBeVisible();
  await toggle.setChecked(false);
  await expect(stripPreview).toContainText(preview);
  await expect(viewportPreviewLocator).toBeHidden();

  await toggle.setChecked(true);
  await expect(stripPreview).toContainText(preview);
  await expectViewportPreviewOverlay(page, workspace, viewportPreview, viewportPreviewTestId);
}

export async function setCommandPreviewOverlayPreferenceFromSettings(page: Page, visible: boolean): Promise<void> {
  await page.getByTestId("top-settings-button").click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeVisible();
  const toggle = page.getByTestId("settings-command-preview-overlays-toggle");
  await expect(toggle).toBeVisible();
  await toggle.setChecked(visible);
  await expect(page.getByTestId("settings-command-preview-overlays-state")).toContainText(
    visible ? "Viewport previews are on." : "Viewport previews are off."
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeHidden();
}

export async function restoreCommandPreviewDefaultsFromSettings(page: Page): Promise<void> {
  await page.getByTestId("top-settings-button").click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeVisible();
  await page.getByTestId("settings-command-preview-restore-defaults").click();
  await expect(page.getByTestId("settings-command-preview-overlays-toggle")).toBeChecked();
  await expect(page.getByTestId("settings-command-preview-overlays-state")).toContainText("Viewport previews are on.");
  await expect(page.getByTestId("settings-command-preview-high-visibility-toggle")).not.toBeChecked();
  await expect(page.getByTestId("settings-command-preview-high-visibility-state")).toContainText("High visibility is off.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeHidden();
}

export async function setCommandPreviewHighVisibilityFromSettings(page: Page, visible: boolean): Promise<void> {
  await page.getByTestId("top-settings-button").click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeVisible();
  const toggle = page.getByTestId("settings-command-preview-high-visibility-toggle");
  await expect(toggle).toBeVisible();
  await toggle.setChecked(visible);
  await expect(page.getByTestId("settings-command-preview-high-visibility-state")).toContainText(
    visible ? "High visibility is on." : "High visibility is off."
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeHidden();
}

export async function expectCommandPreviewHighVisibilityMode({
  page,
  workspace,
  preview,
  viewportPreview,
  viewportPreviewTestId,
}: {
  page: Page;
  workspace: "geometry" | "mesh";
  preview: string | RegExp;
  viewportPreview: string | RegExp;
  viewportPreviewTestId?: string;
}): Promise<void> {
  const legend = page.getByTestId(`${workspace}-command-preview-legend`);
  const viewportPreviewLocator = page.getByTestId(viewportPreviewTestId ?? `${workspace}-viewport-command-preview`);
  await setCommandPreviewHighVisibilityFromSettings(page, true);
  await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
  await expect(legend).toHaveAttribute("data-high-visibility", "true");
  await expect(legend).toContainText("High visibility");
  await expectViewportPreviewOverlay(page, workspace, viewportPreview, viewportPreviewTestId);
  await expect(viewportPreviewLocator).toHaveAttribute("data-high-visibility", "true");
  await expect(viewportPreviewLocator.getByTestId(`${viewportPreviewTestId ?? `${workspace}-viewport-command-preview`}-accessibility-labels`)).toContainText(
    /Preview.*Selected.*Applied.*Removed|Preview/
  );

  await restoreCommandPreviewDefaultsFromSettings(page);
  await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
  await expect(legend).toHaveAttribute("data-high-visibility", "false");
  await expectViewportPreviewOverlay(page, workspace, viewportPreview, viewportPreviewTestId);
  await expect(viewportPreviewLocator).toHaveAttribute("data-high-visibility", "false");
  await expect(viewportPreviewLocator.getByTestId(`${viewportPreviewTestId ?? `${workspace}-viewport-command-preview`}-accessibility-labels`)).toBeHidden();
}

export async function expectActiveSelectionPreviewAccessibilityHandoff(
  page: Page,
  workspace: "geometry" | "mesh"
): Promise<void> {
  const activeCard = page.getByTestId(`${workspace}-active-selection-card`);
  if (!(await activeCard.isVisible().catch(() => false))) {
    const selectionTab = page.getByTestId(
      workspace === "geometry" ? "geometry-right-panel-tab-selection" : "mesh-inspector-tab-selection"
    );
    if (await selectionTab.isVisible().catch(() => false)) await selectionTab.click();
  }

  await expect(activeCard).toBeVisible();
  const accessibilityRow = page.getByTestId(`${workspace}-active-selection-card-preview-accessibility`);
  await expect(accessibilityRow).toBeVisible();
  await expect(accessibilityRow).toContainText("Preview accessibility");
  await expect(accessibilityRow).toContainText("High visibility: off");

  await page.getByTestId(`${workspace}-active-selection-card-open-preview-settings`).click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeVisible();
  const highVisibilityToggle = page.getByTestId("settings-command-preview-high-visibility-toggle");
  await expect(highVisibilityToggle).toBeVisible();
  await highVisibilityToggle.setChecked(true);
  await expect(page.getByTestId("settings-command-preview-high-visibility-state")).toContainText("High visibility is on.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(accessibilityRow).toContainText("High visibility: on");

  await page.getByTestId(`${workspace}-active-selection-card-open-preview-settings`).click();
  await expect(page.getByTestId("settings-command-preview-section")).toBeVisible();
  await page.getByTestId("settings-command-preview-restore-defaults").click();
  await expect(page.getByTestId("settings-command-preview-high-visibility-state")).toContainText("High visibility is off.");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(accessibilityRow).toContainText("High visibility: off");
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
  checkOverlayToggle = false,
  checkDisplayToolbarOverlayToggle = false,
  checkSettingsOverlayToggle = false,
  checkHighVisibilityToggle = false,
  checkActiveSelectionPreviewAccessibility = false,
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
  checkOverlayToggle?: boolean;
  checkDisplayToolbarOverlayToggle?: boolean;
  checkSettingsOverlayToggle?: boolean;
  checkHighVisibilityToggle?: boolean;
  checkActiveSelectionPreviewAccessibility?: boolean;
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
    if (checkOverlayToggle && preview) {
      await expectCommandPreviewOverlayToggle({
        page,
        workspace,
        preview,
        viewportPreview,
        viewportPreviewTestId,
      });
    }
    if (checkDisplayToolbarOverlayToggle && preview) {
      await expectDisplayToolbarCommandPreviewToggle({
        page,
        workspace,
        preview,
        viewportPreview,
        viewportPreviewTestId,
      });
    }
    if (checkSettingsOverlayToggle && preview) {
      await setCommandPreviewOverlayPreferenceFromSettings(page, false);
      await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
      await expect(viewportPreviewLocator).toBeHidden();
      await restoreCommandPreviewDefaultsFromSettings(page);
      await expect(page.getByTestId(`${workspace}-context-preview`)).toContainText(preview);
      await expectViewportPreviewOverlay(page, workspace, viewportPreview, viewportPreviewTestId);
    }
    if (checkHighVisibilityToggle && preview) {
      await expectCommandPreviewHighVisibilityMode({
        page,
        workspace,
        preview,
        viewportPreview,
        viewportPreviewTestId,
      });
    }
    if (checkActiveSelectionPreviewAccessibility) {
      await expectActiveSelectionPreviewAccessibilityHandoff(page, workspace);
    }
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
  if (clickViewportPreview && viewportPreview) {
    await expect(viewportPreviewLocator).toHaveAttribute("data-preview-state", "applied");
    await expect(viewportPreviewLocator).toContainText(/Applied:/);
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
