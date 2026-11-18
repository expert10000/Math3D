import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState, type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";
import { freezeControls } from "./helpers/projectFreeze";

type MeshSource = { id: string; revision: number; structuralHash: string; checksum: string; selection: string[]; positions: number[]; indices: number[] };

async function meshSource(page: Page): Promise<MeshSource> {
  return page.evaluate(() => {
    const hook = (window as Window & { __MATH3D_E2E_MESH_TOPOLOGY_SOURCE__?: () => MeshSource | null }).__MATH3D_E2E_MESH_TOPOLOGY_SOURCE__;
    const source = hook?.();
    if (!source) throw new Error("Mesh source snapshot unavailable");
    return source;
  });
}

test("M5.1/M5.3 Box Smooth New object preserves lineage and source bytes across Project transfer", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp({ MATH3D_E2E: "1", MATH3D_GPU_MODE: "software", MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" });
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-mesh").click();
    const tools = page.getByRole("button", { name: "Mesh tools", exact: true });
    for (const button of await tools.all()) if (await button.isVisible()) { await button.click(); break; }
    const card = page.getByTestId("mesh-workspace-operation-registry").first();
    await expect(card).toBeVisible();
    const before = await meshSource(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-smooth").click();
    await expect(card.getByRole("group", { name: "Source", exact: true })).toContainText("Box");
    await card.getByTestId("mesh-workspace-operation-registry-smooth-iterations").fill("2");
    await card.getByRole("group", { name: "Output", exact: true }).getByLabel("New object", { exact: true }).check();
    await expect(card.getByRole("group", { name: "Run", exact: true })).toContainText("New object (preserve source)");
    const run = card.getByTestId("mesh-workspace-operation-registry-run-smooth");
    await expect(run).toBeEnabled({ timeout: 45_000 });
    await run.click();
    const result = card.getByTestId("mesh-workspace-operation-registry-last-result");
    await expect(result).toContainText("Smooth", { timeout: 90_000 });
    await expect(result).toContainText("Output: new-object");
    const after = await meshSource(page);
    expect(after.id).not.toBe(before.id);
    expect(after.checksum).not.toBe(before.checksum);
    await page.getByTestId("shared-inspector-tab-history").click();
    await expect(page.getByTestId("mesh-inspector-history-card")).toContainText("Smooth");
    await expect(page.getByTestId("mesh-inspector-history-card")).toContainText("from Box");
    await expect(card.getByTestId("mesh-workspace-operation-registry-quick-compare")).toBeEnabled();
    await card.getByTestId("mesh-workspace-operation-registry-quick-compare").click();
    expect(await meshSource(page)).toEqual(after);

    const saved = await freezeControls(page).save();
    expect(saved.workspace.entries.some((entry: any) => entry.module === "surface" &&
      entry.checkpoint.source?.representation === "mesh-backed")).toBe(false);
    const sourceEntry = saved.workspace.entries.find((entry: any) => entry.module === "mesh" && entry.expected.id === before.id);
    const resultEntry = saved.workspace.entries.find((entry: any) => entry.module === "mesh" && entry.expected.id === after.id);
    expect(sourceEntry?.expected).toMatchObject({ id: before.id, revision: before.revision, structuralHash: before.structuralHash });
    expect(sourceEntry?.checkpoint.source.resource.checksum).toBe(before.checksum);
    expect(resultEntry?.expected).toMatchObject({ id: after.id, revision: after.revision, structuralHash: after.structuralHash });
    const relation = saved.workspace.relations.find((item: any) => item.kind === "derived-from" &&
      item.sources.some((source: any) => source.documentId === before.id) && item.target.type === "document" &&
      item.target.generation.documentId === after.id);
    expect(relation?.sources[0]).toMatchObject({ documentId: before.id, revision: before.revision, structuralHash: before.structuralHash });
    expect(relation?.target.generation).toMatchObject({ documentId: after.id, revision: after.revision, structuralHash: after.structuralHash });
    expect(relation?.parameters).toMatchObject({ outputMode: "new-object" });

    const archivePath = test.info().outputPath("box-smooth-new-object.resources.json");
    const panel = page.getByTestId("project-explorer-panel");
    await panel.getByRole("button", { name: "Import / export" }).click();
    await app.app.evaluate(({ session }, path) => session.defaultSession.once("will-download", (_event, item) => item.setSavePath(path)), archivePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(async () => { try { return (await readFile(archivePath)).length; } catch { return 0; } }).toBeGreaterThan(100);
    await closeSurfaceApp(app); app = null;
    app = await launchSurfaceApp({ MATH3D_E2E: "1", MATH3D_GPU_MODE: "software", MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" });
    const reopenedPage = app.page;
    await resetSurfaceAppState(reopenedPage);
    const controls = freezeControls(reopenedPage);
    const archive = JSON.parse(await readFile(archivePath, "utf8"));
    const requiredMeshResource = archive.resources.find((resource: any) => resource.kind === "mesh-buffers" &&
      resource.id === resultEntry.checkpoint.source.resource.id);
    expect(requiredMeshResource).toBeTruthy();
    expect(archive.resources.filter((resource: any) => resource.kind === "mesh-buffers")).toHaveLength(2);

    const missing = structuredClone(archive);
    missing.resources = missing.resources.filter((resource: any) => resource.id !== requiredMeshResource.id);
    await controls.show();
    await controls.panel.getByTestId("project-import-file").setInputFiles({ name: "missing.resources.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(missing)) });
    await expect(controls.panel.getByTestId("project-import-preview")).toBeVisible();
    await expect(controls.panel.getByTestId("project-import-open")).toBeDisabled();
    await expect(controls.panel.getByTestId("project-import-preview")).toContainText("Required source sidecars are missing or unverified");
    await controls.panel.getByTestId("project-import-cancel").click();

    const changed = structuredClone(archive);
    const changedResource = changed.resources.find((resource: any) => resource.id === requiredMeshResource.id);
    changedResource.data = `${changedResource.data[0] === "A" ? "B" : "A"}${changedResource.data.slice(1)}`;
    await controls.panel.getByTestId("project-import-file").setInputFiles({ name: "changed.resources.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(changed)) });
    await expect(controls.panel.getByTestId("project-message")).toContainText(/checksum|hash|resource|package/i);
    await expect(controls.panel.getByTestId("project-import-open")).toHaveCount(0);

    await controls.importOpen(JSON.stringify(archive));
    await controls.open(before.id);
    expect(await meshSource(reopenedPage)).toMatchObject({ id: before.id, revision: before.revision, structuralHash: before.structuralHash, checksum: before.checksum });
    await controls.open(after.id);
    expect(await meshSource(reopenedPage)).toMatchObject({ id: after.id, revision: after.revision, structuralHash: after.structuralHash, checksum: after.checksum });
  } finally { await closeSurfaceApp(app); }
});

test("M5.2 Box Smooth Replace validates and compares, then Project Undo/Redo restores exact Mesh bytes", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp({ MATH3D_E2E: "1", MATH3D_GPU_MODE: "software", MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" });
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-mesh").click();
    for (const button of await page.getByRole("button", { name: "Mesh tools", exact: true }).all()) {
      if (await button.isVisible()) { await button.click(); break; }
    }
    const card = page.getByTestId("mesh-workspace-operation-registry").first();
    const before = await meshSource(page);
    await card.getByTestId("mesh-workspace-operation-registry-row-smooth").click();
    await card.getByTestId("mesh-workspace-operation-registry-smooth-iterations").fill("2");
    await card.getByRole("group", { name: "Output", exact: true }).getByLabel("Replace", { exact: true }).check();
    await expect(card.getByRole("group", { name: "Run", exact: true })).toContainText("Replace active mesh");
    await expect(card.getByTestId("mesh-workspace-operation-registry-run-smooth")).toBeEnabled({ timeout: 45_000 });
    await card.getByTestId("mesh-workspace-operation-registry-run-smooth").click();
    const result = card.getByTestId("mesh-workspace-operation-registry-last-result");
    await expect(result).toContainText("Output: replace", { timeout: 90_000 });
    const after = await meshSource(page);
    expect(after.id).toBe(before.id);
    expect(after.revision).toBeGreaterThan(before.revision);
    expect(after.checksum).not.toBe(before.checksum);
    await expect(card.getByTestId("mesh-workspace-operation-registry-quick-compare")).toBeEnabled();
    await card.getByTestId("mesh-workspace-operation-registry-quick-compare").click();
    expect(await meshSource(page)).toEqual(after);
    await expect(card.getByTestId("mesh-workspace-operation-registry-quick-validate")).toBeEnabled({ timeout: 45_000 });
    await card.getByTestId("mesh-workspace-operation-registry-quick-validate").click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText("Validate", { timeout: 90_000 });
    expect(await meshSource(page)).toEqual(after);

    const controls = freezeControls(page);
    const saved = await controls.save();
    const entry = saved.workspace.entries.find((item: any) => item.module === "mesh" && item.expected.id === before.id);
    expect(entry?.expected).toMatchObject({ id: after.id, revision: after.revision, structuralHash: after.structuralHash });
    expect(entry?.checkpoint.source.resource.checksum).toBe(before.checksum);
    expect(entry?.replay?.payload?.transactions?.some((transaction: any) => transaction.commands.some((command: any) =>
      command.command.type === "mesh.resource.commit" && command.command.payload.parameters.outputMode === "replace"))).toBe(true);
    await controls.reopen(saved.identity.id);
    await controls.open(before.id);
    await page.getByRole("button", { name: "Saved studies", exact: true }).click();
    const editor = page.getByTestId("project-mesh-editor");
    await expect(editor.getByTestId("project-mesh-undo")).toBeEnabled();
    await editor.getByTestId("project-mesh-undo").click();
    const undone = await meshSource(page);
    expect(undone.id).toBe(before.id);
    expect(undone.checksum).toBe(before.checksum);
    expect(undone.positions).toEqual(before.positions);
    expect(undone.indices).toEqual(before.indices);
    expect(undone.selection).toEqual(before.selection);
    await page.getByRole("button", { name: "Saved studies", exact: true }).click();
    await expect(editor.getByTestId("project-mesh-redo")).toBeEnabled();
    await editor.getByTestId("project-mesh-redo").click();
    const redone = await meshSource(page);
    expect(redone.id).toBe(after.id);
    expect(redone.checksum).toBe(after.checksum);
    expect(redone.positions).toEqual(after.positions);
    expect(redone.indices).toEqual(after.indices);
    expect(redone.selection).toEqual(after.selection);
  } finally { await closeSurfaceApp(app); }
});

test("M5.4 failed and late Smooth worker responses leave the current Mesh intact and allow retry", async () => {
  test.setTimeout(180_000);
  let app: LaunchedSurfaceApp | null = null;
  try {
    app = await launchSurfaceApp({ MATH3D_E2E: "1", MATH3D_GPU_MODE: "software", MATH3D_SKIP_AUTOSAVE_RECOVERY: "1" });
    const page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("workspace-nav-mesh").click();
    for (const button of await page.getByRole("button", { name: "Mesh tools", exact: true }).all()) {
      if (await button.isVisible()) { await button.click(); break; }
    }
    const card = page.getByTestId("mesh-workspace-operation-registry").first();
    await card.getByTestId("mesh-workspace-operation-registry-row-smooth").click();
    await card.getByRole("group", { name: "Output", exact: true }).getByLabel("Replace", { exact: true }).check();
    const before = await meshSource(page);
    await app.app.evaluate(({ ipcMain }) => {
      type Gate = { mode: "fail" | "hold" | "success"; pending: boolean; release: (() => void) | null };
      const host = globalThis as typeof globalThis & { __MATH3D_E2E_SMOOTH_GATE__?: Gate };
      host.__MATH3D_E2E_SMOOTH_GATE__ = { mode: "fail", pending: false, release: null };
      ipcMain.removeHandler("mesh:vtk:smooth");
      ipcMain.handle("mesh:vtk:smooth", async (_event, request: { positions: ArrayBuffer; indices: ArrayBuffer }) => {
        const gate = host.__MATH3D_E2E_SMOOTH_GATE__!;
        if (gate.mode === "fail") return { ok: false, error: "simulated VTK worker unavailable" };
        if (gate.mode === "hold") {
          gate.pending = true;
          await new Promise<void>((release) => { gate.release = release; });
          gate.pending = false;
        }
        const positions = new Float32Array(request.positions.slice(0));
        positions[0] += 0.025;
        return { ok: true, positions: positions.buffer, indices: request.indices,
          vertexCount: request.positions.byteLength / 12, triCount: request.indices.byteLength / 12 };
      });
    });
    const run = card.getByTestId("mesh-workspace-operation-registry-run-smooth");
    await expect(run).toBeEnabled({ timeout: 45_000 });
    await run.click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText("simulated VTK worker unavailable");
    expect(await meshSource(page)).toEqual(before);

    await app.app.evaluate(() => { (globalThis as any).__MATH3D_E2E_SMOOTH_GATE__.mode = "hold"; });
    await run.click();
    await expect.poll(() => app!.app.evaluate(() => (globalThis as any).__MATH3D_E2E_SMOOTH_GATE__.pending)).toBe(true);
    await page.getByTestId("mesh-workspace-source-summary").getByRole("button", { name: "+ Add" }).click();
    await page.getByTestId("mesh-workspace-open-mesh-file").locator('input[type="file"]').setInputFiles(resolve("tests/assets/meshes/basic/03_cube_ascii.stl"));
    await expect.poll(async () => (await meshSource(page)).id).not.toBe(before.id);
    const imported = await meshSource(page);
    await app.app.evaluate(() => { (globalThis as any).__MATH3D_E2E_SMOOTH_GATE__.release(); });
    await expect(run).toBeEnabled({ timeout: 45_000 });
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText("Last operationnone");
    expect(await meshSource(page)).toEqual(imported);

    await app.app.evaluate(() => { (globalThis as any).__MATH3D_E2E_SMOOTH_GATE__.mode = "success"; });
    await run.click();
    await expect(card.getByTestId("mesh-workspace-operation-registry-last-result")).toContainText("success", { timeout: 45_000 });
    const recovered = await meshSource(page);
    expect(recovered.id).toBe(imported.id);
    expect(recovered.revision).toBeGreaterThan(imported.revision);
  } finally { await closeSurfaceApp(app); }
});
