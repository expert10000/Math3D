import { expect, test } from "@playwright/test";
import type { ElectronApplication } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { launchRepoElectron } from "./helpers/electronLauncher";

test("Workbook Project document and result references survive save and reopen", async () => {
  const profile = mkdtempSync(path.join(os.tmpdir(), "math3d-notebook-reference-"));
  let app: ElectronApplication | null = null;
  try {
    const env: Record<string, string | undefined> = { ...process.env, APPDATA: profile, LOCALAPPDATA: profile, ELECTRON_ENABLE_LOGGING: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    app = await launchRepoElectron({ args: ["."], cwd: path.resolve(__dirname, "../.."), env });
    const page = await app.firstWindow();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByRole("heading", { name: /^math3d$/i, level: 1 })).toBeVisible();
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
    await page.reload();

    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-template-preview").click();
    await expect(projects.getByTestId("project-import-preview")).toContainText("Minimal Surface Study");
    await projects.getByTestId("project-import-open").click();
    await expect(projects.getByTestId("project-message")).toContainText("Opened supported project");
    await page.getByRole("button", { name: "Close project explorer" }).click();

    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    const back = page.getByRole("button", { name: "Back to module" });
    await expect.poll(async () => await back.isVisible() || await page.getByRole("button", { name: "Workbook", exact: true }).first().isVisible()).toBe(true);
    if (await back.isVisible()) await back.click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    await page.getByRole("button", { name: "Project reference", exact: true }).click();
    const cell = page.getByTestId("workbook-project-reference-cell").last();
    await expect(cell).toContainText("active named project");
    const select = cell.getByTestId("workbook-project-reference-target");
    await select.selectOption({ index: 1 });
    const target = await select.inputValue();
    expect(target).toMatch(/^d:/);
    await cell.getByRole("button", { name: "Link selection" }).click();
    await expect(cell.getByTestId("workbook-project-reference-status")).toContainText("current");
    await page.getByRole("button", { name: "Project reference", exact: true }).click();
    const resultCell = page.getByTestId("workbook-project-reference-cell").last();
    const resultSelect = resultCell.getByTestId("workbook-project-reference-target");
    const resultValue = await resultSelect.locator('option[value^="r:"]').first().getAttribute("value");
    expect(resultValue).toMatch(/^r:/);
    await resultSelect.selectOption(resultValue!);
    await resultCell.getByRole("button", { name: "Link selection" }).click();
    await expect(resultCell.getByTestId("workbook-project-reference-status")).toContainText("current");
    const linked = await page.evaluate(() => {
      const books = JSON.parse(localStorage.getItem("math3d.workbooks.v1") ?? "[]");
      return books.flatMap((book: any) => book.stages.flatMap((stage: any) => stage.blocks))
        .filter((block: any) => block.type === "reference").map((block: any) => block.notebookReference);
    });
    expect(linked).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "document", targetId: target.slice(2) }),
      expect.objectContaining({ kind: "result", targetId: resultValue!.slice(2) }),
    ]));

    await page.reload();
    await page.getByRole("button", { name: "Surfaces", exact: true }).first().click();
    await page.getByRole("button", { name: "Workbook", exact: true }).first().click();
    const reopened = page.getByTestId("workbook-project-reference-cell");
    await expect(reopened).toHaveCount(2);
    await expect(reopened.first().getByTestId("workbook-project-reference-status")).toContainText("current");
    await expect(reopened.last().getByTestId("workbook-project-reference-status")).toContainText("current");
    await expect(reopened.last()).toContainText("saved project preview");
  } finally {
    if (app) await app.close();
    rmSync(profile, { recursive: true, force: true });
  }
});
