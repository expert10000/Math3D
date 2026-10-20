import { expect, type Page } from "@playwright/test";

export const graphEditor = (page: Page) => page.getByRole("dialog", { name: /^(Create graph|Edit .+)$/ });

export async function openGraphType(page: Page, type: string): Promise<void> {
  const list = page.getByLabel("Graph functions", { exact: true });
  if (await list.isVisible()) await list.getByRole("button", { name: "Add Graph" }).click();
  else {
    const compact = page.locator(".graph2d-compact-panels > details:first-child");
    await compact.locator(":scope > summary").click();
    await compact.getByRole("button", { name: "Add Graph" }).click();
  }
  await page.getByRole("dialog", { name: "Choose graph type" }).getByRole("button", { name: type, exact: true }).click();
  await expect(graphEditor(page)).toBeVisible();
}

export async function saveGraphEditor(page: Page): Promise<void> {
  const editor = graphEditor(page);
  await editor.getByRole("button", { name: "Preview", exact: true }).click();
  await editor.getByRole("button", { name: /^(Create graph|Save changes)$/ }).click();
  await expect(editor).toBeHidden();
}

export async function editGraph(page: Page, label: string): Promise<void> {
  const list = page.getByLabel("Graph functions", { exact: true });
  if (await list.isVisible()) await list.getByRole("button", { name: `Select ${label}`, exact: true }).click();
  else {
    const compact = page.locator(".graph2d-compact-panels > details:first-child");
    await compact.locator(":scope > summary").click();
    await compact.getByRole("button", { name: `Select ${label}`, exact: true }).click();
  }
  const rightToggle = page.getByRole("button", { name: "Right", exact: true });
  if (await rightToggle.getAttribute("aria-pressed") === "true") await rightToggle.click();
  const dock = page.getByLabel("Graph inspector", { exact: true });
  if (await dock.isVisible()) await dock.getByRole("button", { name: "Edit graph" }).click();
  else {
    const compact = page.locator(".graph2d-compact-panels > details:has(> summary:text-is('Inspector'))");
    await compact.locator(":scope > summary").click();
    await compact.getByRole("button", { name: "Edit graph" }).click();
  }
  await expect(graphEditor(page)).toBeVisible();
}
