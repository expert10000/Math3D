import { expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { transferNamedProjectThroughMobile } from "./namedProjectMobileTransfer";
const core = require(resolve("packages/core/src/index.ts"));

/** Same real Projects UI journey runs in Electron and two browser locales. */
export async function runNamedProjectRoundTrip(page: Page, exportJson: (checkpoint: boolean) => Promise<string>) {
  await page.getByTestId("projects-toggle").click();
  const panel = page.getByTestId("project-explorer-panel");
  await panel.getByTestId("project-template-preview").click(); await panel.getByTestId("project-import-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
  const outbound = await exportJson(true), original = core.parseMath3DProject(outbound);
  expect(original.workspace.entries.every((entry: any) => entry.replay === null)).toBe(true);
  expect(transferNamedProjectThroughMobile(outbound, false)).toBe(outbound);
  const returned = transferNamedProjectThroughMobile(outbound, true), edited = core.parseMath3DProject(returned);
  expect(edited.identity.id).toBe(original.identity.id); expect(edited.metadata).toEqual(original.metadata);
  expect(edited.workspace.results).toEqual(original.workspace.results); expect(edited.workspace.relations).toEqual(original.workspace.relations);
  expect(edited.workspace.entries.slice(1)).toEqual(original.workspace.entries.slice(1));
  const upload = { name: "mobile-edited.project.json", mimeType: "application/json", buffer: Buffer.from(returned) };
  // Background workbook autosave can initialize during file preview. Assert the
  // complete named-project store (active payload, library, sidecars and backups),
  // whose unchanged bytes are the conflict-rejection contract.
  const projectStorage = () => page.evaluate(() => Object.fromEntries(
    Object.entries(localStorage).filter(([key]) => key.startsWith("math3d.project"))));
  const before = await projectStorage();
  expect(before["math3d.project-library.v1"]).toBeDefined();
  expect(Object.keys(before).some((key) => key.startsWith("math3d.project.v1.payload."))).toBe(true);
  await panel.getByTestId("project-import-file").setInputFiles(upload);
  await expect(panel.getByTestId("project-import-open")).toBeEnabled(); // Qualified native snapshots may open; their historical lineage is retained.
  await panel.getByTestId("project-import-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("different saved version");
  expect(await projectStorage()).toEqual(before);

  // Independent destination-host storage; the source library above was protected.
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload(); await page.getByTestId("projects-toggle").click();
  await panel.getByTestId("project-import-file").setInputFiles(upload);
  await panel.getByTestId("project-import-save").click();
  await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
  expect(await page.evaluate(() => localStorage.getItem("math3d.project.v1"))).toBeNull();
  expect(core.parseMath3DProject(await exportJson(false))).toEqual(edited);
  await panel.getByTestId("project-inspect-relations").click();
  const result = edited.workspace.results[0];
  await expect(panel.getByTestId(`project-result-status-${result.resultId}`)).toContainText("authority numerical");
  await expect(panel.getByTestId(`project-result-status-${result.resultId}`)).toContainText("stale");
  await page.reload(); await page.getByTestId("projects-toggle").click();
  await panel.getByTestId(`project-preview-${edited.identity.id}`).click();
  expect(core.parseMath3DProject(await exportJson(false))).toEqual(edited);
  await panel.getByTestId("project-manage").click();
  const graphId = edited.workspace.entries.find((entry: any) => entry.module === "graph2d").expected.id;
  await panel.getByTestId(`project-actions-${graphId}`).getByRole("button", { name: "Duplicate source", exact: true }).click();
  await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
  await panel.getByTestId("project-undo").click(); await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (1)");
  await panel.getByTestId("project-redo").click(); await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
  await panel.getByTestId("project-save").click(); await expect(panel.getByTestId("project-message")).toContainText("Saved “Minimal Surface Study”");
  await page.reload(); await page.getByTestId("projects-toggle").click(); await panel.getByTestId(`project-preview-${edited.identity.id}`).click();
  await expect(panel.getByTestId("project-group-graph2d")).toContainText("Graph (2)");
  const managed = core.parseMath3DProject(await exportJson(true));
  expect(managed.workspace.results).toEqual(edited.workspace.results);
  expect(managed.workspace.relations).toEqual(expect.arrayContaining(edited.workspace.relations));
  expect(managed.workspace.entries.find((entry: any) => entry.expected.id === graphId)).toEqual(edited.workspace.entries[0]);
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const bounds = await panel.boundingBox(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  }
}
