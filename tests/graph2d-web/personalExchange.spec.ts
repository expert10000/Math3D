import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
const { parseWorkspaceProjectHandoff } = require(resolve("packages/core/src/index.ts"));

test("GGL12 personal Graph exchange previews before creating a separate project", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem("math3d.computeEngines.firstLaunchSeen", "1"); });
  await page.reload();
  await page.getByTestId("workspace-nav-graphs").click();
  await page.getByTestId("graph-gallery-open").click();
  const gallery = page.getByTestId("graph-gallery");
  await gallery.getByRole("button", { name: "All scenes", exact: true }).click();
  await gallery.getByRole("button", { name: "Open Two slopes", exact: true }).click();
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!).projectId as string);
  await page.getByTestId("graph-gallery-open").click();
  await gallery.getByRole("button", { name: "My Graphs", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    gallery.getByRole("button", { name: "Export preset Two slopes", exact: true }).click(),
  ]);
  const bytes = readFileSync((await download.path())!);
  const outbound = parseWorkspaceProjectHandoff(bytes.toString("utf8"));
  expect(outbound.projectId).toBe(original);
  const input = gallery.getByTestId("graph-personal-import-file");
  await input.setInputFiles({ name: "personal-graph.json", mimeType: "application/json", buffer: bytes });
  await expect(gallery.getByTestId("graph-personal-import-preview")).toBeVisible();
  await expect(gallery.getByAltText("Two slopes graph import preview")).toBeVisible();
  await gallery.getByRole("button", { name: "Cancel import", exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!).projectId)).toBe(original);
  await input.setInputFiles({ name: "personal-graph.json", mimeType: "application/json", buffer: bytes });
  await gallery.getByRole("button", { name: "Import as independent Graph", exact: true }).click();
  await expect(gallery).not.toBeVisible();
  const imported = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.graph2d-handoff.v2")!));
  expect(imported.projectId).not.toBe(original);
  expect(imported.project.entries[0].checkpoint.source).toEqual(outbound.project.entries[0]!.checkpoint.source);
});
