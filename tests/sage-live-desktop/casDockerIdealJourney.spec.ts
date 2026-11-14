import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "../e2e/helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("live Docker ideal saves exact Sage and sampled locus through cancellation, offline reopen and reimport", async ({ request }) => {
  test.setTimeout(240_000);
  const serviceUrl = "http://127.0.0.1:8767";
  const health = await request.get(`${serviceUrl}/health`);
  expect(health.ok()).toBe(true);
  const service = await health.json();
  expect(service).toMatchObject({ engine: "sagemath", available: true });
  expect(service.operations).toContain("sage.symbolic.singularities");
  let app: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "ideal-locus-reference",
      source: { representation: "parametric", domain: { kind: "parameter",
        u: { min: -1, max: 1 }, v: { min: -1, max: 1 } }, units: { length: "unitless" },
        orientation: {}, parameters: {}, branchPolicy: null,
        definition: { familyId: "plane", expressions: { x: "u", y: "v", z: "0" } } } });
    let project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }],
      activeDocumentIds: [surface.identity.id], results: [], relations: [], artifacts: [],
      constructions: [], committedSelection: null }),
      { stableKey: "ideal-locus-publication", title: "Ideal locus publication" });
    const record = (key: string, definition: unknown) => core.createAlgebraObjectRecord({
      id: core.createProjectAlgebraObjectId(project.identity.id, key), revision: 1, label: key, definition });
    const qq = record("QQ", { kind: "rational-field" });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = record("R", { kind: "polynomial-ring", coefficientDomain: { objectId: qq.id, revision: 1 },
      variables: ["x", "y", "z"], monomialOrder: "degrevlex" });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    const ideal = record("I", { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
      generators: ["y^2-x^3", "z"] });
    project = core.upsertMath3DProjectAlgebraObject(project, ideal);
    app = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: serviceUrl });
    await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await page.reload(); await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-cas").click();
    let cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /I @1/ }).click();
    let builder = cas.getByTestId("cas-locus-builder");
    await builder.getByLabel("Locus sample cap").fill("8000");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await builder.getByTestId("cas-locus-sage").getByLabel("Locus Sage backend").selectOption("docker");
    await builder.getByTestId("cas-locus-run-sage").click();
    await builder.getByTestId("cas-locus-cancel-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status")).toContainText("withheld", { timeout: 60_000 });
    expect(core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .workspace.results.some((item: { provenance: { operation: { type: string } } }) =>
        item.provenance.operation.type === "sage.symbolic.singularities")).toBe(false);
    await builder.getByTestId("cas-locus-run-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("Saved exact Sage ideal singularities", { timeout: 60_000 });
    await expect(builder.getByTestId("cas-locus-sage-result")).toContainText("Jacobian rank");
    const saved = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const result = saved.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "sage.symbolic.singularities");
    expect(result.summary.exactResult.points).toEqual([{ x: "0", y: "0", z: "0" }]);
    expect(result.provenance.engine.version).toBe(service.engineVersion);
    expect(result.provenance.operation.parameters).toMatchObject({ equations: ["y^2-x^3", "z"],
      variables: ["x", "y", "z"], backend: "docker" });
    expect(result.provenance.operation.parameters.sampleResultHash).toBeTruthy();
    await builder.getByRole("button", { name: "Render bounded real locus" }).click();
    await expect(builder.getByTestId("cas-locus-plot")).toBeVisible();
    await builder.getByTestId("cas-open-in-geometry")
      .getByRole("button", { name: "Open sampled locus in Geometry" }).click();
    const connected = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const geometry = connected.workspace.entries.find((entry: { module: string; checkpoint: { source?: { extensions?: Record<string, unknown> } } }) =>
      entry.module === "geometry" && entry.checkpoint.source?.extensions?.[core.SAGE_LOCUS_GEOMETRY_EXTENSION]);
    expect(geometry).toBeTruthy();
    const profile = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: "http://127.0.0.1:1" }, profile);
    page = app.page; await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-cas").click();
    cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /I @1/ }).click();
    await expect(cas.getByTestId("cas-saved-sage-locus-evidence"))
      .toContainText("QQ rational points", { timeout: 60_000 });
    const exported = test.info().outputPath("ideal-locus-project.json");
    await page.getByTestId("projects-toggle").evaluate(element => (element as HTMLButtonElement).click());
    const panel = page.getByTestId("project-explorer-panel");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), exported);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(() => { try { return readFileSync(exported).length; } catch { return 0; } })
      .toBeGreaterThan(100);
    const raw = readFileSync(exported, "utf8");
    const returned = core.parseMath3DProject(JSON.stringify(JSON.parse(raw).project));
    expect(returned.workspace.results.some((item: { resultId: string }) => item.resultId === result.resultId)).toBe(true);
    expect(returned.workspace.entries.find((entry: { expected: { id: string } }) =>
      entry.expected.id === geometry.expected.id)?.checkpoint).toEqual(geometry.checkpoint);
    await closeSurfaceApp(app);
    app = await launchSurfaceApp();
    page = app.page;
    await resetSurfaceAppState(page);
    await page.getByTestId("projects-toggle").click();
    const importPanel = page.getByTestId("project-explorer-panel");
    await importPanel.getByTestId("project-import-file").setInputFiles({ name: "ideal-return.json",
      mimeType: "application/json", buffer: Buffer.from(raw) });
    await importPanel.getByTestId("project-import-save").click();
    await expect(importPanel.getByTestId("project-message")).toContainText("Imported into the library");
    const importedRaw = await page.evaluate(id => localStorage.getItem(`math3d.project.v1.payload.${id}`),
      returned.identity.id);
    expect(importedRaw).toBeTruthy();
    const imported = core.parseMath3DProject(importedRaw);
    expect(imported.workspace.results.find((item: { resultId: string }) => item.resultId === result.resultId))
      .toEqual(result);
    expect(imported.workspace.entries.find((entry: { expected: { id: string } }) =>
      entry.expected.id === geometry.expected.id)?.checkpoint).toEqual(geometry.checkpoint);
    const revised = core.createAlgebraObjectRecord({ id: ideal.id, revision: 2, label: "I revised",
      definition: { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
        generators: ["y^2-x^3-1", "z"] } });
    const changed = core.upsertMath3DProjectAlgebraObject(returned, revised);
    expect(require(resolve("renderer/src/projects/sageLocusJourney.ts"))
      .inspectSavedSageLocusSingularities(changed, result.resultId).status).toBe("withheld");
  } finally {
    await closeSurfaceApp(app);
  }
});
