import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls, inspectFreezePackage } from "./helpers/projectFreeze";

test("PRJ24 delivers complete resource packages through desktop and restores returned Graph history", async () => {
  test.setTimeout(180_000);
  const output = resolve(process.env.MATH3D_PRJ24_OUTPUT ?? test.info().outputPath("roundtrip"));
  mkdirSync(output, { recursive: true });
  execFileSync(process.execPath, ["scripts/projects-mobile-roundtrip.mjs", "generate", output]);
  const input = process.env.MATH3D_PRJ24_RETURN ?? resolve(output, "input.math3d.project-package.json");
  const raw = readFileSync(input, "utf8"), original = inspectFreezePackage(raw);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    ctx = await launchSurfaceApp(); await resetSurfaceAppState(ctx.page);
    const controls = freezeControls(ctx.page);
    await controls.importOpen(raw);
    const saved = await controls.save();
    expect(saved.workspace.entries.map((entry: any) => entry.expected)).toEqual(original.project.workspace.entries.map((entry: any) => entry.expected));
    const filename = resolve(output, process.env.MATH3D_PRJ24_RETURN ? "desktop-return.math3d.project-package.json" : "desktop-delivery.math3d.project-package.json");
    await ctx.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), filename);
    await controls.panel.getByTestId("project-export-resources").click();
    await expect.poll(() => existsSync(filename)).toBe(true);
    const exported = inspectFreezePackage(readFileSync(filename, "utf8"));
    expect(exported.resources).toEqual(original.resources);
    expect(exported.project.workspace.entries.map((entry: any) => entry.expected)).toEqual(original.project.workspace.entries.map((entry: any) => entry.expected));
    await controls.panel.screenshot({ path: resolve(output, "desktop-documents.png") });
    if (process.env.MATH3D_PRJ24_RETURN) {
      const graphs = original.docs.filter((document: any) => document.format === "math3d.graph2d-document");
      for (const graph of graphs) {
        await controls.open(graph.identity.id);
        await expect(ctx.page.getByRole("button", { name: "Undo", exact: true }).first()).toBeEnabled();
        await ctx.page.getByRole("button", { name: "Undo", exact: true }).first().click();
        await expect(ctx.page.getByRole("button", { name: "Redo", exact: true }).first()).toBeEnabled();
        await ctx.page.getByRole("button", { name: "Redo", exact: true }).first().click();
      }
      execFileSync(process.execPath, ["scripts/projects-mobile-roundtrip.mjs", "verify", filename, output]);
    }
    writeFileSync(resolve(output, "desktop-result.json"), JSON.stringify({ ok: true, source: input,
      projectId: saved.identity.id, documents: saved.workspace.entries.length, resources: exported.resources.length,
      returnedGraphHistory: Boolean(process.env.MATH3D_PRJ24_RETURN) }, null, 2) + "\n");
  } finally { await closeSurfaceApp(ctx); }
});
