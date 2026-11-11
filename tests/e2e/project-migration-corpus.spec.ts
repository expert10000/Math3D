import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseMath3DProject, serializeMath3DProject } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

test("tagged 1.7 Project retains saved results and identities after library restart", async () => {
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const bytes = readFileSync(path.resolve(__dirname, "../../docs/evidence/projects-local-share-2026-10-03/received.math3d.project.json"));
    const original = parseMath3DProject(bytes.toString("utf8"));
    expect(original.workspace.results.length).toBeGreaterThan(0);
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" });
    await resetSurfaceAppState(ctx.page);
    let page = ctx.page;
    await page.getByTestId("projects-toggle").click();
    let panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-import-file").setInputFiles({ name: "tagged-v1.7.0.json",
      mimeType: "application/json", buffer: bytes });
    await expect(panel.getByTestId("project-migration-review")).toContainText("The saved Project identity is preserved");
    await panel.getByTestId("project-import-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Imported into the library");
    const saved = await page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`), original.identity.id);
    expect(saved).toBe(serializeMath3DProject(original));
    const profile = ctx.profileDir;
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_E2E: "1" }, profile);
    page = ctx.page; panel = page.getByTestId("project-explorer-panel");
    const reopened = await page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`), original.identity.id);
    expect(reopened).toBe(saved);
    expect(parseMath3DProject(reopened!).workspace.results).toEqual(original.workspace.results);
    expect(parseMath3DProject(reopened!).workspace.entries.map(item => item.expected))
      .toEqual(original.workspace.entries.map(item => item.expected));
    await page.getByTestId("projects-toggle").click();
    await expect(panel.getByTestId(`project-open-saved-${original.identity.id}`)).toBeVisible();
  } finally { await closeSurfaceApp(ctx); }
});
