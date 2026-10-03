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
    await controls.show();
    await controls.panel.getByTestId("project-import-file").setInputFiles({ name: "mobile-package.json", mimeType: "application/json", buffer: Buffer.from(raw) });
    await controls.panel.getByTestId("project-import-save").click();
    await expect(controls.panel.getByTestId("project-message")).toContainText("Imported into the library");
    const saved = await ctx.page.evaluate(id => JSON.parse(localStorage.getItem("math3d.project.v1.payload." + id)!), original.project.identity.id);
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
      await controls.reopen(saved.identity.id);
      const graphs = original.docs.filter((document: any) => document.format === "math3d.graph2d-document");
      for (const [index, graph] of graphs.entries()) {
        await controls.open(graph.identity.id);
        const viewer = ctx.page.getByTestId("main-viewer");
        const observed = index === 0 ? viewer.locator(".graph2d-axis").nth(1) : viewer.locator(`[data-graph2d-path="${graph.source.objects[0].id}"]`);
        const attribute = index === 0 ? "x1" : "d";
        if (index !== 0) await expect(observed).toHaveAttribute("d", /[ML]/);
        const before = await observed.getAttribute(attribute);
        await viewer.focus(); await ctx.page.keyboard.press("Control+z");
        await expect.poll(() => observed.getAttribute(attribute)).not.toBe(before);
        await ctx.page.keyboard.press("Control+Shift+z");
        await expect.poll(() => observed.getAttribute(attribute)).toBe(before);
        await viewer.screenshot({ path: resolve(output, `desktop-return-graph-${index + 1}.png`) });
      }
      execFileSync(process.execPath, ["scripts/projects-mobile-roundtrip.mjs", "verify", filename, output]);
    }
    writeFileSync(resolve(output, "desktop-result.json"), JSON.stringify({ ok: true, source: input,
      projectId: saved.identity.id, documents: saved.workspace.entries.length, resources: exported.resources.length,
      returnedGraphHistory: Boolean(process.env.MATH3D_PRJ24_RETURN) }, null, 2) + "\n");
  } finally { await closeSurfaceApp(ctx); }
});
