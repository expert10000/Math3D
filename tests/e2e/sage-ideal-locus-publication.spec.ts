import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("two-generator ideal saves exact Sage and sampled locus through cancellation, offline reopen and reimport", async () => {
  test.setTimeout(240_000);
  const requests: any[] = [];
  let online = true, delay = false;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: online,
        status: online ? "ok" : "offline", operations: online ? ["sage.symbolic.singularities"] : [] })); return;
    }
    let body = "";
    request.on("data", chunk => { body += String(chunk); });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      const payload = JSON.stringify({ engine: "sagemath", engineVersion: "10.6",
        operation: "sage.symbolic.singularities", success: online,
        result: online ? { points: [{ x: "0", y: "0", z: "0" }], dimension: 1,
          codimension: 2, jacobianMinors: ["2*y", "-3*x^2"],
          criterion: "all generators vanish and Jacobian rank is below codimension",
          field: "QQ rational points, real-locus completeness checked over AA" } : {}, latex: "(0,0,0)", warnings: [],
        ...(!online ? { error: "offline" } : {}) });
      if (delay) { delay = false; setTimeout(() => response.end(payload), 1200); }
      else response.end(payload);
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage fake server did not bind.");
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
    app = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
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
    delay = true;
    await builder.getByTestId("cas-locus-run-sage").click();
    await builder.getByTestId("cas-locus-cancel-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status")).toContainText("withheld", { timeout: 60_000 });
    await builder.getByTestId("cas-locus-run-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("Saved exact Sage ideal singularities", { timeout: 60_000 });
    await expect(builder.getByTestId("cas-locus-sage-result")).toContainText("Jacobian rank");
    expect(requests).toContainEqual(expect.objectContaining({ operation: "sage.symbolic.singularities",
      params: expect.objectContaining({ equations: ["y^2-x^3", "z"], variables: ["x", "y", "z"] }) }));
    const saved = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const result = saved.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "sage.symbolic.singularities");
    expect(result.summary.exactResult.points).toEqual([{ x: "0", y: "0", z: "0" }]);
    expect(result.provenance.operation.parameters.sampleResultHash).toBeTruthy();
    const profile = app.profileDir;
    await app.app.close(); online = false;
    app = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` }, profile);
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
    await panel.getByTestId("project-export").click();
    await expect.poll(() => { try { return readFileSync(exported).length; } catch { return 0; } })
      .toBeGreaterThan(100);
    const raw = readFileSync(exported, "utf8");
    const returned = core.parseMath3DProject(raw);
    expect(returned.workspace.results.some((item: { resultId: string }) => item.resultId === result.resultId)).toBe(true);
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
    const revised = core.createAlgebraObjectRecord({ id: ideal.id, revision: 2, label: "I revised",
      definition: { kind: "ideal", ambientRing: { objectId: ring.id, revision: 1 },
        generators: ["y^2-x^3-1", "z"] } });
    const changed = core.upsertMath3DProjectAlgebraObject(returned, revised);
    expect(require(resolve("renderer/src/projects/sageLocusJourney.ts"))
      .inspectSavedSageLocusSingularities(changed, result.resultId).status).toBe("withheld");
  } finally {
    await closeSurfaceApp(app);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
