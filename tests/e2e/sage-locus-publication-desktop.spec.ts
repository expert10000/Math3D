import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, openLastSavedProject, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("saved algebraic locus retains brokered Sage singularities and bounded Geometry after offline reopen", async () => {
  test.setTimeout(240_000);
  const requests: unknown[] = [];
  let online = true;
  let delayNext = false;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/health") {
      response.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6", available: online,
        status: online ? "ok" : "service stopped",
        operations: online ? ["sage.symbolic.singularities"] : [] }));
      return;
    }
    let body = "";
    request.on("data", chunk => { body += String(chunk); });
    request.on("end", () => {
      const job = JSON.parse(body); requests.push(job);
      if (!online) {
        response.statusCode = 503;
        response.end(JSON.stringify({ engine: "sagemath", engineVersion: "10.6",
          operation: "sage.symbolic.singularities", success: false, result: {}, latex: "",
          warnings: [], error: "service stopped" }));
        return;
      }
      const success = JSON.stringify({ engine: "sagemath", engineVersion: "10.6",
        operation: "sage.symbolic.singularities", success: true,
        result: { points: [["0", "0"]] }, latex: "(0,0)", warnings: [] });
      if (delayNext) { delayNext = false; setTimeout(() => response.end(success), 1500); }
      else response.end(success);
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage test server did not bind.");
  let app: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-locus-publication-surface",
      metadata: { title: "Reference Surface" }, source: { representation: "parametric",
        domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
          v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" },
        orientation: {}, parameters: {}, branchPolicy: null,
        definition: { familyId: "sage-locus-reference", expressions: { x: "u", y: "v", z: "0" } } } });
    let project = core.createMath3DProject(core.createMixedWorkspaceDocument({
      entries: [{ module: "surface", checkpoint: surface, expected: surface.identity, replay: null }],
      activeDocumentIds: [surface.identity.id], results: [], relations: [], artifacts: [],
      constructions: [], committedSelection: null }),
      { stableKey: "sage-locus-publication", title: "Sage locus publication" });
    const qq = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "QQ"),
      revision: 1, label: "QQ", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, qq);
    const ring = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "R"),
      revision: 1, label: "R", definition: { kind: "polynomial-ring",
        coefficientDomain: { objectId: qq.id, revision: 1 }, variables: ["x", "y"],
        monomialOrder: "degrevlex" } });
    project = core.upsertMath3DProjectAlgebraObject(project, ring);
    app = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(app.page);
    let page = app.page;
    await page.evaluate(({ id, title, raw }) => {
      localStorage.setItem("math3d.project.v1", raw);
      localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
      localStorage.setItem("math3d.project-library.v1", JSON.stringify({
        format: "math3d.project-library", version: 1,
        entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
    }, { id: project.identity.id, title: project.metadata.title, raw: core.serializeMath3DProject(project) });
    await page.reload();
    await openLastSavedProject(page);
    await page.getByTestId("workspace-nav-cas").click();
    const cas = page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    const builder = cas.getByTestId("cas-locus-builder");
    await builder.getByLabel("Locus polynomial").fill("y^2-x^3");
    await builder.getByLabel("Locus sample cap").fill("8000");
    await builder.getByRole("button", { name: "Validate & preview locus" }).click();
    await builder.getByRole("button", { name: "Inspect tangent and singular locus" }).click();
    await expect(builder.getByTestId("cas-singularity-view")).toContainText("Ordinary cusp");
    await builder.getByRole("button", { name: "Save tangent view to Project" }).click();
    await expect(builder.getByRole("status")).toContainText("Saved exact tangent");
    await builder.getByTestId("cas-locus-sage").getByLabel("Locus Sage backend").selectOption("docker");
    online = false;
    await builder.getByTestId("cas-locus-run-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("withheld", { timeout: 60_000 });
    online = true;
    delayNext = true;
    await builder.getByTestId("cas-locus-run-sage").click();
    await builder.getByTestId("cas-locus-cancel-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("withheld", { timeout: 60_000 });
    expect(core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")))
      .workspace.results.some((item: { provenance: { operation: { type: string } } }) =>
        item.provenance.operation.type === "sage.symbolic.singularities")).toBe(false);
    await builder.getByTestId("cas-locus-run-sage").click();
    await expect(builder.getByTestId("cas-locus-sage-status"))
      .toContainText("Saved Sage singularity result", { timeout: 60_000 });
    expect(requests).toContainEqual(expect.objectContaining({ operation: "sage.symbolic.singularities",
      params: expect.objectContaining({ expression: "y^2-x^3", variables: ["x", "y"] }) }));
    const saved = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const result = saved.workspace.results.find((item: { provenance: { operation: { type: string } } }) =>
      item.provenance.operation.type === "sage.symbolic.singularities");
    expect(result?.summary.exactResult).toEqual({ points: [["0", "0"]] });
    await builder.getByRole("button", { name: "Render bounded real locus" }).click();
    await expect(builder.getByTestId("cas-locus-plot")).toBeVisible();
    await builder.getByTestId("cas-open-in-geometry")
      .getByRole("button", { name: "Open sampled locus in Geometry" }).click();
    const profile = app.profileDir;
    await app.app.close();
    online = false;
    app = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` }, profile);
    page = app.page;
    await openLastSavedProject(page);
    const reopened = core.parseMath3DProject(await page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(reopened.workspace.results.find((item: { resultId: string }) => item.resultId === result.resultId))
      .toMatchObject({ summary: { exactResult: { points: [["0", "0"]] } } });
    expect(reopened.workspace.entries.filter((entry: { module: string }) => entry.module === "geometry").length)
      .toBeGreaterThanOrEqual(2);
    await page.getByTestId("workspace-nav-cas").click();
    await page.getByTestId("cas-algebra-workspace")
      .getByTestId("cas-structures-explorer").getByRole("button", { name: /R @1/ }).click();
    await page.getByTestId("cas-saved-locus-choices")
      .getByRole("button", { name: /Exact tangent at/ }).click();
    await expect(page.getByTestId("cas-saved-tangent-inspection"))
      .toContainText("read-only");
  } finally {
    await closeSurfaceApp(app);
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
