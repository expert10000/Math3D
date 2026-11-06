import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { closeSurfaceApp, launchSurfaceApp, resetSurfaceAppState,
  type LaunchedSurfaceApp } from "./helpers/surfaceAppHarness";

const core = require(resolve("packages/core/src/index.ts"));

test("SAGE-G04 creates a nonsingular curve, saves doubling and independently reopens it", async () => {
  test.setTimeout(180_000);
  const server = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/health") { res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5",
      available: true, status: "ok", operations: ["sage.ellipticCurve.dossier"] })); return; }
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      const request = JSON.parse(body), curve = request.params.curve.objects.at(-1);
      res.end(JSON.stringify({ engine: "sagemath", engineVersion: "9.5", operation: request.operation,
        success: true, latex: "", warnings: [], result: {
          format: "math3d.sage-elliptic-curve-result", schemaVersion: 1,
          target: request.params.curve.target, targetHash: curve.contentHash,
          baseField: curve.definition.baseField, characteristic: 0,
          discriminant: "-368", jInvariant: "-6912/23", singular: false,
          point: ["0", "1"], doublePoint: ["1/4", "-7/8"],
        } }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Sage mock did not bind.");
  let ctx: LaunchedSurfaceApp | null = null;
  try {
    const surface = core.createSurfaceDocument({ stableKey: "sage-g04-surface", metadata: { title: "Project Surface" }, source: {
      representation: "parametric", domain: { kind: "parameter", u: { min: -1, max: 1, periodic: false },
        v: { min: -1, max: 1, periodic: false } }, units: { length: "unitless" }, orientation: {},
      parameters: {}, branchPolicy: null,
      definition: { familyId: "sage-g04-plane", expressions: { x: "u", y: "v", z: "0" } },
    } });
    const workspace = core.createMixedWorkspaceDocument({ entries: [{ module: "surface", checkpoint: surface,
      expected: surface.identity, replay: null }], activeDocumentIds: [surface.identity.id], results: [],
      artifacts: [], relations: [], committedSelection: null, constructions: [] });
    let project = core.createMath3DProject(workspace, { stableKey: "sage-g04-desktop", title: "Curves" });
    const q = core.createAlgebraObjectRecord({ id: core.createProjectAlgebraObjectId(project.identity.id, "Q"),
      revision: 1, label: "Q", definition: { kind: "rational-field" } });
    project = core.upsertMath3DProjectAlgebraObject(project, q);
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
      await ctx!.page.getByTestId("workspace-nav-number_theory").click();
    };
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(core.serializeMath3DProject(project));
    const theory = ctx.page.getByTestId("number-theory-workspace");
    await theory.getByRole("button", { name: "+ New curve" }).click();
    const builder = theory.getByTestId("cas-elliptic-curve-builder");
    await builder.getByLabel("Curve base field").selectOption(q.id);
    await builder.getByRole("button", { name: "Validate & preview" }).click();
    await expect(builder.getByTestId("cas-elliptic-curve-preview")).toContainText("-368");
    await builder.getByRole("button", { name: "Create and save" }).click();
    await expect(theory.getByTestId("cas-selected-structure")).toContainText("j-invariant");
    await theory.getByRole("button", { name: "Operations", exact: true }).click();
    const operation = theory.getByTestId("cas-object-operation-sage.ellipticCurve.dossier");
    await expect(operation).toContainText("docker route ready");
    await operation.getByRole("button").click();
    await theory.getByLabel("Sample point x, y for doubling; leave blank for invariants only").fill("0, 1");
    await theory.getByRole("button", { name: "Run and save evidence" }).click();
    await expect(theory.getByTestId("cas-object-run-status")).toContainText("Saved Elliptic curve invariants and doubling evidence");
    await expect(theory.getByTestId("cas-evidence-result")).toContainText("-6912/23");
    await theory.getByRole("button", { name: "Back to workspace" }).click();
    await ctx.page.getByTestId("projects-toggle").click();
    await ctx.page.getByTestId("project-explorer-panel").getByTestId("project-save").click();
    const exported = await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1"));
    if (!exported) throw new Error("Project export bytes are missing.");
    await ctx.app.close();
    ctx = await launchSurfaceApp({ MATH3D_SAGE_SERVICE_URL: `http://127.0.0.1:${address.port}` });
    await resetSurfaceAppState(ctx.page);
    await install(exported);
    const reopened = ctx.page.getByTestId("number-theory-workspace");
    await expect(reopened.getByTestId("cas-structures-explorer")).toContainText("E");
    await reopened.getByTestId("cas-structures-explorer").getByRole("button", { name: /^E @1/ }).click();
    await reopened.getByRole("button", { name: "Operations", exact: true }).click();
    await expect(reopened.getByTestId("cas-object-operations")).toContainText("Saved evidence for this structure (1)");
    const imported = core.parseMath3DProject(await ctx.page.evaluate(() => localStorage.getItem("math3d.project.v1")));
    const curve = imported.algebraObjects.find((item: { revisions: { kind: string }[] }) =>
      item.revisions[0].kind === "elliptic-curve").revisions[0];
    expect(curve.definition).toEqual({ kind: "elliptic-curve", baseField: { objectId: q.id, revision: 1 },
      model: "short-weierstrass", a: "-1", b: "1" });
    expect(imported.algebraEvidence[0].result.doublePoint).toEqual(["1/4", "-7/8"]);
  } finally { await closeSurfaceApp(ctx); await new Promise<void>((done) => server.close(() => done())); }
});
