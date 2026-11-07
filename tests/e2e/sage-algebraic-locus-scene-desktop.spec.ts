import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-F01/F02 saves exact-source contract and bounded sphere/plane plot, then independently reopens both", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-f01-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-f01-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-f01-desktop", title: "Real locus contract" });
    const record = (key: string, definition: unknown) => core.createAlgebraObjectRecord({
      id: core.createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label: key, definition });
    const ref = (item: { id: string }) => ({ objectId: item.id, revision: 1 });
    const qq = record("QQ", { kind: "rational-field" });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = record("R", { kind: "polynomial-ring", coefficientDomain: ref(qq),
      variables: ["x", "y", "z"], monomialOrder: "degrevlex" });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    const ideal = record("I", { kind: "ideal", ambientRing: ref(ring),
      generators: ["x^2+y^2+z^2-1", "x-y"] });
    project = core.upsertMath3DProjectAlgebraObject(project, ideal);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /I @1/ }).click();
    const builder = cas.getByTestId("cas-locus-builder");
    const destinations = builder.getByTestId("cas-open-in-geometry");
    await expect(destinations.getByRole("button", { name: "Open exact locus in Geometry" })).toBeDisabled();
    await expect(destinations).toContainText("Validate a bounded real locus first");
    await builder.getByLabel("x bound min").fill("-3");
    await builder.getByLabel("x bound max").fill("-3");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await expect(builder.getByRole("alert")).toContainText("bounds");
    await builder.getByLabel("x bound max").fill("3");
    await builder.getByLabel("Locus sample cap").fill("8000");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await expect(builder.getByTestId("cas-locus-preview")).toContainText("x^2+y^2+z^2-1=0");
    await expect(builder.getByTestId("cas-locus-preview")).toContainText("uncomputed");
    await expect(destinations.getByRole("button", { name: "Open exact locus in Geometry" })).toBeEnabled();
    await expect(destinations.getByRole("button", { name: "Open sampled locus in Geometry" })).toBeDisabled();
    const scenePath = test.info().outputPath("real-locus.scene.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), scenePath);
    await builder.getByRole("button", { name: "Export scene JSON" }).click();
    await expect.poll(() => { try { return readFileSync(scenePath).length; } catch { return 0; } }).toBeGreaterThan(100);
    const scene = core.parseSageAlgebraicLocusScene(JSON.parse(readFileSync(scenePath, "utf8")));
    expect(scene.source.target.contentHash).toBe(ideal.contentHash);
    expect(scene.source.equations).toEqual(["x^2+y^2+z^2-1", "x-y"]);
    expect(scene.domain.bounds[0]).toMatchObject({ min: -3, max: 3 });
    const geometryPath = test.info().outputPath("real-locus.geometry.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), geometryPath);
    await builder.getByRole("button", { name: "Export Geometry JSON" }).click();
    await expect.poll(() => { try { return readFileSync(geometryPath).length; } catch { return 0; } }).toBeGreaterThan(100);
    expect(core.parseAlgebraicLocusGeometryDocument(JSON.parse(readFileSync(geometryPath, "utf8"))).scene).toEqual(scene);
    await destinations.getByRole("button", { name: "Open exact locus in Geometry" }).click();
    await expect(builder.getByRole("status")).toContainText("Saved uncomputed real-locus Geometry contract");
    await builder.getByRole("button", { name: "Render bounded real locus" }).click();
    const sampleView = builder.getByTestId("cas-locus-sample");
    await expect(sampleView.getByTestId("cas-locus-plot")).toBeVisible();
    await expect(sampleView).toContainText("plane-section-v1");
    await expect(sampleView).toContainText("potentially incomplete");
    await expect(destinations.getByRole("button", { name: "Open sampled locus in Geometry" })).toBeEnabled();
    const samplePath = test.info().outputPath("real-locus.sample.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), samplePath);
    await builder.getByRole("button", { name: "Export sample JSON" }).click();
    await expect.poll(() => { try { return readFileSync(samplePath).length; } catch { return 0; } }).toBeGreaterThan(100);
    const sample = core.parseSageAlgebraicLocusSample(JSON.parse(readFileSync(samplePath, "utf8")), project);
    expect(sample.scene).toEqual(scene);
    expect(sample.segments.length).toBeGreaterThan(100);
    const sampledGeometryPath = test.info().outputPath("real-locus.sampled.geometry.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), sampledGeometryPath);
    await builder.getByRole("button", { name: "Export sampled Geometry JSON" }).click();
    await expect.poll(() => { try { return readFileSync(sampledGeometryPath).length; } catch { return 0; } }).toBeGreaterThan(100);
    expect(core.parseSampledAlgebraicLocusGeometryDocument(JSON.parse(readFileSync(sampledGeometryPath, "utf8")), project).sample).toEqual(sample);
    await destinations.getByRole("button", { name: "Open sampled locus in Geometry" }).click();
    await expect(builder.getByRole("status")).toContainText("Saved bounded real-locus sample");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await panel.getByTestId("project-detail-toggle").click();
    await panel.getByTestId("project-explorer-header").locator("summary").click();
    await panel.getByTestId("project-explorer-header").getByRole("button", { name: "Import / export" }).click();
    const packagePath = test.info().outputPath("real-locus.resources.math3d.project.json");
    await ctx.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(packagePath).length; } catch { return 0; } }).toBeGreaterThan(100);
    await closeSurfaceApp(ctx); ctx = null;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.getByTestId("projects-toggle").click();
    const fresh = ctx.page.getByTestId("project-explorer-panel");
    await fresh.getByTestId("project-import-file").setInputFiles(packagePath);
    await fresh.getByTestId("project-import-save").click();
    await fresh.getByTestId(`project-open-saved-${project.identity.id}`).click();
    const reopened = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const checkpoint = reopened.workspace.entries.find((entry: { checkpoint: { format: string; source?: { extensions?: Record<string, unknown> } } }) =>
      entry.checkpoint.format === "math3d.geometry-document" &&
      entry.checkpoint.source?.extensions?.[core.SAGE_LOCUS_GEOMETRY_EXTENSION]);
    expect(checkpoint).toBeTruthy();
    expect(core.parseSampledAlgebraicLocusGeometryDocument(checkpoint.checkpoint, reopened).sample).toEqual(sample);
    expect(core.sageAlgebraicLocusSceneStatus(scene, reopened)).toBe("current");
  } finally { await closeSurfaceApp(ctx); }
});
