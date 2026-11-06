import { cp, mkdtemp, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createGraph2DFieldReference, createMath3DProject,
  createMixedWorkspaceDocument, createTemporalFieldSourceDocument,
  createVectorField3DDocument, replaceMath3DProjectWorkspace,
  serializeMath3DProject, sha256Checksum, upsertProjectTemporalFieldSource,
  type VectorField3DSource, type VectorField3DVolumes,
  type VerifiedVectorFieldTransfer } from "@math3d/core";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject,
  resetSurfaceAppState } from "./helpers/surfaceAppHarness";

test("GF-56 verifies bundle frames for a saved FTLE Graph profile", async () => {
  test.setTimeout(180_000);
  const root = await mkdtemp(join(tmpdir(), "m3d-gf56-"));
  const bundle = join(root, "vortex.sscene");
  await cp(resolve("tests/fixtures/scientific-scene/vortex-volume.sscene"),
    bundle, { recursive: true });
  const app = await launchSurfaceApp();
  try {
    const page = app.page;
    await resetSurfaceAppState(page);
    const manifestJson = readFileSync(join(bundle, "manifest.json"), "utf8");
    const fingerprint = sha256Checksum(new TextEncoder().encode(manifestJson)).slice(7);
    const manifest = JSON.parse(manifestJson) as { resources: {
      id: string; path: string; sha256: string }[] };
    const components = ["east", "north", "up"] as const;
    const references = components.map(component => createGraph2DFieldReference(
      manifestJson, fingerprint, { kind: "directory", value: bundle },
      "field", component)) as
      [ReturnType<typeof createGraph2DFieldReference>,
        ReturnType<typeof createGraph2DFieldReference>,
        ReturnType<typeof createGraph2DFieldReference>];
    const source: VectorField3DSource = { axes: (["x", "y", "z"] as const).map(
      (role, index) => ({ role, label: role, unit: "m",
        min: index === 2 ? -3 : -4, max: index === 2 ? 3 : 4 })) as
          unknown as VectorField3DSource["axes"],
      timeUnit: "s", field: { kind: "scientific-bundle", references,
        componentUnits: ["m/s", "m/s", "m/s"] }, seeds: [],
      display: { density: [5, 5, 5], maxGlyphs: 512,
        magnitudeScale: 1, colorBy: "speed" },
      solver: { method: "rk45", absoluteTolerance: 1e-6,
        relativeTolerance: 1e-6, maxSteps: 1000, maxTime: 1 } };
    const first = createVectorField3DDocument(source,
      { stableKey: "gf56-desktop-first" });
    let project = createMath3DProject(createMixedWorkspaceDocument({
      entries: [{ module: "vector3d", checkpoint: first,
        expected: first.identity, replay: null }],
      activeDocumentIds: [first.identity.id], constructions: [], results: [],
      artifacts: [], relations: [], committedSelection: null }),
    { stableKey: "gf56-desktop-project" });
    const second = createVectorField3DDocument(first.source,
      { stableKey: "gf56-desktop-frame-2" });
    project = replaceMath3DProjectWorkspace(project, createMixedWorkspaceDocument({
      ...project.workspace, entries: [...project.workspace.entries,
        { module: "vector3d", checkpoint: second,
          expected: second.identity, replay: null }] }));
    const transfer: VerifiedVectorFieldTransfer = {
      manifestJson, fingerprint,
      volumes: components.map(component => {
        const resource = manifest.resources.find(item => item.id === component)!;
        const bytes = readFileSync(join(bundle, resource.path));
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (digest !== resource.sha256) throw new Error("Fixture bytes changed.");
        return { fingerprint, datasetId: "field", component,
          sourceShape: [21, 21, 17], sampleShape: [21, 21, 17],
          resourceSha256: resource.sha256, sampleSha256: digest,
          values: Array.from({ length: bytes.length / 8 }, (_, index) =>
            bytes.readDoubleLE(index * 8)) };
      }) as unknown as VectorField3DVolumes };
    const transfers = new Map([[first.identity.id, transfer],
      [second.identity.id, transfer]]);
    const temporal = createTemporalFieldSourceDocument(project,
      [{ time: 0, documentId: first.identity.id },
        { time: .2, documentId: second.identity.id }],
      { stableKey: "gf56-desktop-time", timeUnit: "s",
        interpolation: "linear", transfers });
    project = upsertProjectTemporalFieldSource(project, temporal, transfers);
    await page.getByTestId("projects-toggle").click();
    const projects = page.getByTestId("project-explorer-panel");
    await projects.getByTestId("project-import-file").setInputFiles({
      name: "gf56.math3d.project.json", mimeType: "application/json",
      buffer: Buffer.from(serializeMath3DProject(project)) });
    await projects.getByTestId("project-import-open").click();
    await page.getByTestId("workspace-nav-graphs").click();
    const explorer = page.getByRole("region", { name: "Scientific Field Explorer" });
    if (!await explorer.isVisible()) {
      await page.locator(".graph2d-toolbar-menu > summary").click();
      await page.getByRole("button", { name: "Scientific Field Explorer" }).click();
    }
    const panel = explorer.getByTestId("gf22-time-source");
    await panel.getByTestId("gf25-saved-time-source-select")
      .selectOption(temporal.identity.id);
    await panel.getByRole("button", { name: "Compute and save bounded FTLE field" }).click();
    await expect(panel.getByTestId("gf50-ftle-field"))
      .toContainText("4 finite-time estimates saved");
    await panel.getByLabel("FTLE convergence tolerance (1/s)").fill("0.5");
    await panel.getByRole("button", { name: "Refine and save physical FTLE profile" }).click();
    await expect(panel.getByTestId("gf53-profile-status"))
      .toContainText("converged cells", { timeout: 90_000 });
    await panel.getByRole("button", {
      name: "Open refined FTLE profile in Graphs" }).click();
    await expect(page.getByTestId("gf53-graph-profile-status").first())
      .toContainText("current");
    await page.getByTestId("projects-toggle").click();
    await projects.getByTestId("project-save").click();
    await page.reload();
    await openLastSavedProject(page);
    const saved = await page.evaluate(() => JSON.parse(
      localStorage.getItem("math3d.project.v1")!));
    expect(saved.workspace.results.some((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "vector3d.temporal-ftle-profile"))
      .toBe(true);
    expect(saved.workspace.entries.some((entry: { module: string;
      checkpoint: { source?: { objects?: { temporalFtleOrigin?: unknown }[] } } }) =>
        entry.module === "graph2d" && entry.checkpoint.source?.objects?.some(item =>
          !!item.temporalFtleOrigin))).toBe(true);
  } finally { await closeSurfaceApp(app); await rm(root, { recursive: true, force: true }); }
});
