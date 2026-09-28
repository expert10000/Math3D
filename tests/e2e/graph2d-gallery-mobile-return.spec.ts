import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { launchSurfaceApp, resetSurfaceAppState, closeSurfaceApp } from "./helpers/surfaceAppHarness";
const { parseWorkspaceProjectHandoff, assertWorkspaceHandoffCanReplace } = require(resolve("packages/core/src/index.ts"));
const { importMobileGraph, readMobileGraph, updateStoredMobileGraph } = require(resolve("apps/mobile/src/models/mobileGraphProject.ts"));
const { serializeMobileProjectHandoff } = require(resolve("apps/mobile/src/models/mobileProjectTransfer.ts"));
const { Graph2DCommandAdapter } = require(resolve("packages/kernel/src/graph2dCommandAdapter.ts"));

test("GGL09 actual Android gallery export opens on desktop and returns with checked ancestry", async () => {
  const nativePath = process.env.MATH3D_GALLERY_NATIVE_HANDOFF;
  test.skip(!nativePath, "Physical gallery return requires an Android walkthrough export; the dedicated runner checks this prerequisite.");
  expect(nativePath, "Set MATH3D_GALLERY_NATIVE_HANDOFF to a Two slopes handoff exported by the physical Android walkthrough.").toBeTruthy();
  const bytes = readFileSync(nativePath!), incoming = parseWorkspaceProjectHandoff(bytes.toString("utf8"));
  expect(incoming.producer.platform).toBe("mobile"); expect(incoming.baseRevision).toBeNull();
  const nativeGraph = incoming.project.entries.find((entry: { module: string }) => entry.module === "graph2d").checkpoint;
  expect(nativeGraph.metadata.title).toBe("Two slopes"); expect(nativeGraph.source.objects[0].expression.source).toBe("4*x");
  const app = await launchSurfaceApp();
  try {
    const page = app.page; await resetSurfaceAppState(page); await page.getByTestId("workspace-nav-graphs").click();
    await page.getByTestId("kernel-workspace-toggle").click();
    await page.getByTestId("graph2d-handoff-import").setInputFiles({ name: "physical-android-gallery.handoff.json", mimeType: "application/json", buffer: bytes });
    await expect(page.getByTestId("kernel-workspace-message")).toContainText("Opened Graph handoff");
    await page.getByTestId("kernel-workspace-save").click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("math3d.mixed-workspace.v1")!));
    expect(saved.entries.find((entry: { module: string }) => entry.module === "graph2d").checkpoint).toEqual(nativeGraph);
    await page.getByTestId("kernel-workspace-toggle").click();
    await expect(page.locator('[data-graph2d-path="function_1"]')).toHaveAttribute("d", /[ML]/);
    const functions = page.getByLabel("Graph functions"); await functions.getByRole("button", { name: "Edit Unit slope", exact: true }).click();
    await expect(functions.getByLabel("Function expression")).toHaveValue("4*x");
    await functions.getByLabel("Function expression").fill("5*x"); await functions.getByRole("button", { name: "Save function", exact: true }).click();
    await page.getByTestId("kernel-workspace-toggle").click();
    const exportedPath = resolve("output/ggl09-desktop-return.handoff.json");
    rmSync(exportedPath, { force: true });
    await app.app.evaluate(({ session }, path) => { session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)); }, exportedPath);
    await page.getByTestId("graph2d-handoff-export").click(); await expect.poll(() => existsSync(exportedPath)).toBe(true);
    const outbound = parseWorkspaceProjectHandoff(readFileSync(exportedPath, "utf8"));
    expect(outbound.projectId).toBe(incoming.projectId); expect(outbound.baseRevision).toBe(incoming.projectRevision);
    expect(outbound.project.entries[0].checkpoint.source.objects[0].expression.source).toBe("5*x");
    const mobile = importMobileGraph(readFileSync(exportedPath, "utf8"), [], "desktop-return.handoff.json", 1, "desktop");
    const commands = new Graph2DCommandAdapter(readMobileGraph(mobile)); commands.commitViewport({ ...commands.document().display.viewport, xMin: -2.25 });
    const returned = parseWorkspaceProjectHandoff(serializeMobileProjectHandoff(updateStoredMobileGraph(mobile, commands.document(), 2)));
    expect(() => assertWorkspaceHandoffCanReplace(returned, outbound.project)).not.toThrow();
    await page.screenshot({ path: resolve("output/ggl09-native-return-desktop.png") });
  } finally { await closeSurfaceApp(app); }
});
