import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));
const gf4 = { format: "math3d.sage-finite-field-explorer-result", schemaVersion: 1,
  characteristic: 2, degree: 2, order: 4, generator: "a", construction: "canonical",
  definingPolynomial: [1, 1, 1], selected: { coefficients: [0, 1], text: "a",
    frobeniusOrbit: [[0, 1], [1, 1]], trace: "1", norm: "1", minimalPolynomial: [1, 1, 1],
    multiplicativeOrder: 3, primitive: true },
  elements: [{ coefficients: [0, 0], text: "0" }, { coefficients: [0, 1], text: "a" },
    { coefficients: [1, 0], text: "1" }, { coefficients: [1, 1], text: "a + 1" }],
  primitiveElements: [[0, 1], [1, 1]], multiplicationTable: { status: "complete",
    cells: [[0, 0, 0, 0], [0, 3, 1, 2], [0, 1, 2, 3], [0, 2, 3, 1]] } };

test("SAGE-G01 explores GF(4), saves exact evidence and independently reopens it", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") { res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5",
      available: true, status: "ok", operations: ["sage.finiteField.explore"] })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body);
      const record = request.params.algebra.objects.at(-1);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        success: true, latex: "", warnings: [], result: { ...gf4, target: request.params.algebra.target,
          targetHash: record.contentHash } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g01-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-g01-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g01-desktop", title: "Finite field" });
    const field = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "F"),
      revision: 1, label: "F", definition: { kind: "finite-field", characteristic: 2, degree: 2,
        generator: "a", construction: "canonical" } });
    project = core.upsertMath3DProjectAlgebraObject(project, field);
    const install = async (raw: string) => {
      await ctx!.page.evaluate(({ id, title, raw }) => {
        localStorage.setItem("math3d.project.v1", raw);
        localStorage.setItem(`math3d.project.v1.payload.${id}`, raw);
        localStorage.setItem("math3d.project-library.v1", JSON.stringify({ format: "math3d.project-library", version: 1,
          entries: [{ id, title, tags: [], favorite: false, savedAt: Date.now(), viewedAt: Date.now() }] }));
      }, { id: project.identity.id, title: project.metadata.title, raw });
      await ctx!.page.reload();
      await ctx!.page.getByTestId("projects-toggle").click();
      await ctx!.page.getByTestId(`project-open-saved-${project.identity.id}`).click();
      await ctx!.page.getByTestId("workspace-nav-cas").click();
    };
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    const cas = ctx.page.getByTestId("cas-algebra-workspace");
    await cas.getByTestId("cas-structures-explorer").getByRole("button", { name: /F @1/ }).click();
    await cas.getByRole("button", { name: "Operations", exact: true }).click();
    await cas.getByRole("button", { name: "Select Finite-field explorer" }).click();
    await expect(cas.getByLabel("Element coefficients (constant first, in base p)")).toHaveValue("0, 1");
    await cas.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(cas.getByTestId("cas-object-run-status")).toContainText("Saved Finite-field explorer evidence");
    await cas.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(cas.getByTestId("cas-finite-field-explorer")).toContainText("GF(2^2)");
    await cas.getByRole("tab", { name: "Trace / norm" }).click();
    await expect(cas.getByRole("tabpanel", { name: "Trace / norm" })).toContainText("trace 1");
    await cas.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("cas-algebra-workspace");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /F @1/ }).click();
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await reopened.getByRole("button", { name: "Inspect saved result" }).click();
    await expect(reopened.getByTestId("cas-finite-field-explorer")).toContainText("defining polynomial coefficients [1, 1, 1]");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    expect(imported.algebraObjects[0].revisions[0]).toEqual(field);
    expect(imported.algebraEvidence).toHaveLength(1);
    expect(imported.algebraEvidence[0].result.selected.frobeniusOrbit).toEqual([[0, 1], [1, 1]]);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
