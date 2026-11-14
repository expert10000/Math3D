import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "../e2e/helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("live Sage carries a polynomial locus through Geometry, Curve, restart and independent transfer", async ({ request }) => {
  test.setTimeout(360_000);
  const serviceUrl = process.env.MATH3D_RELEASE20_SAGE_SERVICE_URL;
  const backend = serviceUrl ? "docker" : "local";
  let app: LaunchedSurfaceApp | null = null;
  try {
    const cuspResponse = serviceUrl ? await request.post(`${serviceUrl}/run`, { data: {
      operation: "sage.symbolic.singularities", backend: "docker", jobId: "release20-polynomial-cusp",
      params: { expression: "y^2-x^3", variables: ["x", "y"] },
    } }) : null;
    if (cuspResponse) expect(cuspResponse.ok()).toBe(true);
    const cusp = cuspResponse ? await cuspResponse.json() : await require(resolve("dist/main/python/sageSymbolicWorker.js"))
      .runSageSymbolicJob("sage.symbolic.singularities",
        { expression: "y^2-x^3", variables: ["x", "y"] });
    expect(cusp).toMatchObject({ success: true, engine: "sagemath",
      result: { points: [{ x: "0", y: "0" }], criterion: "F=0 and gradient F=0" } });
    const surface = core.createSurfaceDocument({ stableKey: "cas-live-locus-surface", source: {
      representation: "parametric", domain: { kind: "parameter",
        u: { min: -1, max: 1 }, v: { min: -1, max: 1 } },
      units: { length: "unitless" }, orientation: {}, parameters: {}, branchPolicy: null,
      definition: { familyId: "plane", expressions: { x: "u", y: "v", z: "0" } } } });
    let project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }],
      activeDocumentIds: [surface.identity.id], results: [], relations: [], artifacts: [],
      constructions: [], committedSelection: null }),
      { stableKey: "cas-live-locus-journey", title: "Live Sage locus journey" });
    const qq = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "QQ"),
      revision: 1, label: "QQ", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"],
        monomialOrder: "degrevlex" } });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    app = await launchSurfaceApp(serviceUrl ? { MATH3D_SAGE_SERVICE_URL: serviceUrl } : {});
    await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library",
        version: 1, entries: [{ id, title, tags: [], favorite: false,
          savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await page.reload(); await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-cas").click();
    let cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    const builder = cas.getByTestId("cas-locus-builder");
    await builder.getByLabel("Locus polynomial").fill("x^2+y^2-1");
    await builder.getByLabel("Locus sample cap").fill("8000");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await builder.getByTestId("cas-locus-sage").getByLabel("Locus Sage backend").selectOption(backend);
    await builder.getByTestId("cas-locus-run-sage").click();
    await builder.getByTestId("cas-locus-cancel-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("withheld", { timeout: 60_000 });
    expect(core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .workspace.results.some((item: { provenance: { operation: { type: string } } }) =>
        item.provenance.operation.type === "sage.symbolic.singularities")).toBe(false);
    await builder.getByTestId("cas-locus-run-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("Saved Sage singularity result", { timeout: 90_000 });
    let saved = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const result = saved.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "sage.symbolic.singularities");
    expect(result).toMatchObject({ provenance: { operation: { parameters: {
      polynomial: "x^2+y^2-1", variables: ["x", "y"], backend,
      algebraObjectId: ring.id, algebraRevision: 1 } }, engine: { name: "SageMath",
        version: expect.stringMatching(/^\d+\.\d+/) } },
      summary: { exactResult: { points: [], criterion: "F=0 and gradient F=0" } } });
    await builder.getByRole("button", { name: "Render bounded real locus" }).click();
    await expect(builder.getByTestId("cas-locus-plot")).toBeVisible();
    await builder.getByTestId("cas-open-in-geometry")
      .getByRole("button", { name: "Open sampled locus in Geometry" }).click();
    await page.getByTestId("workspace-nav-cas").click();
    cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    await cas.getByTestId("cas-saved-locus-choices")
      .getByRole("button", { name: /Bounded numerical sample/ }).click();
    await cas.getByTestId("cas-saved-locus-components")
      .getByTestId("cas-open-saved-locus-curve-0").click();
    saved = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const curve = saved.workspace.entries.find((entry: { module: string }) => entry.module === "curve");
    const geometry = saved.workspace.entries.find((entry: { module: string }) => entry.module === "geometry" &&
      entry.checkpoint.source?.extensions?.[core.SAGE_LOCUS_GEOMETRY_EXTENSION]);
    expect(curve).toBeTruthy(); expect(geometry).toBeTruthy();
    expect(saved.workspace.relations.some((item: { operation: string }) =>
      item.operation === "algebra.locus-sample-curve")).toBe(true);
    await page.getByTestId("projects-toggle").click();
    let panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-save").click();
    await expect(panel.getByTestId("project-message")).toContainText("Saved", { timeout: 60_000 });
    const more = panel.getByTestId("project-explorer-header").locator("summary");
    for (let attempt = 0; attempt < 3 && !await more.count(); attempt++) {
      const detail = panel.getByTestId("project-detail-toggle");
      if (await detail.count() && await detail.getAttribute("aria-pressed") === "false") await detail.click();
      else await panel.getByTestId("project-gallery-layout-toggle").first().click();
    }
    await more.click();
    await panel.getByTestId("project-explorer-header")
      .getByRole("button", { name: "Import / export" }).click();
    const packagePath = test.info().outputPath("cas-live-locus-transfer.json");
    await app.app.evaluate(({ session }, target) => session.defaultSession.once("will-download",
      (_event, item) => item.setSavePath(target)), packagePath);
    await panel.getByTestId("project-export-resources").click();
    await expect.poll(async () => { try { return (await readFile(packagePath)).length; } catch { return 0; } })
      .toBeGreaterThan(100);
    const packageRaw = await readFile(packagePath, "utf8");
    const packageHash = createHash("sha256").update(packageRaw).digest("hex");
    const firstProfile = app.profileDir;
    await app.app.close();
    app = await launchSurfaceApp({ MATH3D_WSL_DISTRO: "MissingSage",
      MATH3D_SAGE_SERVICE_URL: "http://127.0.0.1:1" }, firstProfile);
    page = app.page; await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-cas").click();
    cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    await expect(cas.getByTestId("cas-saved-sage-locus-evidence"))
      .toContainText("F=0 and gradient F=0", { timeout: 60_000 });
    expect(core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .workspace.results.find((item: { resultId: string }) => item.resultId === result.resultId)).toEqual(result);
    await closeSurfaceApp(app); app = null;
    app = await launchSurfaceApp({ MATH3D_WSL_DISTRO: "MissingSage",
      MATH3D_SAGE_SERVICE_URL: "http://127.0.0.1:1" });
    await resetSurfaceAppState(app.page);
    page = app.page;
    await page.getByTestId("projects-toggle").click();
    panel = page.getByTestId("project-explorer-panel");
    await panel.getByTestId("project-import-file").setInputFiles(packagePath);
    await expect(page.getByTestId("project-import-open")).toBeEnabled();
    await page.getByTestId("project-import-open").click();
    await expect(panel.getByTestId("project-message"))
      .toContainText("Opened supported project", { timeout: 60_000 });
    const imported = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.workspace.results.find((item: { resultId: string }) => item.resultId === result.resultId))
      .toEqual(result);
    expect(imported.workspace.entries.find((entry: { expected: { id: string } }) =>
      entry.expected.id === curve.expected.id)?.checkpoint).toEqual(curve.checkpoint);
    const revised = core.createAlgebraObjectRecord({ id: ring.id, revision: 2, label: "R revised",
      definition: ring.definition });
    const changed = core.upsertMath3DProjectAlgebraObject(imported, revised);
    expect(require(resolve("renderer/src/projects/sageLocusJourney.ts"))
      .inspectSavedSageLocusSingularities(changed, result.resultId).status).toBe("withheld");
    await writeFile(test.info().outputPath("cas-live-locus-observation.json"), JSON.stringify({
      route: serviceUrl ? "Docker service" : "Local WSL", sageVersion: result.provenance.engine.version,
      cuspPoint: cusp.result.points[0],
      source: { algebraObjectId: ring.id, revision: 1, polynomial: "x^2+y^2-1" },
      resultId: result.resultId, geometryId: geometry.expected.id, curveId: curve.expected.id,
      packageSha256: packageHash, cancelled: true, offlineReopen: true,
      independentImport: true, changedSourceWithheld: true,
    }, null, 2));
  } finally { await closeSurfaceApp(app); }
});
