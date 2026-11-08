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
    const projectPanel = ctx.page.getByTestId("project-explorer-panel");
    await expect(projectPanel.getByTestId("project-view-mode")).toContainText("Current workspace");
    await projectPanel.getByTestId("project-gallery-layout-toggle").click();
    const detailToggle = projectPanel.getByTestId("project-detail-toggle");
    if (await detailToggle.getAttribute("aria-pressed") === "false") await detailToggle.click();
    await projectPanel.getByTestId("project-detail-tab-documents").click();
    const algebraMenu = projectPanel.getByTestId(`project-algebra-open-in-${ideal.id}`);
    await algebraMenu.locator("summary").click();
    await expect(algebraMenu.getByRole("button", { name: "Open locus in Geometry" })).toBeDisabled();
    await algebraMenu.getByRole("button", { name: "Prepare locus in CAS" }).click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /I @1/ }))
      .toHaveAttribute("aria-current", "true");
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
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      core.algebraicLocusGeometryDocument(scene).identity.id);
    await ctx.page.getByTestId("workspace-nav-cas").click();
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /I @1/ }).click();
    await builder.getByLabel("x bound min").fill("-3");
    await builder.getByLabel("x bound max").fill("3");
    await builder.getByLabel("Locus sample cap").fill("8000");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await expect(builder.getByTestId("cas-locus-preview")).toContainText("x^2+y^2+z^2-1=0");
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
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      core.sampledAlgebraicLocusGeometryDocument(sample).identity.id);
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
    await expect(fresh.getByTestId("project-view-mode")).toContainText("Current workspace");
    const reopened = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const checkpoint = reopened.workspace.entries.find((entry: { checkpoint: { format: string; source?: { extensions?: Record<string, unknown> } } }) =>
      entry.checkpoint.format === "math3d.geometry-document" &&
      entry.checkpoint.source?.extensions?.[core.SAGE_LOCUS_GEOMETRY_EXTENSION]);
    expect(checkpoint).toBeTruthy();
    expect(checkpoint?.expected.id).toBe(core.algebraicLocusGeometryDocument(scene).identity.id);
    expect(checkpoint?.expected.id).toBe(core.sampledAlgebraicLocusGeometryDocument(sample).identity.id);
    expect(checkpoint?.replay).toBeNull();
    expect(core.parseSampledAlgebraicLocusGeometryDocument(checkpoint.checkpoint, reopened).sample).toEqual(sample);
    expect(core.sageAlgebraicLocusSceneStatus(scene, reopened)).toBe("current");
    await fresh.getByTestId("project-gallery-layout-toggle").click();
    const details = fresh.getByTestId("project-detail-toggle");
    if (await details.getAttribute("aria-pressed") === "false") await details.click();
    await fresh.getByTestId("project-detail-tab-documents").click();
    const savedMenu = fresh.getByTestId(`project-algebra-open-in-${ideal.id}`);
    await savedMenu.locator("summary").click();
    const savedAction = savedMenu.getByRole("button", { name: "Open sampled locus in Geometry" });
    await expect(savedAction).toBeEnabled();
    await expect(savedMenu).toContainText("exact equations and source remain pinned");
    await savedAction.click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      core.sampledAlgebraicLocusGeometryDocument(sample).identity.id);
    await ctx.page.getByTestId("projects-toggle").click();
    const returnButton = ctx.page.getByTestId(`project-algebra-return-${checkpoint!.expected.id}`)
      .getByRole("button", { name: "Return to algebra source in CAS" });
    await expect(returnButton).toBeEnabled();
    await returnButton.click();
    const returnedCas = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(returnedCas.getByTestId("cas-structures-explorer")
      .getByRole("button", { name: /I @1/ })).toHaveAttribute("aria-current", "true");
    const savedSample = returnedCas.getByTestId("cas-saved-locus-inspection");
    await expect(savedSample).toContainText("Saved bounded locus sample · read-only");
    await expect(savedSample.getByTestId("cas-locus-plot")).toBeVisible();
    await expect(savedSample).toContainText("potentially incomplete");
    await savedSample.getByRole("button", { name: "Open saved sampled Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      checkpoint!.expected.id);
    const revisedIdeal = core.createAlgebraObjectRecord({ id: ideal.id, revision: 2,
      label: "I revised", definition: { kind: "ideal", ambientRing: ref(ring),
        generators: ["x^2+y^2+z^2-4", "x-y"] } });
    const historicalProject = core.upsertMath3DProjectAlgebraObject(reopened, revisedIdeal);
    await ctx.page.evaluate(({ id, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
    }, { id: project.identity.id, raw: core.serializeMath3DProject(historicalProject) });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    const historicalPanel = ctx.page.getByTestId("project-explorer-panel");
    await historicalPanel.getByTestId("project-gallery-layout-toggle").click();
    const historicalDetails = historicalPanel.getByTestId("project-detail-toggle");
    if (await historicalDetails.getAttribute("aria-pressed") === "false") await historicalDetails.click();
    await historicalPanel.getByTestId("project-detail-tab-documents").click();
    const historicalMenu = historicalPanel.getByTestId(`project-algebra-open-in-${ideal.id}-revision-1`);
    await historicalMenu.locator("summary").click();
    await expect(historicalMenu).toContainText("Source is historical; inspect saved evidence without recomputation");
    await expect(historicalMenu.getByRole("button", { name: "Prepare locus in CAS" })).toBeDisabled();
    await historicalMenu.getByRole("button", { name: "Open sampled locus in Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      checkpoint!.expected.id);
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-algebra-return-${checkpoint!.expected.id}`)
      .getByRole("button", { name: "Return to algebra source in CAS" }).click();
    const historicalCas = ctx.page.getByTestId("cas-algebra-workspace");
    const historicalStructure = historicalCas.getByTestId("cas-selected-structure");
    await expect(historicalStructure.getByRole("combobox", { name: "Structure revision" })).toHaveValue("1");
    await expect(historicalStructure).toContainText("Historical revision");
    await expect(historicalCas.getByTestId("cas-structures-explorer")).toContainText(
      "Opened the pinned algebra revision for inspection");
    await expect(historicalCas.getByTestId("cas-saved-locus-inspection")
      .getByTestId("cas-locus-plot")).toBeVisible();
    const historicalBuilder = historicalCas.getByTestId("cas-locus-builder");
    await expect(historicalBuilder.getByRole("button", { name: "Validate & preview locus" }))
      .toBeDisabled();
    await expect(historicalBuilder).toContainText("Choose the current unarchived algebra object revision");
    await expect(historicalBuilder.getByTestId("cas-open-in-geometry")
      .getByRole("button", { name: "Open exact locus in Geometry" })).toBeDisabled();
  } finally { await closeSurfaceApp(ctx); }
});

test("saved exact locus opens read-only in CAS and returns to its Geometry checkpoint", async () => {
  test.setTimeout(90_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const workspace = core.createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
      results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-f01-exact-return",
      title: "Exact locus return" });
    const record = (key: string, definition: unknown) => core.createAlgebraObjectRecord({
      id: core.createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label: key, definition });
    const qq = record("QQ", { kind: "rational-field" });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = record("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
      variables: ["x", "y"], monomialOrder: "degrevlex" });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    const scene = core.buildSageAlgebraicLocusScene(project, { objectId: ring.id, revision: 1 }, {
      polynomial: "x^2+y^2-1", bounds: [{ min: -2, max: 2 }, { min: -2, max: 2 }],
      tolerance: 0.001, maxSamples: 8000 });
    project = core.upsertMath3DProjectAlgebraicLocusScene(project, scene);
    const documentId = core.algebraicLocusGeometryDocument(scene).identity.id;
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library",
        version: 1, entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(),
          viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    const savedChoices = cas.getByTestId("cas-saved-locus-choices");
    await expect(savedChoices.getByRole("button")).toHaveCount(1);
    await savedChoices.getByRole("button", { name: /Uncomputed exact contract/ }).click();
    const savedExact = cas.getByTestId("cas-saved-locus-inspection");
    await expect(savedExact).toContainText("Saved exact locus contract · read-only");
    await expect(savedExact).toContainText("x^2+y^2-1 = 0");
    await expect(savedExact).toContainText("numerical locus is uncomputed");
    await expect(savedExact.getByTestId("cas-locus-plot")).toHaveCount(0);
    await savedExact.getByRole("button", { name: "Open saved exact Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", documentId);
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    const details = panel.getByTestId("project-detail-toggle");
    if (await details.count() === 0) await panel.getByTestId("project-gallery-layout-toggle").click();
    if (await details.getAttribute("aria-pressed") === "false") await details.click();
    await panel.getByTestId("project-detail-tab-documents").click();
    const menu = panel.getByTestId(`project-algebra-open-in-${ring.id}`);
    await menu.locator("summary").click();
    await menu.getByRole("button", { name: "Open exact locus in Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", documentId);
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-algebra-return-${documentId}`)
      .getByRole("button", { name: "Return to algebra source in CAS" }).click();
    await expect(savedExact).toContainText("Saved exact locus contract · read-only");
    await savedExact.getByRole("button", { name: "Open saved exact Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id", documentId);
  } finally { await closeSurfaceApp(ctx); }
});

test("saved two-circle sample promotes a chosen contour with Curve lineage", async () => {
  test.setTimeout(180_000);
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const workspace = core.createMixedWorkspaceDocument({ entries: [], activeDocumentIds: [],
      results: [], artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-f02-curve",
      title: "Bounded contour Curve" });
    const qq = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "QQ"),
      revision: 1, label: "QQ", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"],
        monomialOrder: "degrevlex" } });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    const scene = core.buildSageAlgebraicLocusScene(project, { objectId: ring.id, revision: 1 }, {
      polynomial: "(x^2+y^2-1)*(x^2+y^2-4)",
      bounds: [{ min: -3, max: 3 }, { min: -3, max: 3 }],
      tolerance: 0.001, maxSamples: 8000 });
    const sample = core.sampleSageAlgebraicLocus(scene);
    project = core.upsertMath3DProjectAlgebraicLocusSample(project, sample);
    const choice = core.projectAlgebraLocusReturn(project, project.workspace.entries[0].expected.id);
    const expected = core.upsertProjectAlgebraLocusCurve(project, choice, 1);
    ctx = await launchSurfaceApp();
    await resetSurfaceAppState(ctx.page);
    await ctx.page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library",
        version: 1, entries: [{ id, title, tags: [], favorite: false,
          savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await ctx.page.getByTestId("workspace-nav-cas").click();
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    await cas.getByTestId("cas-saved-locus-choices")
      .getByRole("button", { name: /Bounded numerical sample/ }).click();
    await expect(cas.getByTestId("cas-saved-locus-inspection").getByTestId("cas-locus-plot"))
      .toBeVisible();
    const components = cas.getByTestId("cas-saved-locus-components");
    await expect(components.getByRole("button")).toHaveCount(2);
    await expect(components.getByTestId("cas-open-saved-locus-curve-0"))
      .toContainText("Open contour 1 of 2 in Curves");
    await components.getByTestId("cas-open-saved-locus-curve-1").click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      expected.curve.identity.id);
    const saved = core.parseMath3DProject(await ctx.page.evaluate(() =>
      localStorage.getItem("math3d.project.v1")));
    expect(saved.workspace.entries.find((entry: { expected: { id: string } }) =>
      entry.expected.id === expected.curve.identity.id)?.checkpoint).toEqual(expected.curve);
    expect(expected.curve.source.definition.settings).toMatchObject({ componentIndex: 1,
      componentCount: 2, sampleHash: sample.resultHash });
    expect(saved.workspace.relations.some((relation: { operation: string }) =>
      relation.operation === "algebra.locus-sample-curve")).toBe(true);
    await ctx.page.reload();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      expected.curve.identity.id);
    await ctx.page.getByTestId("projects-toggle").click();
    const panel = ctx.page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-gallery-layout-toggle").click();
    const details = panel.getByTestId("project-detail-toggle");
    if (await details.getAttribute("aria-pressed") === "false") await details.click();
    await panel.getByTestId("project-detail-tab-documents").click();
    await expect(panel.getByTestId("project-view-mode")).toContainText("Current workspace");
    const sourceStatus = panel.getByTestId(`project-contour-source-${expected.curve.identity.id}`);
    await expect(sourceStatus).toContainText("Saved contour source: current");
    const casReturn = sourceStatus.getByTestId(`project-contour-return-cas-${expected.curve.identity.id}`);
    await expect(casReturn).toBeEnabled({ timeout: 90_000 });
    await ctx.page.evaluate(id => {
      const button = document.querySelector<HTMLButtonElement>(
        `[data-testid="project-contour-return-cas-${id}"]`);
      if (!button || button.disabled) throw new Error("Contour CAS return is unavailable.");
      button.click();
    }, expected.curve.identity.id);
    const returnedCas = ctx.page.getByTestId("cas-algebra-workspace");
    await expect(returnedCas.getByTestId("cas-structures-explorer")
      .getByRole("button", { name: /R @1/ })).toHaveAttribute("aria-current", "true");
    await expect(returnedCas.getByTestId("cas-saved-locus-inspection")
      .getByTestId("cas-locus-plot")).toBeVisible();
    await returnedCas.getByTestId("cas-saved-locus-inspection")
      .getByRole("button", { name: "Open saved sampled Geometry" }).click();
    await expect(ctx.page.getByTestId("app-shell")).toHaveAttribute("data-project-document-id",
      choice.documentId);
  } finally { await closeSurfaceApp(ctx); }
});
